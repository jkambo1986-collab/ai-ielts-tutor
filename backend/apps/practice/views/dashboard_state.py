"""
CRUD endpoints for the persistent dashboard state stores: vocabulary,
error cards (SRS), mock tests, calibration, share links, alerts.

These exist so all derived dashboard data is durable in Postgres rather than
recomputed from raw sessions on every page load. The DashboardAnalyticsView
aggregates them; these endpoints let users update / list them directly.
"""

from __future__ import annotations

import secrets
from datetime import timedelta

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.practice.models import (
    CalibrationEntry,
    DashboardAlert,
    ErrorCard,
    MockTest,
    ShareLink,
    StudyPlan,
    VocabularyObservation,
)
from apps.practice.serializers import (
    CalibrationEntrySerializer,
    DashboardAlertSerializer,
    ErrorCardSerializer,
    MockTestSerializer,
    ShareLinkSerializer,
    StudyPlanSerializer,
    VocabularyObservationSerializer,
)


def _user_qs(model, request):
    return model.objects.filter(user=request.user, institute=request.user.institute)


# -- Study plan -- #

class StudyPlanLatestView(APIView):
    """GET /api/v1/analytics/study-plan/latest — most recent active plan."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        plan = (
            _user_qs(StudyPlan, request)
            .filter(is_active=True)
            .order_by("-created_at")
            .first()
        )
        if not plan:
            return Response({"plan": None})
        return Response({"plan": StudyPlanSerializer(plan).data})


# -- Vocabulary (#19) -- #

class _VocabIngestInput(serializers.Serializer):
    """Input for POST: a list of observed lemmas with optional CEFR/AWL tags
    (the analyzer that calls this endpoint computes those)."""
    items = serializers.ListField(child=serializers.DictField(), allow_empty=False)
    source_session_type = serializers.ChoiceField(
        choices=["writing", "speaking"], required=False
    )
    source_session_id = serializers.UUIDField(required=False, allow_null=True)


class VocabularyView(APIView):
    """GET /api/v1/analytics/vocabulary — list user's vocabulary observations.
    POST — bulk upsert lemma observations."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = _user_qs(VocabularyObservation, request).order_by("-last_seen_at")
        cefr = request.query_params.get("cefr")
        if cefr:
            qs = qs.filter(cefr_level=cefr)
        if request.query_params.get("awl") in ("true", "1"):
            qs = qs.filter(is_awl=True)
        limit = min(int(request.query_params.get("limit", 200)), 1000)
        return Response(VocabularyObservationSerializer(qs[:limit], many=True).data)

    def post(self, request):
        s = _VocabIngestInput(data=request.data)
        s.is_valid(raise_exception=True)
        items = s.validated_data["items"]
        session_type = s.validated_data.get("source_session_type", "")
        session_id = s.validated_data.get("source_session_id")

        upserted = 0
        for item in items:
            lemma = (item.get("lemma") or "").strip().lower()
            if not lemma:
                continue
            cefr = item.get("cefr_level") or ""
            is_awl = bool(item.get("is_awl", False))
            obs, created = VocabularyObservation.objects.get_or_create(
                user=request.user,
                lemma=lemma,
                defaults={
                    "institute": request.user.institute,
                    "cefr_level": cefr,
                    "is_awl": is_awl,
                    "last_session_type": session_type,
                    "last_session_id": session_id,
                },
            )
            if not created:
                obs.frequency += 1
                if cefr and not obs.cefr_level:
                    obs.cefr_level = cefr
                if is_awl and not obs.is_awl:
                    obs.is_awl = is_awl
                obs.last_session_type = session_type or obs.last_session_type
                obs.last_session_id = session_id or obs.last_session_id
                obs.save(update_fields=[
                    "frequency", "cefr_level", "is_awl",
                    "last_session_type", "last_session_id", "last_seen_at",
                ])
            upserted += 1
        return Response({"upserted": upserted}, status=201)


# -- Error cards / SRS (#22) -- #

class _ErrorCardCreateInput(serializers.Serializer):
    source_session_type = serializers.ChoiceField(
        choices=["writing", "speaking", "reading", "listening"]
    )
    source_session_id = serializers.UUIDField()
    category = serializers.CharField(max_length=24)
    error_text = serializers.CharField()
    correction_text = serializers.CharField(allow_blank=True, required=False, default="")
    explanation = serializers.CharField(allow_blank=True, required=False, default="")


class ErrorCardsView(APIView):
    """GET — list user's cards (filter ?due=now). POST — create one."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = _user_qs(ErrorCard, request).filter(archived_at__isnull=True)
        if request.query_params.get("due") == "now":
            qs = qs.filter(due_at__lte=timezone.now())
        return Response(ErrorCardSerializer(qs.order_by("due_at")[:200], many=True).data)

    def post(self, request):
        s = _ErrorCardCreateInput(data=request.data)
        s.is_valid(raise_exception=True)
        card = ErrorCard.objects.create(
            user=request.user,
            institute=request.user.institute,
            source_session_type=s.validated_data["source_session_type"],
            source_session_id=s.validated_data["source_session_id"],
            category=s.validated_data["category"],
            error_text=s.validated_data["error_text"],
            correction_text=s.validated_data.get("correction_text", ""),
            explanation=s.validated_data.get("explanation", ""),
            due_at=timezone.now(),  # First review is immediately due.
        )
        return Response(ErrorCardSerializer(card).data, status=201)


class _ReviewInput(serializers.Serializer):
    """Quality 0..5 SM-2 grade (0 = total blackout, 5 = perfect)."""
    quality = serializers.IntegerField(min_value=0, max_value=5)


class ErrorCardReviewView(APIView):
    """POST /api/v1/analytics/error-cards/<id>/review — record an SM-2 review."""
    permission_classes = [IsAuthenticated]

    def post(self, request, card_id):
        card = get_object_or_404(_user_qs(ErrorCard, request), id=card_id)
        s = _ReviewInput(data=request.data)
        s.is_valid(raise_exception=True)
        q = s.validated_data["quality"]

        # SM-2 update
        if q < 3:
            card.repetitions = 0
            card.interval_days = 1
        else:
            if card.repetitions == 0:
                card.interval_days = 1
            elif card.repetitions == 1:
                card.interval_days = 6
            else:
                card.interval_days = max(1, round(card.interval_days * card.ease))
            card.repetitions += 1
        card.ease = max(1.3, card.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
        card.due_at = timezone.now() + timedelta(days=card.interval_days)
        card.last_reviewed_at = timezone.now()
        card.review_count += 1
        if q >= 3:
            card.correct_count += 1
        # Auto-archive after 5 successful long-interval reviews.
        if card.repetitions >= 5 and card.interval_days >= 30:
            card.archived_at = timezone.now()

        # Stuck-card escalation: if the student has reviewed a card many
        # times but rarely gets it right, infinite repetition won't help.
        # Archive it and surface a one-time alert so an instructor (or the
        # student themselves) can intervene.
        STUCK_REVIEW_THRESHOLD = 10
        STUCK_CORRECT_RATE = 0.30
        if (
            card.archived_at is None
            and card.review_count >= STUCK_REVIEW_THRESHOLD
            and (card.correct_count / card.review_count) < STUCK_CORRECT_RATE
        ):
            card.archived_at = timezone.now()
            try:
                DashboardAlert.objects.create(
                    user=request.user, institute=request.user.institute,
                    alert_type=DashboardAlert.TYPE_QUICK_WIN,
                    severity=DashboardAlert.SEVERITY_WARNING,
                    title="A practice card needs a fresh approach",
                    body=(
                        f"You've reviewed this card {card.review_count} times but "
                        f"only got it right {card.correct_count} times. We've "
                        f"archived it — try learning the underlying rule another "
                        f"way (a study plan task, instructor question, or fresh "
                        f"writing prompt that exercises the same pattern)."
                    ),
                    payload={
                        "kind": "stuck_card",
                        "card_id": str(card.id),
                        "category": card.category,
                        "review_count": card.review_count,
                        "correct_count": card.correct_count,
                    },
                    cta_label="See alternatives",
                    cta_target="StudyPlan",
                )
            except Exception:
                # Never let alert creation block the review write.
                pass

        card.save()
        return Response(ErrorCardSerializer(card).data)


# -- Pre-session SRS warmup -- #

class WarmupView(APIView):
    """GET /api/v1/analytics/warmup?session_type=writing|speaking|reading|listening

    Returns a compact snapshot the FE shows BEFORE the student starts a
    session: how many SRS cards are due, which categories dominate, and a
    handful of card IDs to cycle through as a 30-second warm-up. Connecting
    SRS → upcoming session is the highest-leverage retention loop we have;
    the student arrives at their session already primed on their own
    recurring patterns.

    `session_type` is optional. When provided, we down-rank cards from
    unrelated categories so a student about to write doesn't get nudged on
    a pure pronunciation card. We don't filter — we order — because at the
    end of the day every card is worth seeing.
    """
    permission_classes = [IsAuthenticated]

    # When the student is about to do skill X, the FE should show cards
    # from these categories first.
    _CATEGORY_PRIORITY = {
        "writing": ["grammar", "lexical", "coherence", "task_response"],
        "speaking": ["pronunciation", "fluency", "lexical", "grammar"],
        "reading": ["lexical", "grammar"],
        "listening": ["lexical", "fluency"],
    }

    def get(self, request):
        session_type = (request.query_params.get("session_type") or "").lower()
        priority = self._CATEGORY_PRIORITY.get(session_type)

        cards = list(
            _user_qs(ErrorCard, request)
            .filter(archived_at__isnull=True, due_at__lte=timezone.now())
            .order_by("due_at")[:20]
        )
        # Re-rank by category priority when caller specified a session type.
        if priority:
            order = {c: i for i, c in enumerate(priority)}
            cards.sort(key=lambda c: order.get(c.category, 99))

        # Aggregate by category for the headline summary.
        category_counts: dict[str, int] = {}
        for c in cards:
            category_counts[c.category] = category_counts.get(c.category, 0) + 1

        suggested = cards[:3]
        return Response({
            "due_srs_count": len(cards),
            "due_categories": [
                {"category": k, "count": v}
                for k, v in sorted(category_counts.items(), key=lambda kv: -kv[1])
            ],
            "suggested_cards": ErrorCardSerializer(suggested, many=True).data,
            "session_type": session_type or None,
        })


# -- Mock tests (#20) -- #

class MockTestsView(APIView):
    """GET — list user's mock tests. POST — create / complete."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = _user_qs(MockTest, request).order_by("-started_at")[:50]
        return Response(MockTestSerializer(qs, many=True).data)

    def post(self, request):
        # The creator includes overall_band, readiness_score, sub_results.
        # Foreign keys to underlying session rows are optional.
        sub_results = request.data.get("sub_results", {})
        overall_band = request.data.get("overall_band")
        readiness_score = request.data.get("readiness_score")
        duration_seconds = int(request.data.get("duration_seconds", 0))
        completed = bool(request.data.get("completed", True))

        mt = MockTest.objects.create(
            user=request.user,
            institute=request.user.institute,
            sub_results=sub_results,
            overall_band=overall_band,
            readiness_score=readiness_score,
            duration_seconds=duration_seconds,
            completed_at=timezone.now() if completed else None,
        )
        return Response(MockTestSerializer(mt).data, status=201)


# -- Calibration (#25) -- #

class _CalibrationInput(serializers.Serializer):
    session_type = serializers.ChoiceField(choices=["writing", "speaking", "reading", "listening"])
    session_id = serializers.UUIDField()
    predicted_band = serializers.DecimalField(max_digits=3, decimal_places=1)
    actual_band = serializers.DecimalField(max_digits=3, decimal_places=1)


class CalibrationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = _user_qs(CalibrationEntry, request).order_by("-created_at")[:100]
        return Response(CalibrationEntrySerializer(qs, many=True).data)

    def post(self, request):
        s = _CalibrationInput(data=request.data)
        s.is_valid(raise_exception=True)
        delta = s.validated_data["predicted_band"] - s.validated_data["actual_band"]
        entry = CalibrationEntry.objects.create(
            user=request.user,
            institute=request.user.institute,
            session_type=s.validated_data["session_type"],
            session_id=s.validated_data["session_id"],
            predicted_band=s.validated_data["predicted_band"],
            actual_band=s.validated_data["actual_band"],
            delta=delta,
        )
        return Response(CalibrationEntrySerializer(entry).data, status=201)


# -- Share links (#27) -- #

class _ShareLinkInput(serializers.Serializer):
    scope = serializers.ChoiceField(choices=["dashboard", "session"], default="dashboard")
    target_id = serializers.UUIDField(required=False, allow_null=True)
    period_days = serializers.IntegerField(min_value=7, max_value=365, default=30)
    ttl_days = serializers.IntegerField(min_value=1, max_value=180, default=30)


class ShareLinkView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = _user_qs(ShareLink, request).filter(revoked_at__isnull=True).order_by("-created_at")
        return Response(ShareLinkSerializer(qs, many=True, context={"request": request}).data)

    def post(self, request):
        s = _ShareLinkInput(data=request.data)
        s.is_valid(raise_exception=True)
        link = ShareLink.objects.create(
            user=request.user,
            institute=request.user.institute,
            token=secrets.token_urlsafe(24),
            scope=s.validated_data["scope"],
            target_id=s.validated_data.get("target_id"),
            period_days=s.validated_data["period_days"],
            expires_at=timezone.now() + timedelta(days=s.validated_data["ttl_days"]),
        )
        return Response(ShareLinkSerializer(link, context={"request": request}).data, status=201)


class ShareLinkRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, link_id):
        link = get_object_or_404(_user_qs(ShareLink, request), id=link_id)
        link.revoked_at = timezone.now()
        link.save(update_fields=["revoked_at"])
        return Response({"revoked": True})


# -- Alerts (#28) -- #

class AlertsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = _user_qs(DashboardAlert, request).filter(dismissed_at__isnull=True).order_by("-created_at")
        return Response(DashboardAlertSerializer(qs, many=True).data)


class AlertDismissView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, alert_id):
        alert = get_object_or_404(_user_qs(DashboardAlert, request), id=alert_id)
        alert.dismissed_at = timezone.now()
        alert.save(update_fields=["dismissed_at"])
        return Response({"dismissed": True})
