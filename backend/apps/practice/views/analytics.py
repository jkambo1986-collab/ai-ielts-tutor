from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.ai import service as ai_service
from apps.billing import features
from apps.billing.features import requires_feature
from apps.practice.models import (
    SpeakingSession,
    StudyPlan,
    WeaknessAnalysisCache,
    WritingSession,
)
from apps.practice.services import adaptive

WEAKNESS_TTL_DAYS = 7


class AnalyticsOverviewView(APIView):
    """GET /api/analytics/overview?days=7|30 — returns skill estimates + counts."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        days_raw = request.query_params.get("days")
        days = None
        if days_raw and days_raw != "all":
            try:
                days = int(days_raw)
            except ValueError:
                days = None
        return Response(adaptive.overview(request.user, days=days))


class ClearHistoryView(APIView):
    """POST /api/analytics/clear-history — wipes user's session history.
    Optionally scoped to a single skill via { "skill": "writing" }."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.practice.models import (
            ListeningSession,
            ReadingSession,
            SpeakingSession,
            WritingSession,
        )

        skill = request.data.get("skill")
        registry = {
            "writing": WritingSession,
            "speaking": SpeakingSession,
            "reading": ReadingSession,
            "listening": ListeningSession,
        }
        targets = [registry[skill]] if skill in registry else list(registry.values())
        for model in targets:
            model.objects.filter(user=request.user, institute=request.user.institute).delete()
        return Response({"success": True})


class WeaknessAnalysisView(APIView):
    """POST /api/analytics/weakness-analysis?skill=writing|speaking — cached for 7 days."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_analyze"

    @requires_feature(features.FEATURE_WEAKNESS_ANALYSIS)
    def post(self, request):
        skill = request.query_params.get("skill") or request.data.get("skill", "writing")
        if skill not in (WeaknessAnalysisCache.SKILL_WRITING, WeaknessAnalysisCache.SKILL_SPEAKING):
            return Response({"detail": "skill must be 'writing' or 'speaking'."}, status=400)

        cached = (
            WeaknessAnalysisCache.objects.filter(
                user=request.user, institute=request.user.institute, skill=skill,
            )
            .order_by("-created_at")
            .first()
        )
        if cached and cached.expires_at > timezone.now():
            return Response({"analysis": cached.analysis, "cached": True})

        l1 = request.user.native_language or None
        if skill == WeaknessAnalysisCache.SKILL_WRITING:
            history = list(
                WritingSession.objects.filter(user=request.user, institute=request.user.institute)
                .order_by("-created_at")
                .values("feedback")[:10]
            )
            if len(history) < 2:
                return Response({"detail": "Need at least 2 writing sessions."}, status=400)
            analysis = ai_service.analyze_weaknesses(history, native_language=l1)
        else:
            analyses = list(
                SpeakingSession.objects.filter(
                    user=request.user, institute=request.user.institute, analysis__isnull=False,
                )
                .order_by("-created_at")
                .values_list("analysis", flat=True)[:10]
            )
            if len(analyses) < 2:
                return Response({"detail": "Need at least 2 analyzed speaking sessions."}, status=400)
            analysis = ai_service.analyze_speaking_weaknesses(analyses, native_language=l1)

        # Upsert (delete old, insert new — keeps history clean)
        WeaknessAnalysisCache.objects.filter(
            user=request.user, institute=request.user.institute, skill=skill,
        ).delete()
        WeaknessAnalysisCache.objects.create(
            user=request.user, institute=request.user.institute, skill=skill,
            analysis=analysis, expires_at=timezone.now() + timedelta(days=WEAKNESS_TTL_DAYS),
        )
        return Response({"analysis": analysis, "cached": False})


class _ComprehensiveInput(serializers.Serializer):
    estimated_skills = serializers.DictField(required=False)
    writing_weaknesses = serializers.JSONField(required=False, allow_null=True)
    speaking_weaknesses = serializers.JSONField(required=False, allow_null=True)


class ComprehensiveAnalysisView(APIView):
    """POST /api/analytics/comprehensive-analysis — single-paragraph holistic feedback."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_analyze"

    @requires_feature(features.FEATURE_COMPREHENSIVE_ANALYSIS)
    def post(self, request):
        s = _ComprehensiveInput(data=request.data)
        s.is_valid(raise_exception=True)
        # If body is empty, derive from server-side data
        payload = {k: v for k, v in s.validated_data.items() if v is not None} or {
            "estimated_skills": adaptive.overview(request.user)["estimated_skills"],
        }
        result = ai_service.get_comprehensive_analysis(payload)
        return Response({"analysis": result})


class StudyPlanView(APIView):
    """POST /api/analytics/study-plan — 7-day plan derived from current performance."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_generate"

    @requires_feature(features.FEATURE_STUDY_PLAN)
    def post(self, request):
        performance = request.data or {}
        if not performance:
            performance = {
                "estimated_skills": adaptive.overview(request.user)["estimated_skills"],
                "target_score": request.user.target_score,
            }
        plan = ai_service.generate_study_plan(performance)
        StudyPlan.objects.create(
            institute=request.user.institute, user=request.user, plan=plan,
        )
        return Response({"plan": plan})
