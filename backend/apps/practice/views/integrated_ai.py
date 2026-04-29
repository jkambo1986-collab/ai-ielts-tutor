"""Integrated Skills Lab — task generation, summary eval, synthesis eval."""

from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.ai import service as ai_service
from apps.billing import features
from apps.billing.features import requires_feature

INTEGRATED_TASK_TYPES = ["ListenSummarize", "ReadSpeak", "ReadListenWrite"]


class _TaskInput(serializers.Serializer):
    task_type = serializers.ChoiceField(choices=INTEGRATED_TASK_TYPES)
    target_score = serializers.FloatField(required=False, allow_null=True, min_value=1.0, max_value=9.0)


class GenerateIntegratedTaskView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_generate"

    @requires_feature(features.FEATURE_INTEGRATED_SKILLS)
    def post(self, request):
        s = _TaskInput(data=request.data)
        s.is_valid(raise_exception=True)
        task = ai_service.generate_integrated_task(
            task_type=s.validated_data["task_type"],
            target_score=s.validated_data.get("target_score"),
        )
        return Response({"task": task})


class _SummaryInput(serializers.Serializer):
    lecture_script = serializers.CharField(min_length=20, max_length=20000)
    summary = serializers.CharField(min_length=20, max_length=8000)


class EvaluateSummaryView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_analyze"

    @requires_feature(features.FEATURE_INTEGRATED_SKILLS)
    def post(self, request):
        s = _SummaryInput(data=request.data)
        s.is_valid(raise_exception=True)
        evaluation = ai_service.evaluate_summary(
            lecture_script=s.validated_data["lecture_script"],
            summary=s.validated_data["summary"],
        )
        return Response({"evaluation": evaluation})


class _SynthesisInput(serializers.Serializer):
    passage = serializers.CharField(min_length=20, max_length=20000)
    lecture_script = serializers.CharField(min_length=20, max_length=20000)
    writing_response = serializers.CharField(min_length=20, max_length=10000)


class EvaluateSynthesisView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_analyze"

    @requires_feature(features.FEATURE_INTEGRATED_SKILLS)
    def post(self, request):
        s = _SynthesisInput(data=request.data)
        s.is_valid(raise_exception=True)
        evaluation = ai_service.evaluate_synthesis(
            passage=s.validated_data["passage"],
            lecture_script=s.validated_data["lecture_script"],
            writing_response=s.validated_data["writing_response"],
        )
        return Response({"evaluation": evaluation})
