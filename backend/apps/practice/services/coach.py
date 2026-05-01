"""
Daily Coach Brief composer.

Produces a 3-line directive plan for the user's next ~25 minutes, deterministic
and AI-free — composed from existing data (target gap per skill, due SRS cards,
exam date proximity, daily commitment). The whole platform's intelligence
collapsed into one decision: *what should I do right now?*

Returns: {
    minutes_budget: int,
    actions: [
        { skill, label, minutes_estimate, reason, target }
    ],
    generated_at: iso8601
}
"""

from __future__ import annotations

from datetime import timedelta
from statistics import mean

from django.utils import timezone

from apps.practice.models import (
    ErrorCard,
    ListeningSession,
    ReadingSession,
    SpeakingSession,
    WritingSession,
)


def _avg_or_none(values):
    return mean(values) if values else None


def _skill_avg(model_cls, user, kind: str) -> float | None:
    """Average band over the last 30 days for a skill. Pulls
    band_score for writing/reading/listening, analysis['overallBandScore']
    for speaking."""
    cutoff = timezone.now() - timedelta(days=30)
    qs = model_cls.objects.filter(
        user=user, deleted_at__isnull=True, created_at__gte=cutoff,
    )
    if kind == "speaking":
        rows = list(qs.filter(analysis__isnull=False).values_list("analysis", flat=True))
        bands: list[float] = []
        for a in rows:
            if isinstance(a, dict) and a.get("overallBandScore") is not None:
                try:
                    bands.append(float(a["overallBandScore"]))
                except (TypeError, ValueError):
                    pass
        return _avg_or_none(bands)
    bands = [float(b) for b in qs.values_list("band_score", flat=True) if b is not None]
    return _avg_or_none(bands)


def compose(user) -> dict:
    target = float(user.target_score or 7.0)

    # Gap per skill (target - avg). Larger gap = more deserving of attention.
    skill_models = {
        "writing": WritingSession,
        "speaking": SpeakingSession,
        "reading": ReadingSession,
        "listening": ListeningSession,
    }
    skill_avgs = {k: _skill_avg(m, user, k) for k, m in skill_models.items()}
    gaps: list[tuple[str, float, float | None]] = []
    for skill, avg in skill_avgs.items():
        if avg is None:
            gaps.append((skill, 99.0, None))  # never practiced — push to top
        else:
            gaps.append((skill, target - avg, avg))
    gaps.sort(key=lambda x: -x[1])

    # SRS due cards
    due_count = ErrorCard.objects.filter(
        user=user, archived_at__isnull=True, due_at__lte=timezone.now(),
    ).count()

    # Daily budget — fall back to 25 min if not set.
    minutes_budget = int(user.daily_commitment_minutes or 25)

    actions: list[dict] = []

    # Action 1: hit the weakest skill
    weakest_skill, gap, avg = gaps[0]
    skill_label = weakest_skill.capitalize()
    skill_minutes = min(15, max(8, minutes_budget // 2))
    if avg is None:
        reason = f"No {weakest_skill} sessions yet — get a baseline."
    else:
        reason = (
            f"Your {weakest_skill} avg is {avg:.1f}, "
            f"{gap:.1f} below your target of {target:.1f}."
        )
    actions.append({
        "skill": weakest_skill,
        "label": f"Run a {skill_label} session",
        "minutes_estimate": skill_minutes,
        "reason": reason,
        "target": skill_label,
    })

    # Action 2: SRS review if there are due cards
    if due_count > 0:
        srs_minutes = min(7, max(3, due_count // 3))
        actions.append({
            "skill": "srs",
            "label": f"Review {due_count} due flashcard{'s' if due_count != 1 else ''}",
            "minutes_estimate": srs_minutes,
            "reason": "Spaced repetition locks weak items in long-term memory.",
            "target": "Dashboard",
        })

    # Action 3: second-weakest skill or daily challenge
    second_skill, second_gap, second_avg = gaps[1] if len(gaps) > 1 else (None, 0, None)
    if second_skill and second_gap > 0:
        used = sum(a["minutes_estimate"] for a in actions)
        remaining = max(5, minutes_budget - used)
        actions.append({
            "skill": second_skill,
            "label": f"Quick {second_skill.capitalize()} drill",
            "minutes_estimate": min(10, remaining),
            "reason": (
                f"{second_skill.capitalize()} avg {second_avg:.1f}"
                if second_avg is not None
                else f"Round out the day with some {second_skill}."
            ),
            "target": second_skill.capitalize(),
        })

    # Trim to 3 max
    actions = actions[:3]

    return {
        "minutes_budget": minutes_budget,
        "actions": actions,
        "due_card_count": due_count,
        "target_band": target,
        "generated_at": timezone.now().isoformat(),
    }
