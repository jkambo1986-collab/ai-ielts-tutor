"""
Score-guarantee eligibility predictor (T3#15).

Heuristic only — does NOT issue refunds, store financial commitments, or
emit any contract. The output is a yes/no plus a confidence level the
business can use to gate promotional copy or B2B outreach.

Eligibility rule (intentionally conservative; rebalance with real data
later):
  - Practised in ≥ 4 of the last 4 weeks (consistency signal)
  - Practice minutes >= 200 in the last 30 days (effort signal)
  - Latest band on at least one skill is within 1.0 of target (trajectory)
  - Calibration delta over 30 days ≤ 1.5 (self-awareness — bad calibration
    is the #1 predictor of inflated targets that we cannot deliver on)

Returns a dict with `eligible: bool`, the four signal values, and a
recommended program tier ('full', 'limited', None).
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import Avg, Sum
from django.utils import timezone


def assess(user) -> dict:
    """Run the eligibility heuristic for a user."""
    from apps.practice.models import (
        CalibrationEntry,
        ListeningSession,
        ReadingSession,
        SpeakingSession,
        WritingSession,
    )

    now = timezone.now()
    cutoff_30 = now - timedelta(days=30)
    cutoff_4w = now - timedelta(weeks=4)

    # Consistency: distinct practice weeks in the last 4 weeks.
    weeks_active = set()
    for model in (WritingSession, SpeakingSession, ReadingSession, ListeningSession):
        for ts in model.objects.filter(
            user=user, deleted_at__isnull=True, created_at__gte=cutoff_4w,
        ).values_list("created_at", flat=True):
            d = timezone.localtime(ts).date()
            week_start = d - timedelta(days=d.weekday())
            weeks_active.add(week_start)
    consistency_weeks = len(weeks_active)

    # Effort: total practice minutes in last 30 days.
    minutes = 0
    for model in (WritingSession, SpeakingSession, ReadingSession, ListeningSession):
        agg = model.objects.filter(
            user=user, deleted_at__isnull=True, created_at__gte=cutoff_30,
        ).aggregate(s=Sum("duration_seconds"))
        minutes += int(agg.get("s") or 0) // 60

    # Trajectory: latest band on any skill within 1.0 of target.
    target = float(getattr(user, "target_score", None) or 7.0)
    latest_writing = WritingSession.objects.filter(
        user=user, deleted_at__isnull=True,
    ).order_by("-created_at").values_list("band_score", flat=True).first()
    latest_speaking_band = None
    sp = SpeakingSession.objects.filter(
        user=user, deleted_at__isnull=True, analysis__isnull=False,
    ).order_by("-created_at").values_list("analysis", flat=True).first()
    if isinstance(sp, dict):
        try:
            latest_speaking_band = float(sp.get("overallBandScore") or 0)
        except (TypeError, ValueError):
            latest_speaking_band = None
    bands = [b for b in [
        float(latest_writing) if latest_writing is not None else None,
        latest_speaking_band,
    ] if b is not None]
    trajectory_ok = any(target - b <= 1.0 for b in bands) if bands else False

    # Calibration: |avg delta| ≤ 1.5 over 30 days.
    delta = (
        CalibrationEntry.objects.filter(user=user, created_at__gte=cutoff_30)
        .aggregate(avg=Avg("delta")).get("avg")
    )
    calibration_ok = (delta is None) or (abs(float(delta)) <= 1.5)

    consistency_ok = consistency_weeks >= 4
    effort_ok = minutes >= 200

    signals = {
        "consistency_weeks": consistency_weeks,
        "consistency_ok": consistency_ok,
        "effort_minutes_30d": minutes,
        "effort_ok": effort_ok,
        "best_recent_band": max(bands) if bands else None,
        "trajectory_ok": trajectory_ok,
        "calibration_avg_delta": float(delta) if delta is not None else None,
        "calibration_ok": calibration_ok,
        "target_band": target,
    }

    # Tiering: full = all four ok; limited = three of four; otherwise no.
    score = sum([consistency_ok, effort_ok, trajectory_ok, calibration_ok])
    if score == 4:
        tier = "full"
    elif score == 3:
        tier = "limited"
    else:
        tier = None

    return {
        "eligible": tier is not None,
        "tier": tier,
        "signals": signals,
    }
