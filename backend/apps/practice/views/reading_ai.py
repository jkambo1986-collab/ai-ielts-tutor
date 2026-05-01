"""Reading AI endpoints — generate test, evaluate answer, submit session."""

from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.ai import service as ai_service
from apps.ai.context import build_for_user
from apps.practice.models import ReadingSession

READING_TYPES = ["Short Passage", "Full Passage", "Vocabulary Focus"]


class _TestInput(serializers.Serializer):
    test_type = serializers.ChoiceField(choices=READING_TYPES, default="Full Passage")
    target_score = serializers.FloatField(required=False, allow_null=True, min_value=1.0, max_value=9.0)


class GenerateReadingTestView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_generate"

    def post(self, request):
        s = _TestInput(data=request.data)
        s.is_valid(raise_exception=True)
        test = ai_service.generate_reading_test(
            target_score=s.validated_data.get("target_score"),
            test_type=s.validated_data["test_type"],
            ctx=build_for_user(request.user),
        )
        return Response({"test": test})


class _EvaluateAnswerInput(serializers.Serializer):
    passage = serializers.CharField(min_length=20, max_length=20000)
    question = serializers.CharField(max_length=2000)
    options = serializers.ListField(child=serializers.CharField(max_length=500), min_length=2, max_length=8)
    # Some Gemini outputs put full option text (not just A/B/C/D) into the
    # answer field; widen so we don't 400 on those.
    user_answer = serializers.CharField(max_length=500)
    correct_answer = serializers.CharField(max_length=500)


class EvaluateReadingAnswerView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_analyze"

    def post(self, request):
        s = _EvaluateAnswerInput(data=request.data)
        s.is_valid(raise_exception=True)
        evaluation = ai_service.evaluate_reading_answer(
            passage=s.validated_data["passage"],
            question=s.validated_data["question"],
            options=s.validated_data["options"],
            user_answer=s.validated_data["user_answer"],
            correct_answer=s.validated_data["correct_answer"],
            ctx=build_for_user(request.user),
        )
        return Response({"evaluation": evaluation})


class _SubmitSessionInput(serializers.Serializer):
    score = serializers.IntegerField(min_value=0)
    total_questions = serializers.IntegerField(min_value=1)
    passage_title = serializers.CharField(required=False, allow_blank=True, max_length=300)
    duration_seconds = serializers.IntegerField(required=False, min_value=0, default=0)
    predicted_band = serializers.FloatField(required=False, allow_null=True, min_value=1.0, max_value=9.0)


class SubmitReadingSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.practice.models import CalibrationEntry
        from apps.practice.services.bands import reading_band, reading_listening_quality_score

        s = _SubmitSessionInput(data=request.data)
        s.is_valid(raise_exception=True)
        score = s.validated_data["score"]
        total = s.validated_data["total_questions"]
        duration = int(s.validated_data.get("duration_seconds") or 0)
        band = reading_band(score, total)
        quality = reading_listening_quality_score(total_questions=total, duration_seconds=duration)
        session = ReadingSession.objects.create(
            institute=request.user.institute,
            user=request.user,
            score=score,
            total_questions=total,
            passage_title=s.validated_data.get("passage_title", ""),
            band_score=band,
            duration_seconds=duration,
            quality_score=quality,
            predicted_band=s.validated_data.get("predicted_band"),
        )
        if s.validated_data.get("predicted_band") is not None:
            CalibrationEntry.objects.create(
                user=request.user, institute=request.user.institute,
                session_type="reading", session_id=session.id,
                predicted_band=s.validated_data["predicted_band"],
                actual_band=band,
                delta=s.validated_data["predicted_band"] - band,
            )
        return Response(
            {"session_id": str(session.id), "band_score": band, "quality_score": quality},
            status=status.HTTP_201_CREATED,
        )
