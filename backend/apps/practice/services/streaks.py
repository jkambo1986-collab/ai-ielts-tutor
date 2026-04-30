"""
Streak computation — consecutive days with at least one practice session.

A "session" is any of WritingSession / SpeakingSession / ReadingSession /
ListeningSession created by the user. We compute the streak from a
distinct-by-day union over the four tables, walking backwards from today.

The streak is *grace-aware*: if the user has practiced today OR yesterday,
their streak is alive. Only a 2-full-day gap breaks it. This matches what
a learner expects (a missed evening doesn't count as "you broke it").
"""

from __future__ import annotations

from datetime import date, timedelta

from django.utils import timezone

from apps.practice.models import (
    ListeningSession,
    ReadingSession,
    SpeakingSession,
    WritingSession,
)


def _session_days(user) -> set[date]:
    """Set of dates on which the user practised any skill."""
    days: set[date] = set()
    for model in (WritingSession, SpeakingSession, ReadingSession, ListeningSession):
        for ts in (
            model.objects.filter(user=user, deleted_at__isnull=True)
            .values_list("created_at", flat=True)
            .iterator()
        ):
            days.add(timezone.localtime(ts).date())
    return days


def compute_streak(user) -> dict:
    """Return a snapshot of the user's streak state.

    Shape:
      - current_days: int — current run length (0 when broken)
      - longest_days: int — longest run ever observed for this user
      - last_session_date: ISO date string or None
      - is_at_risk: True when streak is alive but no session yet today
        (the FE / notifier uses this to remind the user before the day ends)
      - just_broken: True when there WAS a streak ≥ 3 ending yesterday/before
        but no session today/yesterday — a one-shot signal for STREAK_LOST.
    """
    days = _session_days(user)
    if not days:
        return {
            "current_days": 0,
            "longest_days": 0,
            "last_session_date": None,
            "is_at_risk": False,
            "just_broken": False,
        }

    today = timezone.localtime(timezone.now()).date()
    sorted_days = sorted(days)
    last = sorted_days[-1]

    # Current streak: walk backwards from today (or yesterday) until a gap.
    if today in days:
        cursor = today
    elif (today - timedelta(days=1)) in days:
        cursor = today - timedelta(days=1)
    else:
        cursor = None

    current = 0
    if cursor is not None:
        while cursor in days:
            current += 1
            cursor -= timedelta(days=1)

    # Longest streak ever — single pass over sorted distinct days.
    longest = 1
    run = 1
    for i in range(1, len(sorted_days)):
        if sorted_days[i] - sorted_days[i - 1] == timedelta(days=1):
            run += 1
            longest = max(longest, run)
        else:
            run = 1

    is_at_risk = current > 0 and today not in days
    # "Just broken": last activity was 2+ days ago, AND prior streak was ≥ 3
    # (otherwise it wasn't really a streak worth mourning).
    gap_days = (today - last).days
    just_broken = False
    if gap_days >= 2:
        # Reconstruct the most-recent run that ended at `last`.
        run_back = 1
        c = last - timedelta(days=1)
        while c in days:
            run_back += 1
            c -= timedelta(days=1)
        just_broken = run_back >= 3

    return {
        "current_days": current,
        "longest_days": longest,
        "last_session_date": last.isoformat(),
        "is_at_risk": is_at_risk,
        "just_broken": just_broken,
    }
