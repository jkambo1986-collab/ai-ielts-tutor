"""Writing AI endpoints — calls Gemini, persists session row where applicable."""

from rest_framework import serializers, status
from rest_framework.decorators import throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.ai import service as ai_service
from apps.ai.context import build_for_user
from apps.billing import features
from apps.billing.features import requires_feature
from apps.practice.models import VocabularyObservation, WritingSession
from apps.practice.services.bands import writing_quality_score
from apps.practice.services.error_cards import extract_from_writing_feedback
from apps.practice.services.vocab import extract_lemmas


class _AIThrottle(ScopedRateThrottle):
    pass


class _EvaluateInput(serializers.Serializer):
    prompt = serializers.CharField(min_length=10, max_length=2000)
    essay = serializers.CharField(min_length=50, max_length=10000)
    target_score = serializers.FloatField(required=False, allow_null=True, min_value=1.0, max_value=9.0)
    # New optional fields surfaced by the dashboard's per-task split (#14),
    # quality metric (#18), confidence calibration (#25), and re-attempt (#21).
    task_type = serializers.ChoiceField(choices=["task1", "task2"], required=False, default="task2")
    duration_seconds = serializers.IntegerField(required=False, min_value=0, default=0)
    predicted_band = serializers.FloatField(required=False, allow_null=True, min_value=1.0, max_value=9.0)
    parent_session_id = serializers.UUIDField(required=False, allow_null=True)


class EvaluateWritingView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [_AIThrottle]
    throttle_scope = "ai_analyze"

    def post(self, request):
        s = _EvaluateInput(data=request.data)
        s.is_valid(raise_exception=True)
        feedback = ai_service.evaluate_writing(
            prompt=s.validated_data["prompt"],
            essay=s.validated_data["essay"],
            target_score=s.validated_data.get("target_score"),
            ctx=build_for_user(request.user),
        )

        essay = s.validated_data["essay"]
        word_count = len(essay.split())
        duration = int(s.validated_data.get("duration_seconds") or 0)
        quality = writing_quality_score(
            word_count=word_count,
            duration_seconds=duration,
            has_feedback=bool(feedback),
        )

        # Re-attempt link (#21): validate parent belongs to same user.
        parent = None
        parent_id = s.validated_data.get("parent_session_id")
        if parent_id:
            parent = WritingSession.objects.filter(
                id=parent_id, user=request.user, institute=request.user.institute,
            ).first()

        session = WritingSession.objects.create(
            institute=request.user.institute,
            user=request.user,
            prompt=s.validated_data["prompt"],
            essay=essay,
            band_score=feedback.get("bandScore", 0),
            feedback=feedback,
            task_type=s.validated_data.get("task_type", "task2"),
            duration_seconds=duration,
            quality_score=quality,
            predicted_band=s.validated_data.get("predicted_band"),
            parent_session=parent,
        )

        # Calibration entry (#25)
        if s.validated_data.get("predicted_band") is not None:
            from apps.practice.models import CalibrationEntry
            actual = float(session.band_score)
            predicted = float(s.validated_data["predicted_band"])
            CalibrationEntry.objects.create(
                user=request.user, institute=request.user.institute,
                session_type="writing", session_id=session.id,
                predicted_band=predicted, actual_band=actual,
                delta=predicted - actual,
            )

        # Auto-extract SRS error cards from feedback — best-effort.
        # Without this the SRS queue stays empty for nearly all real users
        # because there's no UI flow that asks "save this as a card?".
        extract_from_writing_feedback(
            user=request.user,
            institute=request.user.institute,
            session_id=session.id,
            feedback=feedback,
        )

        # Vocabulary ingestion (#19) — best-effort, never block on failure.
        try:
            lemmas = extract_lemmas(essay)
            for item in lemmas:
                obs, created = VocabularyObservation.objects.get_or_create(
                    user=request.user, lemma=item["lemma"],
                    defaults={
                        "institute": request.user.institute,
                        "cefr_level": item["cefr_level"],
                        "is_awl": item["is_awl"],
                        "last_session_type": "writing",
                        "last_session_id": session.id,
                    },
                )
                if not created:
                    obs.frequency += 1
                    obs.last_session_type = "writing"
                    obs.last_session_id = session.id
                    if item["cefr_level"] and not obs.cefr_level:
                        obs.cefr_level = item["cefr_level"]
                    if item["is_awl"] and not obs.is_awl:
                        obs.is_awl = True
                    obs.save(update_fields=[
                        "frequency", "cefr_level", "is_awl",
                        "last_session_type", "last_session_id", "last_seen_at",
                    ])
        except Exception:
            pass

        return Response(
            {"session_id": str(session.id), "feedback": feedback, "band_score": session.band_score},
            status=status.HTTP_201_CREATED,
        )


class _PlanInput(serializers.Serializer):
    prompt = serializers.CharField(min_length=10, max_length=2000)
    user_ideas = serializers.CharField(min_length=1, max_length=2000)


class EssayPlanView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [_AIThrottle]
    throttle_scope = "ai_generate"

    def post(self, request):
        s = _PlanInput(data=request.data)
        s.is_valid(raise_exception=True)
        plan = ai_service.generate_essay_plan(
            prompt=s.validated_data["prompt"],
            user_ideas=s.validated_data["user_ideas"],
            ctx=build_for_user(request.user),
        )
        return Response({"plan": plan})


class _CohesionInput(serializers.Serializer):
    prompt = serializers.CharField(min_length=10, max_length=2000)
    essay = serializers.CharField(min_length=50, max_length=10000)


class CohesionAnalysisView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [_AIThrottle]
    throttle_scope = "ai_analyze"

    @requires_feature(features.FEATURE_COHESION_MAPPER)
    def post(self, request):
        s = _CohesionInput(data=request.data)
        s.is_valid(raise_exception=True)
        cohesion_map = ai_service.analyze_cohesion(
            prompt=s.validated_data["prompt"],
            essay=s.validated_data["essay"],
            ctx=build_for_user(request.user),
        )
        return Response({"map": cohesion_map})


class ContextualWritingPromptsView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [_AIThrottle]
    throttle_scope = "ai_generate"

    @requires_feature(features.FEATURE_CONTEXTUAL_PROMPTS)
    def get(self, request):
        from apps.practice.models import ListeningSession, ReadingSession

        reading = list(
            ReadingSession.objects.filter(user=request.user, institute=request.user.institute)
            .order_by("-created_at")
            .values("passage_title")[:5]
        )
        listening = list(
            ListeningSession.objects.filter(user=request.user, institute=request.user.institute)
            .order_by("-created_at")
            .values("title")[:5]
        )
        prompts = ai_service.generate_contextual_writing_prompts(
            reading, listening, ctx=build_for_user(request.user),
        )
        return Response({"prompts": prompts})
