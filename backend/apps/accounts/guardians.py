"""F2 — Guardian (parent / sponsor) management.

Endpoints under /api/v1/auth/guardians/* (authenticated student) and a
public read-only viewer at /api/v1/public/guardian/<token>.

Auto-emailing weekly digests is intentionally NOT wired (Railway billing
constraint — would require a cron worker).
"""

from __future__ import annotations

import secrets
from datetime import timedelta
from statistics import mean

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Guardian
from apps.practice.models import (
    ListeningSession,
    ReadingSession,
    SpeakingSession,
    WritingSession,
)


class _GuardianSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guardian
        fields = [
            "id", "name", "email", "relationship",
            "token", "created_at", "revoked_at",
            "last_viewed_at", "view_count",
        ]
        read_only_fields = [
            "id", "token", "created_at", "revoked_at",
            "last_viewed_at", "view_count",
        ]


class GuardiansView(APIView):
    """GET — list student's guardians; POST — create a new one."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Guardian.objects.filter(student=request.user)
        return Response(_GuardianSerializer(qs, many=True).data)

    def post(self, request):
        s = _GuardianSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        guardian = Guardian.objects.create(
            student=request.user,
            name=s.validated_data["name"],
            email=s.validated_data["email"],
            relationship=s.validated_data.get("relationship", ""),
            token=secrets.token_urlsafe(32),
        )
        return Response(_GuardianSerializer(guardian).data, status=status.HTTP_201_CREATED)


class GuardianRevokeView(APIView):
    """POST — revoke a guardian's access."""
    permission_classes = [IsAuthenticated]

    def post(self, request, guardian_id):
        guardian = get_object_or_404(
            Guardian, id=guardian_id, student=request.user, revoked_at__isnull=True,
        )
        guardian.revoked_at = timezone.now()
        guardian.save(update_fields=["revoked_at"])
        return Response({"revoked": True})


class GuardianPublicView(APIView):
    """GET — public read-only progress snapshot. Token-gated. No auth.

    Returns aggregates only — no transcripts, essays, or chat content.
    """
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, token):
        guardian = get_object_or_404(Guardian, token=token, revoked_at__isnull=True)
        student = guardian.student

        # Bump usage counters (best-effort).
        Guardian.objects.filter(pk=guardian.pk).update(
            view_count=guardian.view_count + 1,
            last_viewed_at=timezone.now(),
        )

        cutoff = timezone.now() - timedelta(days=30)

        def _bands_writing():
            return [
                float(b) for b in WritingSession.objects.filter(
                    user=student, deleted_at__isnull=True,
                    created_at__gte=cutoff, band_score__isnull=False,
                ).values_list("band_score", flat=True)
            ]

        def _bands_speaking():
            out = []
            for a in SpeakingSession.objects.filter(
                user=student, deleted_at__isnull=True,
                created_at__gte=cutoff, analysis__isnull=False,
            ).values_list("analysis", flat=True):
                if isinstance(a, dict) and a.get("overallBandScore") is not None:
                    try:
                        out.append(float(a["overallBandScore"]))
                    except (TypeError, ValueError):
                        pass
            return out

        def _bands_reading():
            return [
                float(b) for b in ReadingSession.objects.filter(
                    user=student, deleted_at__isnull=True,
                    created_at__gte=cutoff, band_score__isnull=False,
                ).values_list("band_score", flat=True)
            ]

        def _bands_listening():
            return [
                float(b) for b in ListeningSession.objects.filter(
                    user=student, deleted_at__isnull=True,
                    created_at__gte=cutoff, band_score__isnull=False,
                ).values_list("band_score", flat=True)
            ]

        def _avg(xs):
            return round(mean(xs), 1) if xs else None

        writing = _bands_writing()
        speaking = _bands_speaking()
        reading = _bands_reading()
        listening = _bands_listening()

        sessions_30d = (
            WritingSession.objects.filter(user=student, deleted_at__isnull=True, created_at__gte=cutoff).count()
            + SpeakingSession.objects.filter(user=student, deleted_at__isnull=True, created_at__gte=cutoff).count()
            + ReadingSession.objects.filter(user=student, deleted_at__isnull=True, created_at__gte=cutoff).count()
            + ListeningSession.objects.filter(user=student, deleted_at__isnull=True, created_at__gte=cutoff).count()
        )

        return Response({
            "student_name": student.first_name or student.username,
            "target_band": float(student.target_score) if student.target_score else None,
            "exam_date": student.exam_date.isoformat() if student.exam_date else None,
            "daily_commitment_minutes": student.daily_commitment_minutes,
            "last_30_days": {
                "sessions_completed": sessions_30d,
                "avg_band": {
                    "writing": _avg(writing),
                    "speaking": _avg(speaking),
                    "reading": _avg(reading),
                    "listening": _avg(listening),
                },
            },
            "guardian": {
                "name": guardian.name,
                "relationship": guardian.relationship,
            },
            "generated_at": timezone.now().isoformat(),
        })
