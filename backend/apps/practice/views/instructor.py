"""
Instructor analytics workspace (Hard 1).

The single biggest unlock for our B2B value prop. Three endpoints:

  GET  /instructor/roster        — list of students in the institute with
                                    last-active + current band per skill +
                                    regression flag + due-card backlog.
  GET  /instructor/students/<id> — drill-down on a single student.
  GET  /instructor/digest        — weekly aggregation: who's struggling,
                                    who's improving, queue length.

Gated to ROLE_INSTRUCTOR + ROLE_INSTITUTE_ADMIN + ROLE_SUPER_ADMIN.
Cross-tenant queries are NOT allowed (a super admin must hit per-institute
endpoints separately).
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import Avg, Count, Max, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User


def _is_instructor(user) -> bool:
    return user.role in (
        User.ROLE_INSTRUCTOR,
        User.ROLE_INSTITUTE_ADMIN,
        User.ROLE_SUPER_ADMIN,
    )


class InstructorRosterView(APIView):
    """GET /api/v1/admin/instructor/roster — institute-wide roster.

    For each student: last-active, current band per skill, regression
    flag (orange when -0.5 over 30 days), due SRS cards. Sortable client-
    side; we just emit the full payload (capped at 200 students).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_instructor(request.user):
            return Response({"detail": "Instructor or admin only."}, status=403)
        from apps.practice.models import (
            ErrorCard,
            ListeningSession,
            ReadingSession,
            SpeakingSession,
            WritingSession,
        )

        students = list(
            User.objects.filter(
                institute=request.user.institute,
                role=User.ROLE_STUDENT,
                deleted_at__isnull=True,
            ).order_by("-last_login")[:200]
        )

        rows = []
        for s in students:
            # Latest band per skill (best-effort).
            latest_writing = (
                WritingSession.objects.filter(user=s, deleted_at__isnull=True)
                .order_by("-created_at").values_list("band_score", flat=True).first()
            )
            latest_reading = (
                ReadingSession.objects.filter(user=s, deleted_at__isnull=True)
                .order_by("-created_at").values_list("band_score", flat=True).first()
            )
            latest_listening = (
                ListeningSession.objects.filter(user=s, deleted_at__isnull=True)
                .order_by("-created_at").values_list("band_score", flat=True).first()
            )
            speaking_analysis = (
                SpeakingSession.objects.filter(
                    user=s, deleted_at__isnull=True, analysis__isnull=False,
                )
                .order_by("-created_at").values_list("analysis", flat=True).first()
            )
            latest_speaking = None
            if isinstance(speaking_analysis, dict):
                try:
                    v = speaking_analysis.get("overallBandScore")
                    if v is not None:
                        latest_speaking = float(v)
                except (TypeError, ValueError):
                    pass

            # Regression: writing 30-day average vs latest.
            regression = False
            cutoff = timezone.now() - timedelta(days=30)
            if latest_writing is not None:
                avg = (
                    WritingSession.objects.filter(
                        user=s, deleted_at__isnull=True, created_at__gte=cutoff,
                    ).aggregate(a=Avg("band_score")).get("a")
                )
                if avg is not None and float(latest_writing) <= float(avg) - 0.5:
                    regression = True

            due = ErrorCard.objects.filter(
                user=s, archived_at__isnull=True, due_at__lte=timezone.now(),
            ).count()

            last_session = max(filter(None, [
                WritingSession.objects.filter(user=s, deleted_at__isnull=True).order_by("-created_at").values_list("created_at", flat=True).first(),
                SpeakingSession.objects.filter(user=s, deleted_at__isnull=True).order_by("-created_at").values_list("created_at", flat=True).first(),
                ReadingSession.objects.filter(user=s, deleted_at__isnull=True).order_by("-created_at").values_list("created_at", flat=True).first(),
                ListeningSession.objects.filter(user=s, deleted_at__isnull=True).order_by("-created_at").values_list("created_at", flat=True).first(),
            ]), default=None)

            rows.append({
                "id": str(s.id),
                "name": s.name or s.email,
                "email": s.email,
                "target": float(s.target_score) if s.target_score else None,
                "latest": {
                    "writing": float(latest_writing) if latest_writing is not None else None,
                    "speaking": latest_speaking,
                    "reading": float(latest_reading) if latest_reading is not None else None,
                    "listening": float(latest_listening) if latest_listening is not None else None,
                },
                "regression_flag": regression,
                "due_srs_cards": due,
                "last_session_at": last_session.isoformat() if last_session else None,
                "is_pro": s.is_pro,
            })
        return Response({"students": rows, "count": len(rows)})


class InstructorStudentDrilldownView(APIView):
    """GET /api/v1/admin/instructor/students/<id> — full per-student panel.

    Returns recent sessions + cached weakness analyses + active error
    cards + recent calibrations. Same-institute restriction is enforced.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, student_id):
        if not _is_instructor(request.user):
            return Response({"detail": "Instructor or admin only."}, status=403)
        student = get_object_or_404(
            User, id=student_id, institute=request.user.institute, deleted_at__isnull=True,
        )
        from apps.practice.models import (
            CalibrationEntry,
            ErrorCard,
            SpeakingSession,
            WeaknessAnalysisCache,
            WritingSession,
        )
        recent_writing = list(
            WritingSession.objects.filter(user=student, deleted_at__isnull=True)
            .order_by("-created_at")
            .values("id", "band_score", "created_at", "task_type")[:10]
        )
        recent_speaking = list(
            SpeakingSession.objects.filter(user=student, deleted_at__isnull=True)
            .order_by("-created_at")
            .values("id", "analysis", "created_at", "mode")[:10]
        )
        weaknesses = list(
            WeaknessAnalysisCache.objects.filter(
                user=student, expires_at__gt=timezone.now(),
            ).values("skill", "analysis")
        )
        active_cards = list(
            ErrorCard.objects.filter(user=student, archived_at__isnull=True)
            .order_by("due_at")
            .values("id", "category", "error_text", "due_at")[:50]
        )
        recent_calibrations = list(
            CalibrationEntry.objects.filter(user=student)
            .order_by("-created_at")
            .values("session_type", "predicted_band", "actual_band", "delta", "created_at")[:20]
        )

        for r in recent_writing:
            r["id"] = str(r["id"])
            r["created_at"] = r["created_at"].isoformat()
            r["band_score"] = float(r["band_score"]) if r["band_score"] is not None else None
        for r in recent_speaking:
            r["id"] = str(r["id"])
            r["created_at"] = r["created_at"].isoformat()
        for r in active_cards:
            r["id"] = str(r["id"])
            r["due_at"] = r["due_at"].isoformat()
        for r in recent_calibrations:
            r["created_at"] = r["created_at"].isoformat()
            for k in ("predicted_band", "actual_band", "delta"):
                if r.get(k) is not None:
                    r[k] = float(r[k])

        return Response({
            "student": {
                "id": str(student.id),
                "name": student.name or student.email,
                "email": student.email,
                "target": float(student.target_score) if student.target_score else None,
                "native_language": student.native_language,
                "exam_date": student.exam_date.isoformat() if student.exam_date else None,
            },
            "recent_writing": recent_writing,
            "recent_speaking": recent_speaking,
            "weaknesses": weaknesses,
            "active_error_cards": active_cards,
            "recent_calibrations": recent_calibrations,
        })


class InstructorDigestView(APIView):
    """GET /api/v1/admin/instructor/digest — weekly summary across the institute.

    Three buckets:
      - struggling: students with ≥1 regression flag in the last 30 days
      - improving: students whose 7-day avg is > 14-day avg by 0.5+
      - inactive: students with no session in 14+ days
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_instructor(request.user):
            return Response({"detail": "Instructor or admin only."}, status=403)
        from apps.practice.models import DashboardAlert, WritingSession

        inst = request.user.institute
        cutoff_30 = timezone.now() - timedelta(days=30)
        cutoff_7 = timezone.now() - timedelta(days=7)
        cutoff_14 = timezone.now() - timedelta(days=14)

        struggling = list(
            DashboardAlert.objects.filter(
                institute=inst,
                alert_type=DashboardAlert.TYPE_REGRESSION,
                created_at__gte=cutoff_30,
                dismissed_at__isnull=True,
            ).values("user__id", "user__email", "title", "body", "created_at")[:50]
        )
        for s in struggling:
            s["created_at"] = s["created_at"].isoformat()
            s["user_id"] = str(s.pop("user__id"))
            s["email"] = s.pop("user__email")

        # Improving: simple proxy — students with ≥3 writing sessions in last
        # 7 days whose mean band exceeds their 14-day mean by 0.5+.
        improving = []
        for u in User.objects.filter(institute=inst, role=User.ROLE_STUDENT)[:500]:
            recent7 = list(
                WritingSession.objects.filter(user=u, created_at__gte=cutoff_7)
                .values_list("band_score", flat=True)
            )
            recent14 = list(
                WritingSession.objects.filter(user=u, created_at__gte=cutoff_14)
                .values_list("band_score", flat=True)
            )
            if len(recent7) >= 3 and len(recent14) >= 3:
                a7 = sum(float(b) for b in recent7) / len(recent7)
                a14 = sum(float(b) for b in recent14) / len(recent14)
                if a7 - a14 >= 0.5:
                    improving.append({
                        "user_id": str(u.id),
                        "email": u.email,
                        "delta": round(a7 - a14, 2),
                    })

        inactive_count = 0
        from apps.practice.models import (
            ListeningSession, ReadingSession, SpeakingSession,
        )
        for u in User.objects.filter(institute=inst, role=User.ROLE_STUDENT)[:500]:
            seen = any(
                m.objects.filter(user=u, created_at__gte=cutoff_14, deleted_at__isnull=True).exists()
                for m in (WritingSession, SpeakingSession, ReadingSession, ListeningSession)
            )
            if not seen:
                inactive_count += 1

        return Response({
            "window_days": 7,
            "struggling": struggling,
            "improving": improving,
            "inactive_count": inactive_count,
        })
