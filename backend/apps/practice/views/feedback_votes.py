"""
Feedback-vote endpoints (UI 5 / Hard 3 RLHF).

Two surfaces:
  - POST /analytics/feedback-votes — student submits a thumbs-up/down on
    a piece of AI feedback.
  - GET /admin/feedback-quality   — admin/instructor aggregation of the
    last 30 days. (Hard 3)
"""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.practice.models import FeedbackVote


class _VoteInput(serializers.Serializer):
    agent = serializers.CharField(max_length=64)
    criterion = serializers.CharField(required=False, allow_blank=True, max_length=64, default="")
    target_id = serializers.UUIDField(required=False, allow_null=True)
    helpful = serializers.BooleanField()
    reason = serializers.ChoiceField(
        choices=[c[0] for c in FeedbackVote.REASON_CHOICES],
        required=False, allow_blank=True, default="",
    )
    note = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")


class FeedbackVoteView(APIView):
    """POST /api/v1/analytics/feedback-votes — record a single vote."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = _VoteInput(data=request.data)
        s.is_valid(raise_exception=True)
        vote = FeedbackVote.objects.create(
            user=request.user,
            institute=request.user.institute,
            agent=s.validated_data["agent"],
            criterion=s.validated_data.get("criterion", ""),
            target_id=s.validated_data.get("target_id"),
            helpful=s.validated_data["helpful"],
            reason=s.validated_data.get("reason", ""),
            note=s.validated_data.get("note", ""),
        )
        return Response({"id": str(vote.id), "ok": True}, status=201)


class FeedbackQualityView(APIView):
    """GET /api/v1/admin/feedback-quality — aggregation for prompt-quality
    monitoring (Hard 3). Institute admins see their tenant's aggregation;
    super admins see all.

    Returns: per-(agent, criterion) counts, helpfulness rate, and the top
    reasons cited on Not-Helpful votes.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in (User.ROLE_INSTITUTE_ADMIN, User.ROLE_SUPER_ADMIN):
            return Response({"detail": "Admin only."}, status=403)
        cutoff = timezone.now() - timedelta(days=30)
        qs = FeedbackVote.objects.filter(created_at__gte=cutoff)
        if request.user.role != User.ROLE_SUPER_ADMIN:
            qs = qs.filter(institute=request.user.institute)
        groups = (
            qs.values("agent", "criterion")
            .annotate(
                total=Count("id"),
                helpful=Count("id", filter=Q(helpful=True)),
                not_helpful=Count("id", filter=Q(helpful=False)),
            )
            .order_by("-total")[:50]
        )
        rows = []
        for g in groups:
            total = g["total"] or 1
            rate = g["helpful"] / total
            # Top reasons on Not-Helpful votes for this group.
            reasons = (
                qs.filter(agent=g["agent"], criterion=g["criterion"], helpful=False)
                .exclude(reason="")
                .values("reason").annotate(c=Count("id")).order_by("-c")[:5]
            )
            rows.append({
                "agent": g["agent"],
                "criterion": g["criterion"],
                "total": g["total"],
                "helpful": g["helpful"],
                "not_helpful": g["not_helpful"],
                "helpfulness_rate": round(rate, 3),
                "top_not_helpful_reasons": [
                    {"reason": r["reason"], "count": r["c"]} for r in reasons
                ],
            })
        return Response({"window_days": 30, "groups": rows})
