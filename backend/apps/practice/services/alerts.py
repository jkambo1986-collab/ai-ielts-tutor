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

from django.db import models
from django.db.models import Avg

from apps.practice.models import (
    CalibrationEntry,
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


def _latest_writing_with_band(user) -> dict | None:
    row = (
        WritingSession.objects.filter(user=user, deleted_at__isnull=True)
        .order_by("-created_at")
        .values("id", "band_score")
        .first()
    )
    if row and row.get("band_score") is not None:
        return {"id": row["id"], "band": float(row["band_score"])}
    return None


def _latest_speaking_with_band(user) -> dict | None:
    row = (
        SpeakingSession.objects.filter(user=user, deleted_at__isnull=True, analysis__isnull=False)
        .order_by("-created_at")
        .values("id", "analysis")
        .first()
    )
    if not row or not isinstance(row.get("analysis"), dict):
        return None
    band = row["analysis"].get("overallBandScore")
    try:
        return {"id": row["id"], "band": float(band)} if band is not None else None
    except (TypeError, ValueError):
        return None


def _skill_avg_band(model_cls, user, skill: str) -> float | None:
    """Average band for the user over the last 30 days, excluding the most
    recent session. Returns None when there's not enough data."""
    cutoff = timezone.now() - timedelta(days=30)
    if skill == "writing":
        bands = list(
            model_cls.objects.filter(
                user=user, deleted_at__isnull=True, created_at__gte=cutoff,
            )
            .order_by("-created_at")
            .values_list("band_score", flat=True)
        )
        bands = [float(b) for b in bands if b is not None]
    else:  # speaking — pull bands out of the analysis JSON
        rows = list(
            model_cls.objects.filter(
                user=user, deleted_at__isnull=True, created_at__gte=cutoff,
                analysis__isnull=False,
            )
            .order_by("-created_at")
            .values_list("analysis", flat=True)
        )
        bands = []
        for a in rows:
            if isinstance(a, dict) and a.get("overallBandScore") is not None:
                try:
                    bands.append(float(a["overallBandScore"]))
                except (TypeError, ValueError):
                    pass
    # Need ≥ 2 priors to be a meaningful "average".
    if len(bands) < 3:
        return None
    return mean(bands[1:])  # skip the latest, that's the one we're comparing to


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

    # Streak lost — fired once when a ≥3-day streak just broke. Lives in
    # the same alert table as regression/inactivity so the dashboard can
    # surface them all in one ranked feed.
    try:
        from apps.practice.services.streaks import compute_streak
        streak = compute_streak(user)
        if streak.get("just_broken") and not _alert_exists(
            user, DashboardAlert.TYPE_STREAK_LOST,
        ):
            created.append(DashboardAlert.objects.create(
                user=user, institute=user.institute,
                alert_type=DashboardAlert.TYPE_STREAK_LOST,
                severity=DashboardAlert.SEVERITY_INFO,
                title="Your practice streak ended",
                body=(
                    f"You had a {streak.get('longest_days', 0)}-day streak going. "
                    "A 5-minute session today restarts it."
                ),
                payload={
                    "longest_days": streak.get("longest_days", 0),
                    "last_session_date": streak.get("last_session_date"),
                },
                cta_label="Restart your streak",
                cta_target="Speaking",
            ))
    except Exception:
        # Never let alert generation block on a streak hiccup.
        pass

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

    # Re-attempt CTA — last writing/speaking session is ≥0.5 band below the
    # 30-day average for that skill, AND no re-attempt of it exists yet.
    # Surfaces a one-click "try this prompt again with these focus points"
    # alert with payload.parent_session_id so the FE can prefill the form.
    for skill, model_cls, latest in (
        ("writing", WritingSession, _latest_writing_with_band(user)),
        ("speaking", SpeakingSession, _latest_speaking_with_band(user)),
    ):
        if latest is None:
            continue
        latest_band = latest["band"]
        avg = _skill_avg_band(model_cls, user, skill)
        if avg is None or latest_band >= avg - 0.5:
            continue
        # Already alerted on THIS specific session?
        if _alert_exists(
            user, DashboardAlert.TYPE_QUICK_WIN,
            {"kind": "reattempt", "parent_session_id": str(latest["id"])},
        ):
            continue
        # Already re-attempted? Skip — student doesn't need the nudge.
        if model_cls.objects.filter(user=user, parent_session_id=latest["id"]).exists():
            continue
        created.append(DashboardAlert.objects.create(
            user=user, institute=user.institute,
            alert_type=DashboardAlert.TYPE_QUICK_WIN,
            severity=DashboardAlert.SEVERITY_INFO,
            title=f"Re-attempt this {skill} session?",
            body=(
                f"Your latest {skill} session scored {latest_band} — "
                f"about {round(avg - latest_band, 1)} band below your "
                f"30-day average. A focused retry is a quick win."
            ),
            payload={
                "kind": "reattempt",
                "skill": skill,
                "parent_session_id": str(latest["id"]),
                "latest_band": float(latest_band),
                "skill_avg": float(avg),
            },
            cta_label="Re-attempt",
            cta_target=skill.capitalize(),
        ))

    # Calibration coaching — fires when the student systematically over- or
    # under-predicts their band by ≥ 1.0 across the last 30 days. They get
    # one alert per direction; if they swing the other way later, that's a
    # different alert.
    cutoff = timezone.now() - timedelta(days=30)
    cal_stats = CalibrationEntry.objects.filter(
        user=user, created_at__gte=cutoff,
    ).aggregate(avg=Avg("delta"), n=models.Count("id"))
    if (
        cal_stats["n"] and cal_stats["n"] >= 3
        and cal_stats["avg"] is not None
        and abs(float(cal_stats["avg"])) >= 1.0
    ):
        avg_delta = float(cal_stats["avg"])
        direction = "over" if avg_delta > 0 else "under"
        if not _alert_exists(
            user, DashboardAlert.TYPE_QUICK_WIN,
            {"kind": "calibration", "direction": direction},
        ):
            created.append(DashboardAlert.objects.create(
                user=user, institute=user.institute,
                alert_type=DashboardAlert.TYPE_QUICK_WIN,
                severity=DashboardAlert.SEVERITY_INFO,
                title=(
                    f"You {'over' if direction == 'over' else 'under'}-predict your band"
                ),
                body=(
                    f"Across your last {cal_stats['n']} predictions you've been "
                    f"{abs(avg_delta):.1f} band "
                    f"{'higher' if direction == 'over' else 'lower'} than your actual "
                    f"score. Knowing this gap is itself a band 7+ skill — try to "
                    f"close it on your next prediction."
                ),
                payload={
                    "kind": "calibration",
                    "direction": direction,
                    "avg_delta": avg_delta,
                    "samples": int(cal_stats["n"]),
                },
                cta_label="Predict again",
                cta_target="Writing" if direction == "over" else "Speaking",
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
