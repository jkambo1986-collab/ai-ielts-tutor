"""
Badge awarder + catalogue.

Append-only — `award(user, code, ...)` is idempotent because of the unique
(user, code) constraint. We catch the IntegrityError silently so callers
don't need to check existence first.

Badges are evaluated at well-known event points (session save, streak
update, calibration entry created). The awarder is a free function rather
than a Django signal so it stays trivial to unit-test.
"""

from __future__ import annotations

import logging

from django.db import IntegrityError

from apps.practice.models import Badge

log = logging.getLogger(__name__)

# Badge catalogue — code → (title, description). Adding new badges here
# does NOT need a migration because `code` is a CharField.
CATALOGUE: dict[str, tuple[str, str]] = {
    "streak_7": ("7-day streak", "Practised every day for a week."),
    "streak_30": ("30-day streak", "A full month of daily practice — that's exam-ready discipline."),
    "streak_100": ("100-day streak", "Three months of consecutive practice. Exceptional consistency."),
    "first_session": ("First session", "You started — that's the hardest part."),
    "calibration_within_half": (
        "Spot-on prediction",
        "You predicted your band within ±0.5 — that's a band 7+ self-awareness skill.",
    ),
    "calibration_consistent": (
        "Calibrated examiner",
        "Five consecutive predictions within ±0.5 of your actual score.",
    ),
    "b2_vocab_100": ("B2 explorer", "100 unique B2+ words observed in your output."),
    "b2_vocab_500": ("Lexical range", "500 unique B2+ words — your vocab is exam-grade."),
    "mock_test_complete": (
        "Mock test finisher",
        "Completed a full timed mock test end-to-end.",
    ),
    "all_four_skills_in_a_week": (
        "Quadrathlon",
        "Practised all four skills (writing, speaking, reading, listening) in 7 days.",
    ),
    "first_band_7": ("First 7", "Hit band 7 on a session for the first time."),
    "first_band_8": ("First 8", "Reached band 8."),
}


def award(user, code: str, *, payload: dict | None = None) -> Badge | None:
    """Idempotent badge award. Returns the new Badge row, or None if the
    user already has it (or institute is missing — defensive)."""
    if code not in CATALOGUE:
        log.warning("award: unknown badge code %r", code)
        return None
    institute = getattr(user, "institute", None)
    if not institute:
        return None
    title, desc = CATALOGUE[code]
    try:
        return Badge.objects.create(
            user=user, institute=institute,
            code=code, title=title, description=desc,
            payload=payload or {},
        )
    except IntegrityError:
        # Already earned. The dedup IS the contract — return silently.
        return None


def evaluate_streak_badges(user, current_days: int) -> list[Badge]:
    """Award any streak badges the user has just earned. Caller passes
    `current_days` so we don't have to recompute the streak inline."""
    out: list[Badge] = []
    if current_days >= 7:
        b = award(user, "streak_7")
        if b: out.append(b)
    if current_days >= 30:
        b = award(user, "streak_30")
        if b: out.append(b)
    if current_days >= 100:
        b = award(user, "streak_100")
        if b: out.append(b)
    return out


def evaluate_session_badges(user, *, band: float | None = None, kind: str = "writing") -> list[Badge]:
    """Award per-session badges. Called after a writing/speaking session
    finishes and we know the band."""
    out: list[Badge] = []
    # First session ever (across any skill) — quick win for new users.
    from apps.practice.models import (
        ListeningSession, ReadingSession, SpeakingSession, WritingSession,
    )
    total = sum(
        m.objects.filter(user=user, deleted_at__isnull=True).count()
        for m in (WritingSession, SpeakingSession, ReadingSession, ListeningSession)
    )
    if total <= 1:
        b = award(user, "first_session")
        if b: out.append(b)
    if band is not None:
        if band >= 7.0:
            b = award(user, "first_band_7")
            if b: out.append(b)
        if band >= 8.0:
            b = award(user, "first_band_8")
            if b: out.append(b)
    return out


def evaluate_calibration_badges(user) -> list[Badge]:
    """Reward accurate band prediction streaks."""
    from apps.practice.models import CalibrationEntry
    recent = list(
        CalibrationEntry.objects.filter(user=user)
        .order_by("-created_at").values_list("delta", flat=True)[:5]
    )
    out: list[Badge] = []
    if recent and abs(float(recent[0])) <= 0.5:
        b = award(user, "calibration_within_half")
        if b: out.append(b)
    if len(recent) >= 5 and all(abs(float(d)) <= 0.5 for d in recent):
        b = award(user, "calibration_consistent")
        if b: out.append(b)
    return out


def evaluate_vocab_badges(user) -> list[Badge]:
    from apps.practice.models import VocabularyObservation
    count = VocabularyObservation.objects.filter(
        user=user, deleted_at__isnull=True,
        cefr_level__in=["B2", "C1", "C2"],
    ).count()
    out: list[Badge] = []
    if count >= 100:
        b = award(user, "b2_vocab_100")
        if b: out.append(b)
    if count >= 500:
        b = award(user, "b2_vocab_500")
        if b: out.append(b)
    return out
