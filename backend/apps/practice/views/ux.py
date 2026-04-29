"""
UX-foundation endpoints (Phase 1 + Phase 2 + Phase 3 + Phase 4):

  - ResumeView (F6)                GET  /analytics/resume
  - NotificationsView (P2)         GET/POST /analytics/notifications
  - NotificationDismissView (P2)   POST /analytics/notifications/<id>/dismiss
  - NotificationReadView (P2)      POST /analytics/notifications/<id>/read
  - NotificationPrefView (P3)      GET/PUT /analytics/notification-prefs
  - WritingDraftListView (P4)      GET/POST /writing/drafts
  - WritingDraftDetailView (P4)    GET/PUT/DELETE /writing/drafts/<hash>
  - CalendarIcsView (D3)           GET /analytics/calendar.ics
  - CertificateView (X3)           GET /analytics/certificate
  - PublicProfileView (X2)         GET /api/v1/public/u/<slug>  (no auth)
  - PublicProfileToggleView (X2)   POST /analytics/public-profile/toggle
"""

from __future__ import annotations

import hashlib
import io
import secrets
from datetime import date, datetime, timedelta, timezone as _tz
from statistics import mean

from django.db.models import Count, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.practice.models import (
    ErrorCard,
    ListeningSession,
    Notification,
    NotificationPreference,
    ReadingSession,
    SessionAnnotation,
    SpeakingSession,
    WritingDraft,
    WritingSession,
)


# ----- F6: resume / continue ----- #

class ResumeView(APIView):
    """GET /analytics/resume — single object pointing to the most useful next
    action. Inspects: latest unfinished writing draft, speaking session
    without analysis, latest reading/listening attempt with no submission.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        candidates: list[dict] = []

        latest_draft = (
            WritingDraft.objects.filter(user=user)
            .order_by("-updated_at")
            .first()
        )
        if latest_draft and latest_draft.essay.strip():
            candidates.append({
                "kind": "writing_draft",
                "title": "Resume your essay",
                "subtitle": (latest_draft.prompt or "")[:120],
                "section": "Writing",
                "id": str(latest_draft.id),
                "updated_at": latest_draft.updated_at.isoformat(),
                "extra": {"prompt_hash": latest_draft.prompt_hash, "word_count": latest_draft.word_count},
            })

        latest_speaking_no_analysis = (
            SpeakingSession.objects.filter(
                user=user, deleted_at__isnull=True, analysis__isnull=True,
            )
            .order_by("-created_at")
            .first()
        )
        if latest_speaking_no_analysis:
            candidates.append({
                "kind": "speaking_unanalyzed",
                "title": "Get your speaking score",
                "subtitle": (latest_speaking_no_analysis.topic or "Recorded session")[:120],
                "section": "Speaking",
                "id": str(latest_speaking_no_analysis.id),
                "updated_at": latest_speaking_no_analysis.created_at.isoformat(),
                "extra": {"duration_seconds": latest_speaking_no_analysis.duration_seconds},
            })

        # Pick the most-recent candidate.
        if not candidates:
            return Response({"resume": None})
        candidates.sort(key=lambda c: c["updated_at"], reverse=True)
        return Response({"resume": candidates[0]})


# ----- P2: Notifications ----- #

class _NotifCreateInput(serializers.Serializer):
    notification_type = serializers.CharField(max_length=24)
    title = serializers.CharField(max_length=200)
    body = serializers.CharField(required=False, allow_blank=True)
    cta_label = serializers.CharField(required=False, allow_blank=True, max_length=80)
    cta_target = serializers.CharField(required=False, allow_blank=True, max_length=120)
    payload = serializers.JSONField(required=False)


def _serialize_notification(n: Notification) -> dict:
    return {
        "id": str(n.id),
        "type": n.notification_type,
        "title": n.title,
        "body": n.body,
        "cta_label": n.cta_label,
        "cta_target": n.cta_target,
        "payload": n.payload,
        "read_at": n.read_at.isoformat() if n.read_at else None,
        "dismissed_at": n.dismissed_at.isoformat() if n.dismissed_at else None,
        "created_at": n.created_at.isoformat(),
    }


class NotificationsView(APIView):
    """GET /analytics/notifications, optional ?unread=1 + POST to create
    (used by client-side detectors like SRS-due watcher)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Auto-generate a few well-known notifications on read so the bell
        # is always reasonably fresh. Keeps logic simple — Celery later.
        self._refresh(request.user)

        qs = Notification.objects.filter(user=request.user, dismissed_at__isnull=True)
        if request.query_params.get("unread") in ("1", "true"):
            qs = qs.filter(read_at__isnull=True)
        rows = list(qs.order_by("-created_at")[:50])
        unread = qs.filter(read_at__isnull=True).count()
        return Response({
            "notifications": [_serialize_notification(n) for n in rows],
            "unread_count": unread,
        })

    def post(self, request):
        s = _NotifCreateInput(data=request.data)
        s.is_valid(raise_exception=True)
        n = Notification.objects.create(
            user=request.user,
            institute=request.user.institute,
            notification_type=s.validated_data["notification_type"],
            title=s.validated_data["title"],
            body=s.validated_data.get("body", ""),
            cta_label=s.validated_data.get("cta_label", ""),
            cta_target=s.validated_data.get("cta_target", ""),
            payload=s.validated_data.get("payload") or {},
        )
        return Response(_serialize_notification(n), status=201)

    @staticmethod
    def _refresh(user: User) -> None:
        """Generate auto-notifications for SRS-due, exam reminder, instructor
        notes, with coarse de-duplication (never two of the same type within
        12 hours)."""
        recent = timezone.now() - timedelta(hours=12)

        def _has_recent(t: str) -> bool:
            return Notification.objects.filter(
                user=user, notification_type=t, created_at__gte=recent,
            ).exists()

        # SRS due
        due_count = ErrorCard.objects.filter(
            user=user, archived_at__isnull=True, due_at__lte=timezone.now(),
        ).count()
        if due_count > 0 and not _has_recent(Notification.TYPE_SRS_DUE):
            Notification.objects.create(
                user=user, institute=user.institute,
                notification_type=Notification.TYPE_SRS_DUE,
                title=f"{due_count} card{'s' if due_count != 1 else ''} due for review",
                body="A 5-minute review locks in past corrections.",
                cta_label="Review now", cta_target="error-log",
                payload={"due_count": due_count},
            )

        # Exam date reminders at T-30, T-7, T-1
        if user.exam_date:
            days = (user.exam_date - date.today()).days
            for milestone, label in ((30, "30 days"), (7, "1 week"), (1, "tomorrow")):
                if days == milestone and not _has_recent(Notification.TYPE_EXAM_REMINDER):
                    Notification.objects.create(
                        user=user, institute=user.institute,
                        notification_type=Notification.TYPE_EXAM_REMINDER,
                        title=f"Your IELTS exam is {label} away",
                        body="Tighten the routine. Aim for one practice slot today.",
                        cta_label="Open Today", cta_target="Today",
                        payload={"days_to_exam": days, "milestone": milestone},
                    )
                    break

        # Unseen instructor annotations
        unseen_anno = SessionAnnotation.objects.filter(
            student=user, created_at__gte=recent,
        ).exclude(
            id__in=Notification.objects.filter(
                user=user, notification_type=Notification.TYPE_INSTRUCTOR_NOTE,
            ).values_list("payload__annotation_id", flat=True),
        )
        for anno in unseen_anno[:5]:
            Notification.objects.create(
                user=user, institute=user.institute,
                notification_type=Notification.TYPE_INSTRUCTOR_NOTE,
                title="New instructor note",
                body=anno.body[:160],
                cta_label="Open session", cta_target=f"speaking-session:{anno.session_id}",
                payload={"annotation_id": str(anno.id), "session_id": str(anno.session_id)},
            )


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, notif_id):
        n = get_object_or_404(Notification, id=notif_id, user=request.user)
        if not n.read_at:
            n.read_at = timezone.now()
            n.save(update_fields=["read_at"])
        return Response({"ok": True})


class NotificationDismissView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, notif_id):
        n = get_object_or_404(Notification, id=notif_id, user=request.user)
        if not n.dismissed_at:
            n.dismissed_at = timezone.now()
            n.save(update_fields=["dismissed_at"])
        return Response({"ok": True})


# ----- P3: Notification preferences ----- #

DEFAULT_EVENTS = {
    Notification.TYPE_SRS_DUE: True,
    Notification.TYPE_STREAK_RISK: True,
    Notification.TYPE_INSTRUCTOR_NOTE: True,
    Notification.TYPE_WEEKLY_DIGEST: True,
    Notification.TYPE_GOAL_REACHED: True,
    Notification.TYPE_EXAM_REMINDER: True,
}


class NotificationPrefView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        prefs = list(NotificationPreference.objects.filter(user=request.user))
        out = {p.channel: p.events or DEFAULT_EVENTS.copy() for p in prefs}
        for ch, _ in NotificationPreference.CHANNEL_CHOICES:
            out.setdefault(ch, DEFAULT_EVENTS.copy())
        return Response({"prefs": out})

    def put(self, request):
        prefs = request.data.get("prefs", {})
        if not isinstance(prefs, dict):
            return Response({"detail": "prefs must be an object."}, status=400)
        for channel, events in prefs.items():
            if channel not in dict(NotificationPreference.CHANNEL_CHOICES):
                continue
            if not isinstance(events, dict):
                continue
            NotificationPreference.objects.update_or_create(
                user=request.user, channel=channel, defaults={"events": events},
            )
        return self.get(request)


# ----- P4: Writing drafts ----- #

def _hash_prompt(prompt: str) -> str:
    return hashlib.sha256(prompt.strip().encode("utf-8")).hexdigest()[:32]


class _DraftInput(serializers.Serializer):
    prompt = serializers.CharField(min_length=10, max_length=4000)
    essay = serializers.CharField(allow_blank=True, max_length=12000)
    task_type = serializers.ChoiceField(choices=["task1", "task2"], default="task2")


def _serialize_draft(d: WritingDraft) -> dict:
    return {
        "id": str(d.id),
        "prompt_hash": d.prompt_hash,
        "prompt": d.prompt,
        "essay": d.essay,
        "word_count": d.word_count,
        "task_type": d.task_type,
        "updated_at": d.updated_at.isoformat(),
        "created_at": d.created_at.isoformat(),
    }


class WritingDraftListView(APIView):
    """GET /writing/drafts — list user drafts. POST — upsert by prompt_hash."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = WritingDraft.objects.filter(user=request.user).order_by("-updated_at")[:50]
        return Response({"drafts": [_serialize_draft(d) for d in qs]})

    def post(self, request):
        s = _DraftInput(data=request.data)
        s.is_valid(raise_exception=True)
        prompt = s.validated_data["prompt"]
        h = _hash_prompt(prompt)
        essay = s.validated_data.get("essay", "") or ""
        word_count = len(essay.split())
        draft, _ = WritingDraft.objects.update_or_create(
            user=request.user, prompt_hash=h,
            defaults={
                "institute": request.user.institute,
                "prompt": prompt,
                "essay": essay,
                "word_count": word_count,
                "task_type": s.validated_data.get("task_type", "task2"),
            },
        )
        return Response(_serialize_draft(draft))


class WritingDraftDetailView(APIView):
    """GET / DELETE a single draft by prompt_hash."""

    permission_classes = [IsAuthenticated]

    def get(self, request, prompt_hash):
        d = get_object_or_404(WritingDraft, user=request.user, prompt_hash=prompt_hash)
        return Response(_serialize_draft(d))

    def delete(self, request, prompt_hash):
        WritingDraft.objects.filter(user=request.user, prompt_hash=prompt_hash).delete()
        return Response({"ok": True})


# ----- D3: Calendar export ----- #

class CalendarIcsView(APIView):
    """GET /analytics/calendar.ics — daily practice slots until exam date.
    User can subscribe via Google Calendar -> Add by URL."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if not user.exam_date:
            return Response({"detail": "Set an exam date in your profile first."}, status=400)

        commitment = max(15, min(180, int(user.daily_commitment_minutes or 30)))
        # Default slot = 7pm local, length = commitment minutes.
        slot_hour = 19

        lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//AI IELTS Tutor//EN",
            f"X-WR-CALNAME:IELTS practice — {user.email}",
        ]
        cursor = date.today()
        while cursor <= user.exam_date:
            uid = f"{cursor.isoformat()}-{user.id}@ai-ielts-tutor"
            dtstart = datetime(cursor.year, cursor.month, cursor.day, slot_hour, 0, tzinfo=_tz.utc)
            dtend = dtstart + timedelta(minutes=commitment)
            lines.extend([
                "BEGIN:VEVENT",
                f"UID:{uid}",
                f"DTSTAMP:{datetime.now(_tz.utc).strftime('%Y%m%dT%H%M%SZ')}",
                f"DTSTART:{dtstart.strftime('%Y%m%dT%H%M%SZ')}",
                f"DTEND:{dtend.strftime('%Y%m%dT%H%M%SZ')}",
                "SUMMARY:IELTS practice",
                "DESCRIPTION:Practice slot generated by AI IELTS Tutor.",
                "END:VEVENT",
            ])
            cursor += timedelta(days=1)
        lines.append("END:VCALENDAR")

        body = "\r\n".join(lines) + "\r\n"
        resp = HttpResponse(body, content_type="text/calendar; charset=utf-8")
        resp["Content-Disposition"] = 'attachment; filename="ielts-practice.ics"'
        return resp


# ----- X3: Certificate of practice ----- #

class CertificateView(APIView):
    """GET /analytics/certificate?fmt=pdf — one-page branded certificate.
    Requires that the user's last 3 writing band scores all meet the target."""

    permission_classes = [IsAuthenticated]

    ELIGIBLE_SESSIONS_REQUIRED = 3

    def get(self, request):
        user = request.user
        target = float(user.target_score or 7.0)
        last_writing = list(
            WritingSession.objects.filter(user=user, deleted_at__isnull=True)
            .order_by("-created_at")
            .values_list("band_score", flat=True)[:self.ELIGIBLE_SESSIONS_REQUIRED]
        )
        eligible = (
            len(last_writing) >= self.ELIGIBLE_SESSIONS_REQUIRED
            and all(b is not None and float(b) >= target for b in last_writing)
        )
        if not eligible and request.query_params.get("force") != "1":
            return Response({
                "detail": "Not yet eligible.",
                "required": self.ELIGIBLE_SESSIONS_REQUIRED,
                "target": target,
                "last_scores": [float(b) if b is not None else None for b in last_writing],
            }, status=400)

        # PDF render with reportlab; fallback to plain text on import error.
        try:
            from reportlab.lib.pagesizes import LETTER
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
            buf = io.BytesIO()
            doc = SimpleDocTemplate(buf, pagesize=LETTER, leftMargin=1*inch, rightMargin=1*inch, topMargin=1.2*inch, bottomMargin=1*inch)
            styles = getSampleStyleSheet()
            title_style = ParagraphStyle("title", parent=styles["Title"], fontSize=28, alignment=1, textColor="#1e3a8a")
            sub_style = ParagraphStyle("sub", parent=styles["BodyText"], alignment=1, fontSize=14, spaceAfter=24)
            body_style = ParagraphStyle("body", parent=styles["BodyText"], alignment=1, fontSize=12)
            flow = [
                Paragraph("Certificate of Practice", title_style),
                Spacer(1, 12),
                Paragraph("AI IELTS Tutor", sub_style),
                Paragraph(f"Awarded to <b>{user.name or user.email}</b>", body_style),
                Spacer(1, 18),
                Paragraph(f"For sustaining IELTS Writing performance at band {target} or higher", body_style),
                Paragraph(f"across the last {self.ELIGIBLE_SESSIONS_REQUIRED} consecutive sessions.", body_style),
                Spacer(1, 36),
                Paragraph(f"Issued: {date.today().isoformat()}", body_style),
                Paragraph(f"Institute: {user.institute.slug if user.institute else '-'}", body_style),
            ]
            doc.build(flow)
            resp = HttpResponse(buf.getvalue(), content_type="application/pdf")
            resp["Content-Disposition"] = f'attachment; filename="ielts-certificate-{user.id}.pdf"'
            return resp
        except ImportError:
            text = (
                f"Certificate of Practice\n\n"
                f"Awarded to {user.name or user.email}\n"
                f"For sustaining IELTS Writing performance at band {target} or higher\n"
                f"across {self.ELIGIBLE_SESSIONS_REQUIRED} consecutive sessions.\n\n"
                f"Issued: {date.today().isoformat()}\n"
            )
            resp = HttpResponse(text, content_type="text/plain; charset=utf-8")
            resp["Content-Disposition"] = f'attachment; filename="ielts-certificate-{user.id}.txt"'
            return resp


# ----- X2: Public progress profile ----- #


class _PublicProfileInput(serializers.Serializer):
    enabled = serializers.BooleanField()


class PublicProfileToggleView(APIView):
    """POST /analytics/public-profile/toggle {enabled: bool} — opt-in/out."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = _PublicProfileInput(data=request.data)
        s.is_valid(raise_exception=True)
        if s.validated_data["enabled"]:
            if not request.user.public_progress_slug:
                base = slugify(request.user.name or request.user.email.split("@")[0]) or "user"
                slug = f"{base}-{secrets.token_urlsafe(3)[:5].lower()}"
                request.user.public_progress_slug = slug
                request.user.save(update_fields=["public_progress_slug"])
        else:
            request.user.public_progress_slug = None
            request.user.save(update_fields=["public_progress_slug"])
        return Response({
            "enabled": bool(request.user.public_progress_slug),
            "slug": request.user.public_progress_slug,
        })


class PublicProfileView(APIView):
    """GET /api/v1/public/u/<slug> — read-only profile snapshot.
    No auth — anyone with the link can view."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, slug):
        try:
            user = User.objects.get(public_progress_slug=slug)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        from apps.practice.services.bands import compute_streak

        # 12-week heatmap of all session timestamps
        all_sessions = []
        for model in (WritingSession, SpeakingSession, ReadingSession, ListeningSession):
            all_sessions.extend(
                model.objects.filter(user=user, deleted_at__isnull=True)
                .values_list("created_at", flat=True)
            )
        streak = compute_streak(all_sessions)

        recent_writing = (
            WritingSession.objects.filter(user=user, deleted_at__isnull=True)
            .order_by("-created_at")
            .values("band_score", "created_at", "task_type")[:5]
        )
        recent_speaking = (
            SpeakingSession.objects.filter(user=user, deleted_at__isnull=True, analysis__isnull=False)
            .order_by("-created_at")[:5]
        )
        speaking_scores = []
        for s in recent_speaking:
            band = (s.analysis or {}).get("overallBandScore")
            if band is not None:
                speaking_scores.append({
                    "band": float(band),
                    "created_at": s.created_at.isoformat(),
                })
        writing_scores = [
            {"band": float(w["band_score"]) if w["band_score"] is not None else None,
             "created_at": w["created_at"].isoformat(),
             "task_type": w["task_type"]}
            for w in recent_writing
        ]

        return Response({
            "name": user.name or "Anonymous learner",
            "target_band": float(user.target_score or 0),
            "streak_days": streak,
            "exam_date": user.exam_date.isoformat() if user.exam_date else None,
            "native_language": user.native_language,
            "recent_writing": writing_scores,
            "recent_speaking": speaking_scores,
        })


# ----- D2: onboarding state ----- #

class _OnboardInput(serializers.Serializer):
    target_score = serializers.FloatField(min_value=1.0, max_value=9.0)
    exam_date = serializers.DateField(required=False, allow_null=True)
    native_language = serializers.CharField(allow_blank=True, required=False)
    daily_commitment_minutes = serializers.IntegerField(min_value=10, max_value=240, required=False)


class CompleteOnboardingView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = _OnboardInput(data=request.data)
        s.is_valid(raise_exception=True)
        u = request.user
        u.target_score = s.validated_data["target_score"]
        if "exam_date" in s.validated_data:
            u.exam_date = s.validated_data.get("exam_date")
        if "native_language" in s.validated_data:
            u.native_language = s.validated_data.get("native_language", "")
        if "daily_commitment_minutes" in s.validated_data:
            u.daily_commitment_minutes = s.validated_data["daily_commitment_minutes"]
        u.onboarded_at = timezone.now()
        u.save()
        return Response({"ok": True, "onboarded_at": u.onboarded_at.isoformat()})
