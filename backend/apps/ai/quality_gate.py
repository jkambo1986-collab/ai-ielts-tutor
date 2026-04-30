"""
Pre-flight quality gate for writing + speaking AI evaluation (Hard 6).

Refuses to call Gemini on inputs we already know are too small to grade
sensibly. Returns a structured validation error the FE can render as
concrete advice ("add a body paragraph and resubmit") instead of paying
for a Gemini call that returns "you wrote too little".

Two reasons this is worth its own module:
  1. Gemini cost — every refused call saves ~$0.005 and ~3-5 seconds.
  2. UX — the AI's "you wrote too little" response trains students that
     the AI is unhelpful. A specific, actionable validation error is
     better learning + better product positioning.
"""

from __future__ import annotations

WRITING_MIN_WORDS = 120          # IELTS Task 2 minimum is 250; below 120 there's
                                  # nothing for the AI to assess.
WRITING_MIN_DISTINCT_WORDS = 60   # Catches "the the the..." padding tactics.
SPEAKING_MIN_USER_SECONDS = 30    # Below 30s of user speech, fluency/coherence
                                  # rubric returns garbage.
SPEAKING_MIN_USER_WORDS = 30


class QualityGateError(Exception):
    """Raised when the input is too small for a useful AI evaluation.

    Carries a structured payload so the view can return it directly:
      { "code": "...", "advice": "...", "min_required": ... }
    """

    def __init__(self, code: str, advice: str, payload: dict):
        super().__init__(advice)
        self.code = code
        self.advice = advice
        self.payload = payload


def gate_writing(*, prompt: str, essay: str) -> None:
    """Raise QualityGateError if the writing input wouldn't be gradeable."""
    words = essay.strip().split()
    word_count = len(words)
    if word_count < WRITING_MIN_WORDS:
        raise QualityGateError(
            code="essay_too_short",
            advice=(
                f"Your essay is {word_count} words. IELTS Task 2 expects 250+ "
                f"and we need at least {WRITING_MIN_WORDS} to give you a "
                f"meaningful band. Add a body paragraph with a concrete "
                f"example and resubmit."
            ),
            payload={
                "min_required_words": WRITING_MIN_WORDS,
                "actual_words": word_count,
            },
        )
    distinct = len({w.lower() for w in words})
    if distinct < WRITING_MIN_DISTINCT_WORDS:
        raise QualityGateError(
            code="essay_low_lexical_variety",
            advice=(
                f"Your essay only uses {distinct} distinct words across "
                f"{word_count} total — too repetitive to assess. Try varying "
                f"your vocabulary before resubmitting."
            ),
            payload={
                "min_required_distinct": WRITING_MIN_DISTINCT_WORDS,
                "actual_distinct": distinct,
            },
        )
    # Prompt itself: refuse if obviously empty / nonsense.
    if len(prompt.strip()) < 20:
        raise QualityGateError(
            code="prompt_too_short",
            advice=(
                "The prompt looks incomplete. Paste the full IELTS Task 2 "
                "question (usually 30-50 words) before submitting."
            ),
            payload={"min_required_chars": 20},
        )


def gate_speaking_transcript(transcript: str | list) -> None:
    """Raise QualityGateError if the speaking transcript is too thin.

    Accepts either a plain string (analyze-transcript) or a list of turn
    dicts (end-session). Counts only USER turns when given a list.
    """
    if isinstance(transcript, list):
        user_text = " ".join(
            (t.get("text") or "")
            for t in transcript
            if isinstance(t, dict) and t.get("speaker") == "user"
        )
    else:
        user_text = str(transcript or "")
    user_text = user_text.strip()
    word_count = len(user_text.split())
    if word_count < SPEAKING_MIN_USER_WORDS:
        raise QualityGateError(
            code="transcript_too_short",
            advice=(
                f"You spoke {word_count} words. We need at least "
                f"{SPEAKING_MIN_USER_WORDS} to evaluate fluency and "
                f"vocabulary range. Try restarting the session and "
                f"answering each question in full sentences."
            ),
            payload={
                "min_required_words": SPEAKING_MIN_USER_WORDS,
                "actual_words": word_count,
            },
        )
