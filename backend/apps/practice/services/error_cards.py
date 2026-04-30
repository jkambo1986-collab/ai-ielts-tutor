"""
Auto-extract `ErrorCard` rows from writing/speaking AI feedback.

Without this, ErrorCards (the SRS flashcard system) only get rows when a
student or instructor manually POSTs them — friction that meant nearly
every real user had an empty SRS queue. This module closes the loop by
mining each AI feedback object for verbatim error patterns and turning
them into review cards.

Design rules:
  - Never raise. A malformed feedback shape must not block the request
    that called us; on any error we log + return an empty list.
  - Cap at MAX_CARDS_PER_SESSION (2) so one session can't swamp the queue.
  - Skip a card whose error_text already exists as an active card for the
    same user (cheap dedup; doesn't catch near-duplicates but catches the
    common case of the same recurring sentence pattern).
  - Use verbatim quotes from `relevantSentences` (writing) or `example`
    (speaking) — generic example sentences are skipped because they teach
    the student nothing about their own output.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.utils import timezone

from apps.practice.models import ErrorCard

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.tenants.models import Institute

log = logging.getLogger(__name__)

MAX_CARDS_PER_SESSION = 2

# Map writing feedback criterion → ErrorCard category.
_WRITING_CRITERION_TO_CATEGORY = {
    "taskAchievement": ErrorCard.CATEGORY_TASK,
    "coherenceAndCohesion": ErrorCard.CATEGORY_COHERENCE,
    "lexicalResource": ErrorCard.CATEGORY_LEXICAL,
    "grammaticalRangeAndAccuracy": ErrorCard.CATEGORY_GRAMMAR,
}

# Map speaking analysis criterion → ErrorCard category.
_SPEAKING_CRITERION_TO_CATEGORY = {
    "fluencyAndCoherence": ErrorCard.CATEGORY_FLUENCY,
    "lexicalResource": ErrorCard.CATEGORY_LEXICAL,
    "grammaticalRangeAndAccuracy": ErrorCard.CATEGORY_GRAMMAR,
    "pronunciation": ErrorCard.CATEGORY_PRONUNCIATION,
}


def _existing_active_error_texts(user) -> set[str]:
    """Snapshot of error_text values already in the user's active cards.
    Used to dedup before creating new ones."""
    return set(
        ErrorCard.objects.filter(user=user, archived_at__isnull=True)
        .values_list("error_text", flat=True)
    )


def _safe_str(v) -> str:
    if not isinstance(v, str):
        return ""
    return v.strip()


def _build_correction_lookup(feedback: dict) -> dict[str, str]:
    """Map original-sentence → suggested-sentence from the feedback's
    `vocabularyEnhancements` section. Lets us pre-fill `correction_text`
    when the AI already proposed a rewrite for the same sentence we're
    turning into a card."""
    out: dict[str, str] = {}
    enh = feedback.get("vocabularyEnhancements") if isinstance(feedback, dict) else None
    if not isinstance(enh, list):
        return out
    for item in enh:
        if not isinstance(item, dict):
            continue
        orig = _safe_str(item.get("originalSentence"))
        sug = _safe_str(item.get("suggestedSentence"))
        if orig and sug:
            out[orig] = sug
    return out


def extract_from_writing_feedback(
    *,
    user: "User",
    institute: "Institute",
    session_id,
    feedback: dict,
) -> list[ErrorCard]:
    """Mine the writing-eval feedback for new SRS cards.

    Looks at each of the four criteria's `relevantSentences[]`. For each
    sentence (verbatim quote from the student's essay), creates one card
    in the matching category. Skips sentences that are already active
    cards. Returns the list of newly-created cards.
    """
    if not isinstance(feedback, dict):
        return []
    try:
        criteria = feedback.get("feedback") or {}
        if not isinstance(criteria, dict):
            return []
        existing = _existing_active_error_texts(user)
        corrections = _build_correction_lookup(feedback)
        created: list[ErrorCard] = []

        for criterion_key, category in _WRITING_CRITERION_TO_CATEGORY.items():
            if len(created) >= MAX_CARDS_PER_SESSION:
                break
            crit = criteria.get(criterion_key) or {}
            if not isinstance(crit, dict):
                continue
            sentences = crit.get("relevantSentences") or []
            if not isinstance(sentences, list):
                continue
            explanation = _safe_str(crit.get("text"))[:1000]
            for sent in sentences:
                if len(created) >= MAX_CARDS_PER_SESSION:
                    break
                error_text = _safe_str(sent)
                # Filter out trivially short or generic sentences.
                if len(error_text) < 12 or error_text in existing:
                    continue
                card = ErrorCard.objects.create(
                    user=user,
                    institute=institute,
                    source_session_type="writing",
                    source_session_id=session_id,
                    category=category,
                    error_text=error_text[:2000],
                    correction_text=corrections.get(error_text, "")[:2000],
                    explanation=explanation,
                    due_at=timezone.now(),
                )
                created.append(card)
                existing.add(error_text)
        return created
    except Exception:
        log.warning("Auto-extract from writing feedback failed", exc_info=True)
        return []


def extract_from_speaking_analysis(
    *,
    user: "User",
    institute: "Institute",
    session_id,
    analysis: dict,
) -> list[ErrorCard]:
    """Mine the speaking analysis for new SRS cards.

    Looks at each criterion's `example` field (verbatim quote from the
    user's transcript). Also creates a dedicated pronunciation card from
    `pronunciationAnalysis.problemWords` when present. Skips duplicates;
    caps at MAX_CARDS_PER_SESSION.
    """
    if not isinstance(analysis, dict):
        return []
    try:
        existing = _existing_active_error_texts(user)
        created: list[ErrorCard] = []

        # Per-criterion cards from verbatim transcript examples.
        for criterion_key, category in _SPEAKING_CRITERION_TO_CATEGORY.items():
            if len(created) >= MAX_CARDS_PER_SESSION:
                break
            point = analysis.get(criterion_key) or {}
            if not isinstance(point, dict):
                continue
            example = _safe_str(point.get("example"))
            explanation = _safe_str(point.get("feedback"))[:1000]
            if len(example) < 12 or example in existing:
                continue
            card = ErrorCard.objects.create(
                user=user,
                institute=institute,
                source_session_type="speaking",
                source_session_id=session_id,
                category=category,
                error_text=example[:2000],
                correction_text="",
                explanation=explanation,
                due_at=timezone.now(),
            )
            created.append(card)
            existing.add(example)

        # Pronunciation analysis is its own structured object; promote its
        # problem words to a dedicated pronunciation card if there's room.
        if len(created) < MAX_CARDS_PER_SESSION:
            pron = analysis.get("pronunciationAnalysis")
            if isinstance(pron, dict):
                target = _safe_str(pron.get("targetPhoneme"))
                problem_words = pron.get("problemWords") or []
                explanation = _safe_str(pron.get("explanation"))[:1000]
                if target and isinstance(problem_words, list) and problem_words:
                    error_text = (
                        f"Pronunciation: /{target}/ in "
                        + ", ".join(_safe_str(w) for w in problem_words if _safe_str(w))[:500]
                    )
                    if error_text and error_text not in existing:
                        card = ErrorCard.objects.create(
                            user=user,
                            institute=institute,
                            source_session_type="speaking",
                            source_session_id=session_id,
                            category=ErrorCard.CATEGORY_PRONUNCIATION,
                            error_text=error_text[:2000],
                            correction_text="",
                            explanation=explanation,
                            due_at=timezone.now(),
                        )
                        created.append(card)

        return created
    except Exception:
        log.warning("Auto-extract from speaking analysis failed", exc_info=True)
        return []
