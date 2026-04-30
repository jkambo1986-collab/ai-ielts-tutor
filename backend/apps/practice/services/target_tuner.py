"""
Adaptive target-band tuner (Hard 2).

The student sets `target_score` once at onboarding. As they practice, that
number drifts from reality:
  - Consistent over-performers stop being challenged by the AI.
  - Consistent under-performers get demoralised by feedback that assumes
    they're already at band 7.

This service runs after each writing/speaking session save and decides
whether to SUGGEST (not silently apply) a target adjustment. The user
accepts/declines via a dashboard alert. Both decisions are logged in
TargetBandHistory so the next call honours the most recent decision.

Rules:
  - 3 consecutive sessions ≥ target + 0.5 → suggest +0.5
  - 5 consecutive sessions ≤ target - 1.0 over 30 days → suggest -0.5
  - Don't suggest within 7 days of the last suggestion (avoid nagging)
  - Floor at 4.0, ceiling at 9.0
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone


def evaluate(user) -> dict | None:
    """Return a suggestion dict ready to be written as a DashboardAlert,
    or None if no change is warranted."""
    from apps.practice.models import (
        DashboardAlert,
        SpeakingSession,
        TargetBandHistory,
        WritingSession,
    )

    # Cooldown: don't suggest within 7 days of the last entry of any kind.
    last = TargetBandHistory.objects.filter(user=user).order_by("-created_at").first()
    if last and (timezone.now() - last.created_at) < timedelta(days=7):
        return None

    target = float(getattr(user, "target_score", None) or 7.0)

    # Pull the latest 5 writing + 5 speaking band scores. We look at the
    # union so the suggestion fires regardless of which skill the student
    # is leaning into.
    bands: list[float] = []
    for b in (
        WritingSession.objects.filter(user=user, deleted_at__isnull=True)
        .order_by("-created_at").values_list("band_score", flat=True)[:5]
    ):
        if b is not None:
            bands.append(float(b))
    for analysis in (
        SpeakingSession.objects.filter(user=user, deleted_at__isnull=True, analysis__isnull=False)
        .order_by("-created_at").values_list("analysis", flat=True)[:5]
    ):
        if isinstance(analysis, dict):
            v = analysis.get("overallBandScore")
            try:
                if v is not None:
                    bands.append(float(v))
            except (TypeError, ValueError):
                pass

    if len(bands) < 3:
        return None

    latest_three = bands[:3]
    if all(b >= target + 0.5 for b in latest_three) and target < 9.0:
        return {
            "direction": "up",
            "suggested_target": min(9.0, target + 0.5),
            "reason": (
                f"Your last 3 sessions averaged {sum(latest_three) / 3:.1f}, "
                f"well above your target of {target:.1f}. Raise your target "
                f"to {min(9.0, target + 0.5):.1f} so the AI keeps challenging you."
            ),
        }

    # Down-suggest: looking over the last 30 days, if 5+ sessions are 1.0+
    # below target, propose a tactical step-down.
    cutoff = timezone.now() - timedelta(days=30)
    recent: list[float] = []
    for b in (
        WritingSession.objects.filter(
            user=user, deleted_at__isnull=True, created_at__gte=cutoff,
        ).values_list("band_score", flat=True)
    ):
        if b is not None:
            recent.append(float(b))
    for analysis in (
        SpeakingSession.objects.filter(
            user=user, deleted_at__isnull=True, analysis__isnull=False,
            created_at__gte=cutoff,
        ).values_list("analysis", flat=True)
    ):
        if isinstance(analysis, dict):
            v = analysis.get("overallBandScore")
            try:
                if v is not None:
                    recent.append(float(v))
            except (TypeError, ValueError):
                pass
    below = [b for b in recent if b <= target - 1.0]
    if len(below) >= 5 and target > 4.0:
        return {
            "direction": "down",
            "suggested_target": max(4.0, target - 0.5),
            "reason": (
                f"You've scored 1.0+ below target on {len(below)} sessions in the "
                f"last 30 days. Stepping down to {max(4.0, target - 0.5):.1f} "
                f"rebuilds momentum; you can raise it again in a few weeks."
            ),
        }

    return None


def emit_alert_if_needed(user) -> "DashboardAlert | None":
    """Run the evaluator and persist a DashboardAlert when there's a
    suggestion. Returns the new alert (or None). Idempotent within the
    7-day cooldown."""
    from apps.practice.models import DashboardAlert
    suggestion = evaluate(user)
    if suggestion is None:
        return None
    institute = getattr(user, "institute", None)
    if not institute:
        return None
    return DashboardAlert.objects.create(
        user=user, institute=institute,
        alert_type=DashboardAlert.TYPE_QUICK_WIN,
        severity=DashboardAlert.SEVERITY_INFO,
        title=("Raise your target band?" if suggestion["direction"] == "up" else "Step your target down?"),
        body=suggestion["reason"],
        payload={
            "kind": "target_tune",
            "direction": suggestion["direction"],
            "suggested_target": suggestion["suggested_target"],
            "current_target": float(getattr(user, "target_score", None) or 7.0),
        },
        cta_label=f"Set to {suggestion['suggested_target']:.1f}",
        cta_target="Profile",
    )
