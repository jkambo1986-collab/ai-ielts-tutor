"""
IELTS band conversion + analytics helpers.

Used across views to keep the band-mapping logic in one place.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Iterable, Sequence


# IELTS Academic raw-score → band table for Reading & Listening (40 questions).
# Source: official Cambridge published rubrics. Linear interpolation between
# bands is intentionally NOT used — the table is canonical.
ACADEMIC_READING_BAND_TABLE = [
    # (raw_correct_minimum, band)
    (39, 9.0),
    (37, 8.5),
    (35, 8.0),
    (33, 7.5),
    (30, 7.0),
    (27, 6.5),
    (23, 6.0),
    (19, 5.5),
    (15, 5.0),
    (13, 4.5),
    (10, 4.0),
    (8, 3.5),
    (6, 3.0),
    (4, 2.5),
    (0, 0.0),
]

LISTENING_BAND_TABLE = [
    (39, 9.0),
    (37, 8.5),
    (35, 8.0),
    (32, 7.5),
    (30, 7.0),
    (26, 6.5),
    (23, 6.0),
    (18, 5.5),
    (16, 5.0),
    (13, 4.5),
    (11, 4.0),
    (8, 3.5),
    (6, 3.0),
    (4, 2.5),
    (0, 0.0),
]


def _band_from_table(raw: int, total: int, table: list[tuple[int, float]]) -> float:
    """Convert a raw count out of `total` to a band, normalising to /40."""
    if total <= 0:
        return 0.0
    normalised = round(raw * 40 / total)
    for threshold, band in table:
        if normalised >= threshold:
            return band
    return 0.0


def reading_band(raw: int, total: int) -> float:
    return _band_from_table(raw, total, ACADEMIC_READING_BAND_TABLE)


def listening_band(raw: int, total: int) -> float:
    return _band_from_table(raw, total, LISTENING_BAND_TABLE)


def percent(raw: int, total: int) -> float:
    """Plain percentage, defensive against zero divisors."""
    if total <= 0:
        return 0.0
    return round(raw * 100 / total, 1)


# -- Quality score (#18) -- #

def writing_quality_score(*, word_count: int, duration_seconds: int, has_feedback: bool) -> float:
    """0-100 quality score for a writing session.

    Components:
      - Length adequacy (target 250 for Task 2, 150 for Task 1; we use 250
        as a reasonable default since most sessions are Task 2)
      - Time invested (target 40 minutes for Task 2)
      - Feedback completeness (does the session have a feedback object)
    """
    length_score = min(1.0, word_count / 250) * 50
    time_score = min(1.0, duration_seconds / (40 * 60)) * 30
    completeness = 20 if has_feedback else 0
    return round(length_score + time_score + completeness, 1)


def speaking_quality_score(*, duration_seconds: int, has_analysis: bool, transcript_turns: int) -> float:
    """0-100 quality score for a speaking session.

    A real Speaking test is 11–14 minutes. Anything < 60s is essentially
    abandoned. Analysis presence carries meaningful weight because an
    un-analysed session is half a session for learning purposes.
    """
    target_seconds = 11 * 60
    duration_score = min(1.0, duration_seconds / target_seconds) * 50
    engagement_score = min(1.0, transcript_turns / 20) * 20
    completeness = 30 if has_analysis else 0
    return round(duration_score + engagement_score + completeness, 1)


def reading_listening_quality_score(*, total_questions: int, duration_seconds: int) -> float:
    """0-100 quality score for a reading or listening session — gives credit
    for completing a meaningful number of questions and not flying through it.
    """
    if total_questions <= 0:
        return 0.0
    breadth = min(1.0, total_questions / 13) * 60  # one "section" worth
    minimum_time = max(60, total_questions * 30)   # ~30s/question floor
    pacing = min(1.0, duration_seconds / minimum_time) * 40
    return round(breadth + pacing, 1)


# -- Trend / projection helpers (#15, #16) -- #

def split_by_half(values: Sequence[float]) -> tuple[list[float], list[float]]:
    """Split a sorted-by-time series into earlier & later halves for trend
    comparison. Single-element series → (values, [])."""
    n = len(values)
    if n < 2:
        return (list(values), [])
    mid = n // 2
    return (list(values[:mid]), list(values[mid:]))


def trend_delta(values: Sequence[float]) -> float | None:
    """Mean(later half) − Mean(earlier half). None if not enough data."""
    earlier, later = split_by_half(values)
    if not earlier or not later:
        return None
    return round(sum(later) / len(later) - sum(earlier) / len(earlier), 2)


def linear_eta_to_target(
    series: Sequence[tuple[datetime, float]],
    target: float,
) -> datetime | None:
    """Linear regression on (timestamp, score) pairs → ETA when the line crosses
    `target`. Returns None when:
      - fewer than 3 points,
      - the slope is non-positive (already there or going backwards),
      - the projected ETA is more than 18 months away (too noisy to be useful).
    """
    if len(series) < 3:
        return None
    # Convert to (x = days since first, y = score)
    base = series[0][0]
    xs = [(t - base).total_seconds() / 86400 for t, _ in series]
    ys = [y for _, y in series]
    n = len(series)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    den = sum((x - mean_x) ** 2 for x in xs)
    if den == 0:
        return None
    slope = num / den
    intercept = mean_y - slope * mean_x
    if slope <= 0:
        return None
    # Solve y = slope * x + intercept for y = target
    days_from_base = (target - intercept) / slope
    if days_from_base <= xs[-1]:
        return None  # Already at/past target
    days_in_future = days_from_base - xs[-1]
    if days_in_future > 540:  # ~18 months
        return None
    return series[-1][0] + timedelta(days=days_in_future)


# -- Streak helpers (#12) -- #

def compute_streak(dates: Iterable[datetime], today: datetime | None = None) -> int:
    """Current consecutive-day streak ending today (or yesterday if no
    practice today). Each `dates` element is taken as a session datetime.
    """
    if today is None:
        today = datetime.now(timezone.utc)
    today_d = today.date()
    practice_days = {d.date() if hasattr(d, "date") else d for d in dates}
    if not practice_days:
        return 0
    streak = 0
    cursor = today_d
    if cursor not in practice_days:
        cursor = cursor.fromordinal(cursor.toordinal() - 1)
    while cursor in practice_days:
        streak += 1
        cursor = cursor.fromordinal(cursor.toordinal() - 1)
    return streak


def practice_heatmap(dates: Iterable[datetime], weeks: int = 12) -> list[list[int]]:
    """`weeks` × 7 grid of session counts ending today. Outer list = weeks
    (oldest first); inner list = days Mon..Sun."""
    today = datetime.now(timezone.utc).date()
    grid_start = today.fromordinal(today.toordinal() - (weeks * 7 - 1))
    counts: dict = {}
    for d in dates:
        day = d.date() if hasattr(d, "date") else d
        if grid_start <= day <= today:
            counts[day] = counts.get(day, 0) + 1
    grid: list[list[int]] = []
    cursor = grid_start
    for _ in range(weeks):
        week = []
        for _ in range(7):
            week.append(counts.get(cursor, 0))
            cursor = cursor.fromordinal(cursor.toordinal() + 1)
        grid.append(week)
    return grid
