"""
Cohort benchmarking endpoint (#23).

Aggregates band averages at three scopes and returns them to admins:
  - User's own (for context)
  - Their institute (across all users)
  - Platform-wide (across institutes)
  - Same-L1 cohort (same native_language across the platform)

For privacy: only admins (institute_admin / super_admin) can call this.
We never return per-user breakdowns; only aggregates with a sample count.
"""

from __future__ import annotations

from datetime import timedelta
from statistics import mean

from django.db.models import Avg, Count, Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.practice.models import (
    ListeningSession,
    ReadingSession,
    SpeakingSession,
    WritingSession,
)


class CohortBenchmarkView(APIView):
    """GET /api/v1/analytics/cohort — admin-only cohort benchmarks."""

    permission_classes = [IsAuthenticated]

    MIN_COHORT_SIZE = 5  # Hide small cohorts to protect privacy.

    def get(self, request):
        user = request.user
        if user.role not in (User.ROLE_INSTITUTE_ADMIN, User.ROLE_SUPER_ADMIN):
            return Response({"detail": "Admin only."}, status=403)

        cutoff = timezone.now() - timedelta(days=90)

        def _writing_avg(qs):
            row = qs.filter(deleted_at__isnull=True, created_at__gte=cutoff).aggregate(
                avg=Avg("band_score"), n=Count("id"),
            )
            avg = float(row["avg"]) if row["avg"] is not None else None
            return avg, row["n"]

        def _speaking_avg(qs):
            sessions = qs.filter(
                deleted_at__isnull=True, created_at__gte=cutoff, analysis__isnull=False,
            ).values_list("analysis", flat=True)
            scores = [
                float(a["overallBandScore"])
                for a in sessions
                if a and a.get("overallBandScore") is not None
            ]
            return (round(mean(scores), 2) if scores else None), len(scores)

        institute = user.institute

        # Scope A: this user
        own_writing = _writing_avg(WritingSession.objects.filter(user=user))
        own_speaking = _speaking_avg(SpeakingSession.objects.filter(user=user))

        # Scope B: institute-wide
        inst_writing = _writing_avg(WritingSession.objects.filter(institute=institute)) if institute else (None, 0)
        inst_speaking = _speaking_avg(SpeakingSession.objects.filter(institute=institute)) if institute else (None, 0)

        # Scope C: platform
        plat_writing = _writing_avg(WritingSession.objects.all())
        plat_speaking = _speaking_avg(SpeakingSession.objects.all())

        # Scope D: same-L1 cohort
        l1_cohort = None
        if user.native_language:
            same_l1_users = User.objects.filter(native_language=user.native_language)
            l1_writing = _writing_avg(WritingSession.objects.filter(user__in=same_l1_users))
            l1_speaking = _speaking_avg(SpeakingSession.objects.filter(user__in=same_l1_users))
            cohort_n = same_l1_users.count()
            if cohort_n >= self.MIN_COHORT_SIZE:
                l1_cohort = {
                    "language": user.native_language,
                    "cohort_size": cohort_n,
                    "writing": {"avg": l1_writing[0], "n": l1_writing[1]},
                    "speaking": {"avg": l1_speaking[0], "n": l1_speaking[1]},
                }

        # Hide sub-MIN_COHORT_SIZE aggregates.
        def _gate(avg_n):
            avg, n = avg_n
            return {"avg": avg if n >= self.MIN_COHORT_SIZE else None, "n": n}

        return Response({
            "you": {
                "writing": {"avg": own_writing[0], "n": own_writing[1]},
                "speaking": {"avg": own_speaking[0], "n": own_speaking[1]},
            },
            "institute": {
                "slug": institute.slug if institute else None,
                "writing": _gate(inst_writing),
                "speaking": _gate(inst_speaking),
            },
            "platform": {
                "writing": _gate(plat_writing),
                "speaking": _gate(plat_speaking),
            },
            "same_l1_cohort": l1_cohort,
            "lookback_days": 90,
            "min_cohort_size": self.MIN_COHORT_SIZE,
        })
