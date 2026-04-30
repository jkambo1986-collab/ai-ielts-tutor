"""
Fluency / pace metrics from Speaking transcripts (#26).

Inputs: a SpeakingSession's transcript JSON (list of {speaker, text, timestamp})
and the session's `duration_seconds`.

Outputs:
  - total_words: integer
  - wpm: float (user-side words per minute)
  - filler_count: integer
  - filler_per_minute: float
  - pause_seconds_avg: float (avg gap between consecutive user turns)
  - hesitation_index: float (0–1, higher = more disfluency)
"""

from __future__ import annotations

import re
from datetime import datetime
from statistics import mean

# Common filler / disfluency markers in IELTS speaking.
FILLER_PATTERNS = [
    r"\b(um|uh|uhm|er|erm|ah)\b",
    r"\byou know\b",
    r"\bi mean\b",
    r"\bsort of\b",
    r"\bkind of\b",
    r"\blike\b",
    r"\bbasically\b",
    r"\bactually\b",
    r"\bwell\b",
    r"\bso\b",
]
FILLER_RE = re.compile("|".join(FILLER_PATTERNS), flags=re.IGNORECASE)
WORD_RE = re.compile(r"\b\w+\b")


def _parse_ts(ts) -> datetime | None:
    if not ts:
        return None
    try:
        if isinstance(ts, (int, float)):
            return datetime.fromtimestamp(ts)
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except Exception:
        return None


def compute_fluency(transcript: list[dict], duration_seconds: int) -> dict:
    """Returns a flat dict suitable for storing in SpeakingSession.fluency_metrics."""
    user_turns = [t for t in (transcript or []) if t.get("speaker") == "user"]
    text_blob = " ".join(t.get("text", "") for t in user_turns)
    words = WORD_RE.findall(text_blob)
    total_words = len(words)

    # WPM: derive a "speaking minutes" value. Prefer turn timestamps when present;
    # otherwise fall back to duration_seconds / 2 (rough estimate that the user
    # is speaking ~half the time in a back-and-forth).
    spoken_seconds = 0
    timestamps = [_parse_ts(t.get("timestamp")) for t in user_turns]
    timestamps = [t for t in timestamps if t]
    if len(timestamps) >= 2:
        spoken_seconds = (timestamps[-1] - timestamps[0]).total_seconds()
    if spoken_seconds <= 0:
        spoken_seconds = max(1, duration_seconds // 2)

    minutes = max(spoken_seconds / 60, 0.1)
    wpm = round(total_words / minutes, 1)

    filler_count = len(FILLER_RE.findall(text_blob))
    filler_per_minute = round(filler_count / minutes, 2)

    # Pause estimate: gap between consecutive user-turn starts.
    if len(timestamps) >= 2:
        gaps = [
            (timestamps[i] - timestamps[i - 1]).total_seconds()
            for i in range(1, len(timestamps))
        ]
        pause_seconds_avg = round(mean(gaps), 2) if gaps else 0.0
    else:
        pause_seconds_avg = 0.0

    # Hesitation index: combines filler frequency + pause penalty.
    hesitation_index = round(min(1.0, (filler_per_minute / 8) * 0.6 + (pause_seconds_avg / 6) * 0.4), 3)

    # F2: talking-time breakdown. IELTS speaking expects ~50% student talk
    # time; the rubric heavily penalises silence and over-AI-led conversations.
    # We approximate from the transcript: each turn's duration is roughly
    # (word_count / 150 wpm) which is the natural English speaking rate.
    # When timestamps are available we use those instead.
    student_talk_seconds = _approx_speak_seconds(user_turns)
    ai_turns = [t for t in (transcript or []) if t.get("speaker") in ("model", "ai", "examiner")]
    ai_talk_seconds = _approx_speak_seconds(ai_turns)
    total = max(int(duration_seconds or 0), 1)
    silence_seconds = max(0, total - student_talk_seconds - ai_talk_seconds)
    student_talk_ratio = round(student_talk_seconds / total, 3) if total else 0.0

    return {
        "total_words": total_words,
        "wpm": wpm,
        "filler_count": filler_count,
        "filler_per_minute": filler_per_minute,
        "pause_seconds_avg": pause_seconds_avg,
        "hesitation_index": hesitation_index,
        "student_talk_seconds": student_talk_seconds,
        "ai_talk_seconds": ai_talk_seconds,
        "silence_seconds": silence_seconds,
        "student_talk_ratio": student_talk_ratio,
    }


def _approx_speak_seconds(turns: list[dict]) -> int:
    """Approximate spoken seconds from a list of turns. Prefers explicit
    `duration_seconds` per turn when present; otherwise word_count/2.5
    (roughly 150 wpm = 2.5 words/sec)."""
    total = 0
    for t in turns:
        if not isinstance(t, dict):
            continue
        d = t.get("duration_seconds")
        if isinstance(d, (int, float)) and d > 0:
            total += int(d)
            continue
        words = len(WORD_RE.findall(t.get("text", "") or ""))
        if words:
            total += int(round(words / 2.5))
    return total
