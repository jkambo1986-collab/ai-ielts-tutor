"""Quiz AI endpoints — generate quiz, rephrase explanation."""

from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.ai import service as ai_service


class _GenerateInput(serializers.Serializer):
    difficulty = serializers.ChoiceField(choices=["Easy", "Medium", "Hard"], default="Easy")


class GenerateQuizView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_generate"

    def post(self, request):
        s = _GenerateInput(data=request.data)
        s.is_valid(raise_exception=True)
        quiz = ai_service.generate_quiz(s.validated_data["difficulty"])
        return Response({"quiz": quiz})


class _RephraseInput(serializers.Serializer):
    question = serializers.CharField(max_length=2000)
    original_explanation = serializers.CharField(max_length=4000)


class RephraseExplanationView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_generate"

    def post(self, request):
        s = _RephraseInput(data=request.data)
        s.is_valid(raise_exception=True)
        explanation = ai_service.rephrase_explanation(
            question=s.validated_data["question"],
            original_explanation=s.validated_data["original_explanation"],
        )
        return Response({"explanation": explanation})
