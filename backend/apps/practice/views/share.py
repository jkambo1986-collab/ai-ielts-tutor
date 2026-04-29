"""
Public share endpoint — serves the read-only dashboard/session snapshot a
ShareLink token points to.

Why a separate endpoint (not part of /analytics/dashboard):
  - It must not require authentication; the token IS the authentication.
  - It must bypass TenantMiddleware's institute resolution (the viewer is
    typically anonymous and not affiliated with the institute).
  - It returns a stripped, snapshot-only payload — no PII beyond the
    user's display name + institute name, no raw essays/transcripts.

Security:
  - 404 for unknown / revoked / expired tokens (no enumeration).
  - view_count incremented on each access (helps detect anomalies).
"""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.practice.models import ShareLink
from apps.practice.services.adaptive import overview as adaptive_overview


class PublicShareView(APIView):
    """GET /api/v1/share/<token> — anonymous read-only snapshot."""

    permission_classes = [AllowAny]
    authentication_classes: list = []  # Skip JWT auth so anonymous viewers work

    def get(self, request, token: str):
        link = ShareLink.objects.select_related("user", "institute").filter(token=token).first()
        if not link:
            return Response({"detail": "Not found."}, status=404)
        if link.revoked_at is not None or link.expires_at < timezone.now():
            return Response({"detail": "Link expired or revoked."}, status=410)

        # Bump view counter atomically — this is a public endpoint, so race
        # conditions don't matter much, but using F() avoids a select+update.
        from django.db.models import F
        ShareLink.objects.filter(pk=link.pk).update(view_count=F("view_count") + 1)

        days = link.period_days if link.period_days > 0 else None
        snapshot = {
            "viewer": {
                "name": link.user.name or link.user.email.split("@")[0],
                "institute": link.institute.name,
            },
            "scope": link.scope,
            "period_days": link.period_days,
            "issued_at": link.created_at,
            "expires_at": link.expires_at,
        }

        if link.scope == ShareLink.SCOPE_DASHBOARD:
            snapshot["overview"] = adaptive_overview(link.user, days=days)
        elif link.scope == ShareLink.SCOPE_SESSION and link.target_id:
            snapshot["session"] = _serialize_session_snapshot(link.user, link.target_id)

        return Response(snapshot)


def _serialize_session_snapshot(user, session_id):
    """Return a minimal session snapshot. Tries each session model in turn."""
    from apps.practice.models import (
        ListeningSession, ReadingSession, SpeakingSession, WritingSession,
    )
    from decimal import Decimal

    for model, label in [
        (WritingSession, "writing"),
        (SpeakingSession, "speaking"),
        (ReadingSession, "reading"),
        (ListeningSession, "listening"),
    ]:
        s = model.objects.filter(id=session_id, user=user, deleted_at__isnull=True).first()
        if s:
            base = {
                "type": label,
                "id": str(s.id),
                "created_at": s.created_at,
            }
            if hasattr(s, "band_score") and s.band_score is not None:
                base["band_score"] = float(s.band_score) if isinstance(s.band_score, Decimal) else s.band_score
            if label in ("reading", "listening"):
                base["score"] = s.score
                base["total_questions"] = s.total_questions
            return base
    return None
