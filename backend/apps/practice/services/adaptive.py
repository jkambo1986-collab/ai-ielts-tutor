"""
Adaptive learning service — Python port of services/adaptiveLearningService.ts.

Computes a user's current skill level (1.0–9.0 IELTS band) per modality based
on the last N sessions, and recommends a difficulty bucket (Easy/Medium/Hard).
"""

from __future__ import annotations

from datetime import timedelta
from typing import Optional

from django.utils import timezone

from apps.practice.models import (
    ListeningSession,
    ReadingSession,
    SpeakingSession,
    WritingSession,
)

SESSION_COUNT_FOR_AVERAGE = 5
MINIMUM_SESSIONS_FOR_ADAPTATION = 2

# Percentage-to-band mapping for reading/listening (mirror of TS scoreToBand)
PERCENTAGE_TO_BAND = [
    (94, 9.0),
    (88, 8.5),
    (82, 8.0),
    (75, 7.5),
    (69, 7.0),
    (63, 6.5),
    (56, 6.0),
    (50, 5.5),
    (44, 5.0),
]


def percentage_to_band(percentage: float) -> float:
    for threshold, band in PERCENTAGE_TO_BAND:
        if percentage >= threshold:
            return band
    return 4.5


def band_to_difficulty(band: float) -> str:
    if band >= 7.5:
        return "Hard"
    if band >= 6.0:
        return "Medium"
    return "Easy"


def _avg_or_none(values: list[float]) -> Optional[float]:
    if len(values) < MINIMUM_SESSIONS_FOR_ADAPTATION:
        return None
    return round(sum(values) / len(values), 2)


def _filter_window(qs, days: Optional[int]):
    if days is None:
        return qs
    cutoff = timezone.now() - timedelta(days=days)
    return qs.filter(created_at__gte=cutoff)


def calculate_writing_skill(user, days: Optional[int] = None) -> Optional[float]:
    qs = _filter_window(WritingSession.objects.filter(user=user, institute=user.institute), days)
    bands = list(qs.order_by("-created_at").values_list("band_score", flat=True)[:SESSION_COUNT_FOR_AVERAGE])
    return _avg_or_none(bands)


def calculate_speaking_skill(user, days: Optional[int] = None) -> Optional[float]:
    qs = _filter_window(
        SpeakingSession.objects.filter(user=user, institute=user.institute, analysis__isnull=False), days
    )
    sessions = qs.order_by("-created_at").values_list("analysis", flat=True)[:SESSION_COUNT_FOR_AVERAGE]
    bands = [s.get("overallBandScore") for s in sessions if s and s.get("overallBandScore")]
    return _avg_or_none(bands)


def calculate_reading_skill(user, days: Optional[int] = None) -> Optional[float]:
    qs = _filter_window(ReadingSession.objects.filter(user=user, institute=user.institute), days)
    sessions = list(qs.order_by("-created_at").values("score", "total_questions")[:SESSION_COUNT_FOR_AVERAGE])
    bands = [
        percentage_to_band((s["score"] / s["total_questions"]) * 100)
        for s in sessions
        if s["total_questions"] > 0
    ]
    return _avg_or_none(bands)


def calculate_listening_skill(user, days: Optional[int] = None) -> Optional[float]:
    qs = _filter_window(ListeningSession.objects.filter(user=user, institute=user.institute), days)
    sessions = list(qs.order_by("-created_at").values("score", "total_questions")[:SESSION_COUNT_FOR_AVERAGE])
    bands = [
        percentage_to_band((s["score"] / s["total_questions"]) * 100)
        for s in sessions
        if s["total_questions"] > 0
    ]
    return _avg_or_none(bands)


def calculate_overall(user, days: Optional[int] = None) -> Optional[float]:
    parts = [
        calculate_writing_skill(user, days),
        calculate_speaking_skill(user, days),
        calculate_reading_skill(user, days),
        calculate_listening_skill(user, days),
    ]
    valid = [p for p in parts if p is not None]
    if not valid:
        return None
    return round(sum(valid) / len(valid), 2)


def overview(user, days: Optional[int] = None) -> dict:
    return {
        "estimated_skills": {
            "writing": calculate_writing_skill(user, days),
            "speaking": calculate_speaking_skill(user, days),
            "reading": calculate_reading_skill(user, days),
            "listening": calculate_listening_skill(user, days),
            "overall": calculate_overall(user, days),
        },
        "totals": {
            "writing": WritingSession.objects.filter(user=user, institute=user.institute).count(),
            "speaking": SpeakingSession.objects.filter(user=user, institute=user.institute).count(),
            "reading": ReadingSession.objects.filter(user=user, institute=user.institute).count(),
            "listening": ListeningSession.objects.filter(user=user, institute=user.institute).count(),
        },
    }
