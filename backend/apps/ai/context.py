"""
StudentContext — the shared bundle every agent reads from to collaborate.

Every AI agent in `apps.ai.service` takes an optional `ctx: StudentContext`.
When supplied, the agent injects the relevant slice into its prompt so the
output is conditioned on what the rest of the system already knows about
the learner: target band, L1, recurring weaknesses, recent topics, vocab
gaps, and active SRS error patterns.

Build it once per request via `build_for_user(user)`, then thread it through.

The bundle is intentionally compact — each list is capped at 3-5 items so
the per-call token cost stays bounded (~300-600 extra tokens). Refresh on
every request; weaknesses change as students complete sessions, and a
single in-memory dataclass costs nothing to rebuild against indexed reads.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import timedelta
from typing import TYPE_CHECKING

from django.db.models import Avg
from django.utils import timezone

if TYPE_CHECKING:
    from apps.accounts.models import User

log = logging.getLogger(__name__)


_RECENT_SESSIONS_LIMIT = 5
_RECENT_TOPICS_LIMIT = 5
_ERROR_CARDS_LIMIT = 5
_TARGET_VOCAB_LIMIT = 8


@dataclass
class StudentContext:
    """Snapshot of everything the AI tutor needs to know about a student.

    Use `prompt_block(focus=...)` to render only the relevant slice for an
    agent — the writing evaluator doesn't need recent listening topics, the
    quiz generator doesn't need pronunciation analysis, etc.
    """

    user_id: str
    target_band: float = 7.0
    native_language: str | None = None
    proficiency: str | None = None
    days_until_exam: int | None = None

    # Top recurring weaknesses surfaced by prior weakness-analysis runs.
    writing_weaknesses: list[str] = field(default_factory=list)
    speaking_weaknesses: list[str] = field(default_factory=list)

    # Recent topic memory — drives cross-skill thematic continuity.
    recent_reading_topics: list[str] = field(default_factory=list)
    recent_listening_topics: list[str] = field(default_factory=list)

    # Most recent band per skill — lets generators tune difficulty to where
    # the student actually is, not just their stated target.
    recent_writing_band: float | None = None
    recent_speaking_band: float | None = None
    recent_reading_band: float | None = None
    recent_listening_band: float | None = None

    # Vocab state — drives reinforcement across skills.
    advanced_vocab_count: int = 0  # unique B2+ words ever observed
    target_vocab_lemmas: list[str] = field(default_factory=list)

    # Active SRS error cards — the patterns the student is currently drilling.
    active_error_categories: list[str] = field(default_factory=list)
    sample_error_patterns: list[str] = field(default_factory=list)

    # Calibration: avg(predicted - actual). Positive = over-predicts.
    avg_band_delta: float | None = None

    # Streak — consecutive days with ≥1 session. Surfaced so agents can
    # praise momentum or prompt recovery.
    current_streak_days: int = 0

    # ----- Render helpers ----- #

    def is_empty(self) -> bool:
        """True when nothing useful is known — e.g. brand-new student.

        Used to short-circuit `prompt_block` so empty contexts don't even
        emit the "// STUDENT CONTEXT" header. Must enumerate EVERY signal
        the renderer would surface; if any is set, we're not empty.
        """
        return not (
            self.writing_weaknesses
            or self.speaking_weaknesses
            or self.recent_reading_topics
            or self.recent_listening_topics
            or self.target_vocab_lemmas
            or self.sample_error_patterns
            or self.active_error_categories
            or self.recent_writing_band
            or self.recent_speaking_band
            or self.recent_reading_band
            or self.recent_listening_band
            or self.advanced_vocab_count
            or self.avg_band_delta is not None
            or self.days_until_exam is not None
            or self.current_streak_days
        )

    def _l1_line(self) -> str:
        if not self.native_language or self.native_language == "other":
            return ""
        label = _L1_LABELS.get(self.native_language)
        if not label:
            return ""
        return (
            f"- L1 (first language): {label}. Bias toward L1-typical errors "
            f"({_L1_TYPICAL_ERRORS.get(self.native_language, 'common transfer issues')})."
        )

    def _exam_line(self) -> str:
        if self.days_until_exam is None:
            return ""
        if self.days_until_exam <= 0:
            return "- Exam date: imminent or today."
        if self.days_until_exam <= 14:
            return f"- Exam date: {self.days_until_exam} days away — prioritise high-leverage fixes."
        return f"- Exam date: {self.days_until_exam} days away."

    def prompt_block(self, focus: str = "general", suppress_l1: bool = False) -> str:
        """Render the relevant slice of context as a prompt fragment.

        `focus` selects which signals to emphasise: 'writing', 'speaking',
        'reading', 'listening', 'quiz', 'integrated', or 'general'. Always
        includes target band + L1 hint regardless of focus.

        `suppress_l1=True` skips the L1 line — used by callers that already
        inject an L1 hint themselves (e.g. build_speaking_system_instruction)
        so the live system prompt doesn't carry the hint twice.
        """
        if self.is_empty() and not self.native_language and self.target_band == 7.0:
            # Truly nothing to add — return empty so the prompt stays clean.
            return ""

        lines: list[str] = ["// STUDENT CONTEXT (use to tailor feedback / content)"]
        lines.append(f"- Target IELTS band: {self.target_band:.1f}")
        if self.proficiency:
            lines.append(f"- Self-rated proficiency: {self.proficiency.replace('_', ' ')}")
        if not suppress_l1:
            l1 = self._l1_line()
            if l1:
                lines.append(l1)
        exam = self._exam_line()
        if exam:
            lines.append(exam)

        # Cross-skill weakness summary — every focus benefits from knowing both.
        if focus in ("writing", "general", "integrated", "quiz") and self.writing_weaknesses:
            lines.append("- Recurring writing weaknesses: " + "; ".join(self.writing_weaknesses[:3]))
        if focus in ("speaking", "general", "integrated") and self.speaking_weaknesses:
            lines.append("- Recurring speaking weaknesses: " + "; ".join(self.speaking_weaknesses[:3]))

        # Recent skill levels — calibration for content generators.
        if focus in ("reading", "general", "integrated") and self.recent_reading_band:
            lines.append(f"- Recent reading band: {self.recent_reading_band:.1f}")
        if focus in ("listening", "general", "integrated") and self.recent_listening_band:
            lines.append(f"- Recent listening band: {self.recent_listening_band:.1f}")
        if focus == "general" and self.recent_writing_band:
            lines.append(f"- Recent writing band: {self.recent_writing_band:.1f}")
        if focus == "general" and self.recent_speaking_band:
            lines.append(f"- Recent speaking band: {self.recent_speaking_band:.1f}")

        # Topic memory — drives thematic continuity.
        if focus in ("speaking", "writing", "integrated", "general") and self.recent_reading_topics:
            lines.append("- Recently read topics: " + ", ".join(self.recent_reading_topics[:3]))
        if focus in ("speaking", "writing", "integrated", "general") and self.recent_listening_topics:
            lines.append("- Recently heard topics: " + ", ".join(self.recent_listening_topics[:3]))

        # Vocabulary reinforcement — high-leverage for quiz/reading/integrated.
        if self.advanced_vocab_count and focus in ("writing", "speaking", "general"):
            lines.append(f"- Advanced (B2+) unique vocabulary observed: {self.advanced_vocab_count}")
        if self.target_vocab_lemmas and focus in ("quiz", "reading", "integrated", "writing", "speaking", "general"):
            lines.append(
                "- Target vocabulary to reinforce: "
                + ", ".join(self.target_vocab_lemmas[:_TARGET_VOCAB_LIMIT])
            )

        # SRS error patterns — the student's current drill targets.
        if self.active_error_categories and focus in ("writing", "speaking", "quiz", "general"):
            lines.append(
                "- Active error categories (SRS): " + ", ".join(self.active_error_categories[:4])
            )
        if self.sample_error_patterns and focus in ("writing", "speaking", "quiz", "general"):
            samples = "; ".join(p[:80] for p in self.sample_error_patterns[:3])
            lines.append(f"- Sample error patterns being drilled: {samples}")

        # Calibration nudge — only meaningful when the student systematically miscalibrates.
        if (
            self.avg_band_delta is not None
            and abs(self.avg_band_delta) >= 0.5
            and focus in ("writing", "speaking", "general")
        ):
            direction = "over-predicts" if self.avg_band_delta > 0 else "under-predicts"
            lines.append(
                f"- Calibration: student systematically {direction} band by "
                f"{abs(self.avg_band_delta):.1f} — be candid about the gap."
            )

        # Streak — surface only when it's worth acknowledging (≥3 days).
        if self.current_streak_days >= 3 and focus in ("writing", "speaking", "general"):
            lines.append(
                f"- Practice streak: {self.current_streak_days} consecutive days — "
                f"acknowledge the momentum without over-praising."
            )

        if len(lines) == 1:  # only the header, nothing to add
            return ""
        return "\n".join(lines)


# ----- Build helpers ----- #

_L1_LABELS = {
    "ar": "Arabic", "bn": "Bengali", "zh": "Mandarin Chinese",
    "yue": "Cantonese", "nl": "Dutch", "fa": "Farsi", "fil": "Filipino",
    "fr": "French", "de": "German", "gu": "Gujarati", "hi": "Hindi",
    "id": "Indonesian", "it": "Italian", "ja": "Japanese", "kk": "Kazakh",
    "ko": "Korean", "ms": "Malay", "ne": "Nepali", "pl": "Polish",
    "pt": "Portuguese", "pa": "Punjabi", "ru": "Russian", "es": "Spanish",
    "ta": "Tamil", "te": "Telugu", "th": "Thai", "tr": "Turkish",
    "uk": "Ukrainian", "ur": "Urdu", "vi": "Vietnamese",
}

# One-line hints of the most common transfer errors per L1 — used to bias
# weakness analysis without needing a per-call lookup table inside agents.
_L1_TYPICAL_ERRORS = {
    "ar": "definite article over-/under-use, /p/-/b/ confusion, vowel quality",
    "bn": "tense agreement, articles, /v/-/w/ confusion",
    "zh": "tense markers, plural -s, articles, /θ/ vs /s/",
    "yue": "tense markers, plural -s, /θ/ vs /f/",
    "nl": "phrasal verb misuse, word order in subordinate clauses",
    "fa": "articles, prepositions, /w/ vs /v/",
    "fil": "tense, prepositions, vowel reduction",
    "fr": "/h/ dropping, /θ/ vs /s/, false cognates",
    "de": "word order, /v/ vs /w/, false cognates",
    "gu": "tense, articles, /v/ vs /w/",
    "hi": "articles, tense agreement, /v/ vs /w/",
    "id": "tense, plural -s, articles",
    "it": "/h/ dropping, vowel insertion in clusters, false cognates",
    "ja": "articles, plural -s, /l/ vs /r/",
    "kk": "articles, prepositions, vowel quality",
    "ko": "articles, plural -s, /l/ vs /r/, /f/ vs /p/",
    "ms": "tense, plural -s, articles",
    "ne": "tense, articles, /v/ vs /w/",
    "pl": "articles, vowel quality, /θ/ vs /s/",
    "pt": "false cognates, vowel reduction, /θ/ vs /t/",
    "pa": "tense, articles, /v/ vs /w/",
    "ru": "articles, aspect, /θ/ vs /s/, vowel reduction",
    "es": "/h/ dropping, vowel insertion in clusters, /θ/ vs /s/",
    "ta": "tense, articles, /v/ vs /w/",
    "te": "tense, articles, /v/ vs /w/",
    "th": "final consonants, /θ/ vs /t/, tone interference",
    "tr": "articles, vowel harmony interference, word order",
    "uk": "articles, aspect, /θ/ vs /s/",
    "ur": "tense, articles, /v/ vs /w/",
    "vi": "final consonants, tone interference, plural -s",
}


def _extract_weakness_summaries(weakness_obj) -> list[str]:
    """Pull short summaries out of a WeaknessAnalysisCache.analysis blob.

    Authoritative schema (apps.ai.schemas.WEAKNESS_ANALYSIS_SCHEMA) is
    `{ recurringWeaknesses: [{ weakness, suggestion }] }`. We tolerate the
    legacy {weaknesses:[{summary}]} shape too, but never raise — a stale
    cache row should degrade to an empty list, not break the request.
    """
    if not isinstance(weakness_obj, dict):
        return []
    items = (
        weakness_obj.get("recurringWeaknesses")
        or weakness_obj.get("weaknesses")
        or []
    )
    out: list[str] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        text = (
            it.get("weakness")
            or it.get("summary")
            or it.get("title")
            or ""
        )
        if text:
            out.append(text.strip()[:140])
    return out


def build_for_user(user: "User") -> StudentContext:
    """Assemble a `StudentContext` for the given user from existing tables.

    Tolerates missing data — every field has a sensible default and no read
    is fatal. ~7 indexed queries; safe to call once per request.
    """
    from apps.practice.models import (
        CalibrationEntry,
        ErrorCard,
        ListeningSession,
        ReadingSession,
        SpeakingSession,
        VocabularyObservation,
        WeaknessAnalysisCache,
        WritingSession,
    )

    institute_id = getattr(user, "institute_id", None)
    target_band = float(getattr(user, "target_score", None) or 7.0)
    native_language = (getattr(user, "native_language", "") or "").strip() or None
    proficiency = (getattr(user, "english_proficiency_level", "") or "").strip() or None

    # Days until exam — None unless user filled in onboarding.
    days_until_exam: int | None = None
    exam_date = getattr(user, "exam_date", None)
    if exam_date:
        delta = exam_date - timezone.now().date()
        days_until_exam = max(int(delta.days), 0)

    ctx = StudentContext(
        user_id=str(user.id),
        target_band=target_band,
        native_language=native_language,
        proficiency=proficiency,
        days_until_exam=days_until_exam,
    )

    base_filter = {"user": user}
    if institute_id:
        base_filter["institute_id"] = institute_id

    # ----- Cached weakness analyses (cheap, pre-computed) ----- #
    try:
        caches = list(
            WeaknessAnalysisCache.objects.filter(
                **base_filter, expires_at__gt=timezone.now(),
            ).values("skill", "analysis")
        )
        for c in caches:
            summaries = _extract_weakness_summaries(c["analysis"])
            if c["skill"] == WeaknessAnalysisCache.SKILL_WRITING:
                ctx.writing_weaknesses = summaries
            elif c["skill"] == WeaknessAnalysisCache.SKILL_SPEAKING:
                ctx.speaking_weaknesses = summaries
    except Exception:
        log.warning("StudentContext: weakness cache load failed", exc_info=True)

    # ----- Recent topics + recent bands ----- #
    try:
        recent_reading = list(
            ReadingSession.objects.filter(**base_filter, deleted_at__isnull=True)
            .order_by("-created_at")
            .values("passage_title", "band_score")[:_RECENT_TOPICS_LIMIT]
        )
        ctx.recent_reading_topics = [r["passage_title"] for r in recent_reading if r.get("passage_title")][:_RECENT_TOPICS_LIMIT]
        if recent_reading and recent_reading[0].get("band_score") is not None:
            ctx.recent_reading_band = float(recent_reading[0]["band_score"])
    except Exception:
        log.warning("StudentContext: reading sessions load failed", exc_info=True)

    try:
        recent_listening = list(
            ListeningSession.objects.filter(**base_filter, deleted_at__isnull=True)
            .order_by("-created_at")
            .values("title", "band_score")[:_RECENT_TOPICS_LIMIT]
        )
        ctx.recent_listening_topics = [r["title"] for r in recent_listening if r.get("title")][:_RECENT_TOPICS_LIMIT]
        if recent_listening and recent_listening[0].get("band_score") is not None:
            ctx.recent_listening_band = float(recent_listening[0]["band_score"])
    except Exception:
        log.warning("StudentContext: listening sessions load failed", exc_info=True)

    try:
        recent_writing = WritingSession.objects.filter(
            **base_filter, deleted_at__isnull=True,
        ).order_by("-created_at").values_list("band_score", flat=True)[:1]
        if recent_writing:
            ctx.recent_writing_band = float(recent_writing[0])
    except Exception:
        log.warning("StudentContext: writing sessions load failed", exc_info=True)

    try:
        recent_speaking = SpeakingSession.objects.filter(
            **base_filter, deleted_at__isnull=True, analysis__isnull=False,
        ).order_by("-created_at").values_list("analysis", flat=True)[:1]
        if recent_speaking:
            band = recent_speaking[0].get("overallBandScore") if isinstance(recent_speaking[0], dict) else None
            if band is not None:
                try:
                    ctx.recent_speaking_band = float(band)
                except (TypeError, ValueError):
                    pass
    except Exception:
        log.warning("StudentContext: speaking sessions load failed", exc_info=True)

    # ----- Vocabulary state ----- #
    try:
        vocab_qs = VocabularyObservation.objects.filter(user=user, deleted_at__isnull=True)
        ctx.advanced_vocab_count = vocab_qs.filter(cefr_level__in=["B2", "C1", "C2"]).count()
        # Reinforcement candidates: words seen exactly once at B1+ — surfaced again
        # so the student gets repeat exposure across skills.
        candidates = list(
            vocab_qs.filter(frequency=1, cefr_level__in=["B1", "B2", "C1"])
            .order_by("-last_seen_at")
            .values_list("lemma", flat=True)[:_TARGET_VOCAB_LIMIT]
        )
        ctx.target_vocab_lemmas = [l for l in candidates if l]
    except Exception:
        log.warning("StudentContext: vocabulary load failed", exc_info=True)

    # ----- Active SRS error cards ----- #
    try:
        active_cards = list(
            ErrorCard.objects.filter(
                user=user, archived_at__isnull=True,
            ).order_by("due_at").values("category", "error_text")[:_ERROR_CARDS_LIMIT]
        )
        seen_categories: list[str] = []
        for card in active_cards:
            cat = card.get("category")
            if cat and cat not in seen_categories:
                seen_categories.append(cat)
        ctx.active_error_categories = seen_categories
        ctx.sample_error_patterns = [
            (c.get("error_text") or "").strip()
            for c in active_cards
            if c.get("error_text")
        ][:3]
    except Exception:
        log.warning("StudentContext: error cards load failed", exc_info=True)

    # ----- Calibration delta (avg over last 30 days) ----- #
    try:
        cutoff = timezone.now() - timedelta(days=30)
        delta = (
            CalibrationEntry.objects.filter(user=user, created_at__gte=cutoff)
            .aggregate(avg=Avg("delta"))
            .get("avg")
        )
        if delta is not None:
            ctx.avg_band_delta = float(delta)
    except Exception:
        log.warning("StudentContext: calibration load failed", exc_info=True)

    # ----- Streak ----- #
    try:
        from apps.practice.services.streaks import compute_streak
        ctx.current_streak_days = compute_streak(user).get("current_days", 0)
    except Exception:
        log.warning("StudentContext: streak load failed", exc_info=True)

    return ctx
