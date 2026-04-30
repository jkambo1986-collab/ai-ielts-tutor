"""
Dashboard alert generator (#28).

`generate_alerts(user)` inspects recent sessions and creates `DashboardAlert`
rows for surfaced insights. Idempotent — only creates a new alert when the
same (type, payload-key) doesn't already exist un-dismissed in the last 7 days.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from statistics import mean
from typing import Iterable

from django.utils import timezone

from apps.practice.models import (
    DashboardAlert,
    ListeningSession,
    ReadingSession,
    SpeakingSession,
    WritingSession,
)


REGRESSION_THRESHOLD_BAND = 0.5
REGRESSION_LOOKBACK_SESSIONS = 6  # earlier 3 vs latest 3
INACTIVITY_DAYS = 5


def _band_series_writing(user) -> list[float]:
    qs = (
        WritingSession.objects.filter(user=user, deleted_at__isnull=True, band_score__isnull=False)
        .order_by("created_at")
        .values_list("band_score", flat=True)
    )
    return [float(b) for b in qs]


def _band_series_speaking(user) -> list[float]:
    qs = (
        SpeakingSession.objects.filter(user=user, deleted_at__isnull=True, analysis__isnull=False)
        .order_by("created_at")
        .values_list("analysis", flat=True)
    )
    out = []
    for analysis in qs:
        b = analysis.get("overallBandScore") if analysis else None
        if b is not None:
            out.append(float(b))
    return out


def _alert_exists(user, alert_type: str, payload_match: dict | None = None) -> bool:
    """True if an undismissed alert of the same kind exists in the last 7 days.

    `alert_type` matches DashboardAlert.alert_type. When `payload_match` is
    given, every key/value must also match the row's payload JSON — that's
    how we differentiate "regression_writing" from "regression_speaking",
    since both share alert_type='regression'.
    """
    cutoff = timezone.now() - timedelta(days=7)
    qs = DashboardAlert.objects.filter(
        user=user,
        alert_type=alert_type,
        created_at__gte=cutoff,
        dismissed_at__isnull=True,
    )
    if payload_match:
        for key, value in payload_match.items():
            qs = qs.filter(**{f"payload__{key}": value})
    return qs.exists()


def _detect_regression(series: list[float]) -> float | None:
    """Return delta (negative = regression) if the latest 3 sessions are
    ≥ REGRESSION_THRESHOLD_BAND below the prior 3."""
    if len(series) < REGRESSION_LOOKBACK_SESSIONS:
        return None
    earlier = series[-REGRESSION_LOOKBACK_SESSIONS:-3]
    latest = series[-3:]
    delta = mean(latest) - mean(earlier)
    return delta if delta <= -REGRESSION_THRESHOLD_BAND else None


def _last_session_at(user) -> timezone.datetime | None:
    candidates = []
    for model in (WritingSession, SpeakingSession, ReadingSession, ListeningSession):
        latest = (
            model.objects.filter(user=user, deleted_at__isnull=True)
            .order_by("-created_at")
            .values_list("created_at", flat=True)
            .first()
        )
        if latest:
            candidates.append(latest)
    return max(candidates) if candidates else None


def generate_alerts(user) -> list[DashboardAlert]:
    """Run all alert detectors. Returns the alerts created on this call."""
    created: list[DashboardAlert] = []

    # Regression: writing
    writing_series = _band_series_writing(user)
    delta = _detect_regression(writing_series)
    if delta is not None and not _alert_exists(
        user, DashboardAlert.TYPE_REGRESSION, {"skill": "writing"},
    ):
        created.append(DashboardAlert.objects.create(
            user=user, institute=user.institute,
            alert_type=DashboardAlert.TYPE_REGRESSION,
            severity=DashboardAlert.SEVERITY_WARNING,
            title="Writing scores have dipped",
            body=f"Your last 3 writing sessions averaged {round(delta, 2)} band lower than the prior 3.",
            payload={"skill": "writing", "delta": float(delta)},
            cta_label="Try a quick win",
            cta_target="Writing",
        ))

    # Regression: speaking
    speaking_series = _band_series_speaking(user)
    delta = _detect_regression(speaking_series)
    if delta is not None and not _alert_exists(
        user, DashboardAlert.TYPE_REGRESSION, {"skill": "speaking"},
    ):
        created.append(DashboardAlert.objects.create(
            user=user, institute=user.institute,
            alert_type=DashboardAlert.TYPE_REGRESSION,
            severity=DashboardAlert.SEVERITY_WARNING,
            title="Speaking scores have dipped",
            body=f"Your last 3 speaking sessions averaged {round(delta, 2)} band lower than the prior 3.",
            payload={"skill": "speaking", "delta": float(delta)},
            cta_label="Try a quick win",
            cta_target="Speaking",
        ))

    # Inactivity
    last = _last_session_at(user)
    if last and (timezone.now() - last) > timedelta(days=INACTIVITY_DAYS):
        if not _alert_exists(user, DashboardAlert.TYPE_INACTIVE):
            created.append(DashboardAlert.objects.create(
                user=user, institute=user.institute,
                alert_type=DashboardAlert.TYPE_INACTIVE,
                severity=DashboardAlert.SEVERITY_INFO,
                title=f"It's been {(timezone.now() - last).days} days",
                body="A 10-minute speaking session is a great way to get back on track.",
                payload={"last_session_at": last.isoformat()},
                cta_label="Start a quick session",
                cta_target="Speaking",
            ))

    # Goal reached
    target = float(user.target_score or 7.0)
    for skill, series in (("writing", writing_series), ("speaking", speaking_series)):
        if (
            series
            and series[-1] >= target
            and not _alert_exists(
                user, DashboardAlert.TYPE_GOAL_REACHED, {"skill": skill},
            )
        ):
            created.append(DashboardAlert.objects.create(
                user=user, institute=user.institute,
                alert_type=DashboardAlert.TYPE_GOAL_REACHED,
                severity=DashboardAlert.SEVERITY_SUCCESS,
                title=f"You hit your {skill} target",
                body=f"Latest {skill} band {series[-1]} ≥ target {target}. Keep it consistent for 3 more sessions to lock it in.",
                payload={"skill": skill, "score": series[-1], "target": target},
                cta_label="Try a harder prompt",
                cta_target=skill.capitalize(),
            ))

    return created
