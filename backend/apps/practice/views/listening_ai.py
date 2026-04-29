"""Listening AI endpoints — generate test, evaluate answer, submit session."""

from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.ai import service as ai_service
from apps.practice.models import ListeningSession

LISTENING_TYPES = ["Dialogue", "Monologue", "Lecture"]


class _TestInput(serializers.Serializer):
    test_type = serializers.ChoiceField(choices=LISTENING_TYPES, default="Dialogue")
    target_score = serializers.FloatField(required=False, allow_null=True, min_value=1.0, max_value=9.0)


class GenerateListeningTestView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_generate"

    def post(self, request):
        s = _TestInput(data=request.data)
        s.is_valid(raise_exception=True)
        test = ai_service.generate_listening_test(
            target_score=s.validated_data.get("target_score"),
            test_type=s.validated_data["test_type"],
        )
        return Response({"test": test})


class _EvaluateAnswerInput(serializers.Serializer):
    script = serializers.ListField(child=serializers.DictField(), min_length=1)
    question = serializers.CharField(max_length=2000)
    options = serializers.ListField(child=serializers.CharField(max_length=500), min_length=2, max_length=8)
    user_answer = serializers.CharField(max_length=10)
    correct_answer = serializers.CharField(max_length=10)


class EvaluateListeningAnswerView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_analyze"

    def post(self, request):
        s = _EvaluateAnswerInput(data=request.data)
        s.is_valid(raise_exception=True)
        evaluation = ai_service.evaluate_listening_answer(
            script=s.validated_data["script"],
            question=s.validated_data["question"],
            options=s.validated_data["options"],
            user_answer=s.validated_data["user_answer"],
            correct_answer=s.validated_data["correct_answer"],
        )
        return Response({"evaluation": evaluation})


class _SubmitSessionInput(serializers.Serializer):
    score = serializers.IntegerField(min_value=0)
    total_questions = serializers.IntegerField(min_value=1)
    title = serializers.CharField(required=False, allow_blank=True, max_length=300)
    duration_seconds = serializers.IntegerField(required=False, min_value=0, default=0)
    predicted_band = serializers.FloatField(required=False, allow_null=True, min_value=1.0, max_value=9.0)


class SubmitListeningSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.practice.models import CalibrationEntry
        from apps.practice.services.bands import listening_band, reading_listening_quality_score

        s = _SubmitSessionInput(data=request.data)
        s.is_valid(raise_exception=True)
        score = s.validated_data["score"]
        total = s.validated_data["total_questions"]
        duration = int(s.validated_data.get("duration_seconds") or 0)
        band = listening_band(score, total)
        quality = reading_listening_quality_score(total_questions=total, duration_seconds=duration)
        session = ListeningSession.objects.create(
            institute=request.user.institute,
            user=request.user,
            score=score,
            total_questions=total,
            title=s.validated_data.get("title", ""),
            band_score=band,
            duration_seconds=duration,
            quality_score=quality,
            predicted_band=s.validated_data.get("predicted_band"),
        )
        if s.validated_data.get("predicted_band") is not None:
            CalibrationEntry.objects.create(
                user=request.user, institute=request.user.institute,
                session_type="listening", session_id=session.id,
                predicted_band=s.validated_data["predicted_band"],
                actual_band=band,
                delta=s.validated_data["predicted_band"] - band,
            )
        return Response(
            {"session_id": str(session.id), "band_score": band, "quality_score": quality},
            status=status.HTTP_201_CREATED,
        )
