"""
Dashboard analytics — single endpoint that returns everything the rich
Performance Dashboard needs in one round-trip.

Returns target-gap, trends, time-to-target ETAs, streaks, sub-skill drilldown,
per-task-type splits, vocab stats, calibration delta, regression alerts.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone as _tz
from decimal import Decimal
from statistics import mean
from typing import Any

log = logging.getLogger(__name__)

from django.db.models import Avg, Count, Sum
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.practice.models import (
    CalibrationEntry,
    DashboardAlert,
    ErrorCard,
    ListeningSession,
    MockTest,
    ReadingSession,
    SpeakingSession,
    VocabularyObservation,
    WritingSession,
)
from apps.practice.services.alerts import generate_alerts
from apps.practice.services.bands import (
    compute_streak,
    linear_eta_to_target,
    listening_band,
    practice_heatmap,
    reading_band,
    trend_delta,
)


def _decimal(v) -> float | None:
    if v is None:
        return None
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _series(rows: list[tuple[datetime, float]]) -> list[dict]:
    return [{"date": t.isoformat(), "score": s} for t, s in rows]


def _writing_series(qs) -> list[tuple[datetime, float]]:
    return [(s.created_at, _decimal(s.band_score)) for s in qs if s.band_score is not None]


def _speaking_series(qs) -> list[tuple[datetime, float]]:
    out = []
    for s in qs:
        if s.analysis and s.analysis.get("overallBandScore") is not None:
            out.append((s.created_at, float(s.analysis["overallBandScore"])))
    return out


def _reading_series(qs) -> list[tuple[datetime, float]]:
    out = []
    for s in qs:
        if s.band_score is not None:
            out.append((s.created_at, _decimal(s.band_score)))
        elif s.total_questions:
            out.append((s.created_at, reading_band(s.score, s.total_questions)))
    return out


def _listening_series(qs) -> list[tuple[datetime, float]]:
    out = []
    for s in qs:
        if s.band_score is not None:
            out.append((s.created_at, _decimal(s.band_score)))
        elif s.total_questions:
            out.append((s.created_at, listening_band(s.score, s.total_questions)))
    return out


# Min-duration / completeness thresholds (#5).
WRITING_MIN_WORDS = 50          # Anything shorter is essentially abandoned.
SPEAKING_MIN_SECONDS = 60       # < 60s speaking session = dropped.
READING_MIN_QUESTIONS = 1
LISTENING_MIN_QUESTIONS = 1


def _filter_completed(model_qs, kind: str):
    """Drop abandoned / partial sessions from the analytics view."""
    if kind == "writing":
        return [s for s in model_qs if len((s.essay or "").split()) >= WRITING_MIN_WORDS]
    if kind == "speaking":
        return [s for s in model_qs if (s.duration_seconds or 0) >= SPEAKING_MIN_SECONDS]
    if kind == "reading":
        return [s for s in model_qs if (s.total_questions or 0) >= READING_MIN_QUESTIONS]
    if kind == "listening":
        return [s for s in model_qs if (s.total_questions or 0) >= LISTENING_MIN_QUESTIONS]
    return list(model_qs)


def _writing_subskill_avg(sessions, key: str) -> float | None:
    """Average a single rubric criterion (taskAchievement / coherenceAndCohesion / lexicalResource / grammaticalRangeAndAccuracy)."""
    vals = []
    for s in sessions:
        crit = (s.feedback or {}).get("feedback", {}).get(key, {})
        # Some prompts include numeric scores in feedback.<key>.score; otherwise infer from band.
        if isinstance(crit, dict) and isinstance(crit.get("score"), (int, float)):
            vals.append(float(crit["score"]))
    return round(mean(vals), 2) if vals else None


def _speaking_subskill_avg(sessions, key: str) -> float | None:
    vals = []
    for s in sessions:
        analysis = s.analysis or {}
        crit = analysis.get(key, {})
        if isinstance(crit, dict) and isinstance(crit.get("score"), (int, float)):
            vals.append(float(crit["score"]))
        elif isinstance(crit, (int, float)):
            vals.append(float(crit))
    return round(mean(vals), 2) if vals else None


def _writing_task_split(sessions) -> dict:
    by_task = {"task1": [], "task2": []}
    for s in sessions:
        bucket = by_task.get(s.task_type, by_task["task2"])
        if s.band_score is not None:
            bucket.append(_decimal(s.band_score))
    return {
        "task1_avg": round(mean(by_task["task1"]), 2) if by_task["task1"] else None,
        "task1_count": len(by_task["task1"]),
        "task2_avg": round(mean(by_task["task2"]), 2) if by_task["task2"] else None,
        "task2_count": len(by_task["task2"]),
    }


def _speaking_part_split(sessions) -> dict:
    by_part = {"part1": [], "part2": [], "part3": [], "mixed": []}
    for s in sessions:
        analysis = s.analysis or {}
        band = analysis.get("overallBandScore")
        if band is None:
            continue
        bucket = by_part.get(s.part, by_part["mixed"])
        bucket.append(float(band))
    return {
        f"{p}_avg": round(mean(by_part[p]), 2) if by_part[p] else None
        for p in ("part1", "part2", "part3", "mixed")
    } | {
        f"{p}_count": len(by_part[p]) for p in ("part1", "part2", "part3", "mixed")
    }


class DashboardAnalyticsView(APIView):
    """GET /api/v1/analytics/dashboard?days=7|30|all — single rich payload."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        institute = user.institute

        days_raw = request.query_params.get("days", "all")
        cutoff = None
        if days_raw and days_raw != "all":
            try:
                cutoff = timezone.now() - timedelta(days=int(days_raw))
            except ValueError:
                cutoff = None

        def _scope(model):
            qs = model.objects.filter(user=user, institute=institute, deleted_at__isnull=True)
            if cutoff is not None:
                qs = qs.filter(created_at__gte=cutoff)
            return qs.order_by("created_at")

        writing_qs = list(_scope(WritingSession))
        speaking_qs = list(_scope(SpeakingSession))
        reading_qs = list(_scope(ReadingSession))
        listening_qs = list(_scope(ListeningSession))

        writing = _filter_completed(writing_qs, "writing")
        speaking = _filter_completed(speaking_qs, "speaking")
        reading = _filter_completed(reading_qs, "reading")
        listening = _filter_completed(listening_qs, "listening")

        writing_series = _writing_series(writing)
        speaking_series = _speaking_series(speaking)
        reading_series = _reading_series(reading)
        listening_series = _listening_series(listening)

        target = _decimal(user.target_score) or 7.0

        # Latest band per skill = most recent point in the series.
        def _latest(series):
            return series[-1][1] if series else None

        def _avg(series):
            return round(mean(s for _, s in series), 2) if series else None

        latest = {
            "writing": _latest(writing_series),
            "speaking": _latest(speaking_series),
            "reading": _latest(reading_series),
            "listening": _latest(listening_series),
        }

        averages = {
            "writing": _avg(writing_series),
            "speaking": _avg(speaking_series),
            "reading": _avg(reading_series),
            "listening": _avg(listening_series),
        }

        # Trend deltas (#15).
        trends = {
            "writing": trend_delta([s for _, s in writing_series]),
            "speaking": trend_delta([s for _, s in speaking_series]),
            "reading": trend_delta([s for _, s in reading_series]),
            "listening": trend_delta([s for _, s in listening_series]),
        }

        # Time-to-target ETA (#16).
        eta = {
            "writing": linear_eta_to_target(writing_series, target),
            "speaking": linear_eta_to_target(speaking_series, target),
            "reading": linear_eta_to_target(reading_series, target),
            "listening": linear_eta_to_target(listening_series, target),
        }

        # Streak + heatmap (#12) — combine session timestamps from all four streams.
        all_dates = (
            [s.created_at for s in writing]
            + [s.created_at for s in speaking]
            + [s.created_at for s in reading]
            + [s.created_at for s in listening]
        )
        streak = compute_streak(all_dates)
        heatmap = practice_heatmap(all_dates, weeks=12)

        # Sub-skill drill-down (#13).
        writing_sub = {
            "task_achievement": _writing_subskill_avg(writing, "taskAchievement"),
            "coherence_cohesion": _writing_subskill_avg(writing, "coherenceAndCohesion"),
            "lexical_resource": _writing_subskill_avg(writing, "lexicalResource"),
            "grammar_accuracy": _writing_subskill_avg(writing, "grammaticalRangeAndAccuracy"),
        }
        speaking_sub = {
            "fluency_coherence": _speaking_subskill_avg(speaking, "fluencyAndCoherence"),
            "lexical_resource": _speaking_subskill_avg(speaking, "lexicalResource"),
            "grammar_accuracy": _speaking_subskill_avg(speaking, "grammaticalRangeAndAccuracy"),
            "pronunciation": _speaking_subskill_avg(speaking, "pronunciation"),
        }

        # Per-task-type splits (#14).
        writing_split = _writing_task_split(writing)
        speaking_split = _speaking_part_split(speaking)

        # Speaking analysis state (#2).
        speaking_total = len(speaking)
        speaking_analyzed = sum(1 for s in speaking if s.analysis)

        # Quality (#18) — average over completed sessions.
        def _avg_quality(rows):
            vals = [s.quality_score for s in rows if s.quality_score is not None]
            return round(mean(vals), 1) if vals else None

        quality = {
            "writing": _avg_quality(writing),
            "speaking": _avg_quality(speaking),
            "reading": _avg_quality(reading),
            "listening": _avg_quality(listening),
        }

        effective_practice_seconds = (
            sum((s.duration_seconds or 0) * ((s.quality_score or 0) / 100) for s in writing)
            + sum((s.duration_seconds or 0) * ((s.quality_score or 0) / 100) for s in speaking)
            + sum((s.duration_seconds or 0) * ((s.quality_score or 0) / 100) for s in reading)
            + sum((s.duration_seconds or 0) * ((s.quality_score or 0) / 100) for s in listening)
        )

        # Vocabulary stats (#19).
        vocab_qs = VocabularyObservation.objects.filter(user=user)
        if cutoff is not None:
            vocab_recent = vocab_qs.filter(last_seen_at__gte=cutoff)
        else:
            vocab_recent = vocab_qs
        vocab_stats = {
            "unique_total": vocab_qs.count(),
            "unique_b2_plus": vocab_qs.filter(cefr_level__in=["B2", "C1", "C2"]).count(),
            "awl_total": vocab_qs.filter(is_awl=True).count(),
            "added_this_period": vocab_recent.count() if cutoff else None,
        }

        # Calibration delta (#25).
        calib_qs = CalibrationEntry.objects.filter(user=user)
        if cutoff:
            calib_qs = calib_qs.filter(created_at__gte=cutoff)
        calibration = calib_qs.aggregate(
            n=Count("id"),
            avg_delta=Avg("delta"),
        )

        # Error card backlog (#22).
        now = timezone.now()
        cards = ErrorCard.objects.filter(user=user, archived_at__isnull=True)
        error_cards = {
            "total": cards.count(),
            "due_now": cards.filter(due_at__lte=now).count(),
        }

        # Refresh alerts (#28) — idempotent; only creates new rows when conditions met.
        try:
            generate_alerts(user)
        except Exception:
            # Never block the dashboard on alert generation, but DO log it
            # so silent regressions don't go unnoticed.
            log.warning("generate_alerts failed for user %s", user.id, exc_info=True)
        alerts_qs = DashboardAlert.objects.filter(user=user, dismissed_at__isnull=True).order_by("-created_at")[:5]
        alerts = [
            {
                "id": str(a.id),
                "type": a.alert_type,
                "severity": a.severity,
                "title": a.title,
                "body": a.body,
                "payload": a.payload,
                "cta_label": a.cta_label,
                "cta_target": a.cta_target,
                "created_at": a.created_at.isoformat(),
            }
            for a in alerts_qs
        ]

        # Mock test summary (#20).
        mock_qs = MockTest.objects.filter(user=user, completed_at__isnull=False)
        if cutoff:
            mock_qs = mock_qs.filter(started_at__gte=cutoff)
        latest_mock = mock_qs.order_by("-started_at").first()
        mock_summary = {
            "count": mock_qs.count(),
            "latest_overall_band": _decimal(latest_mock.overall_band) if latest_mock else None,
            "latest_readiness_score": latest_mock.readiness_score if latest_mock else None,
            "latest_at": latest_mock.started_at.isoformat() if latest_mock else None,
        }

        # Day-of-week / hour-of-day patterns (#6).
        dow_counts = [0] * 7
        hour_counts = [0] * 24
        for d in all_dates:
            dow_counts[d.weekday()] += 1
            hour_counts[d.hour] += 1

        return Response({
            "period_days": None if cutoff is None else (timezone.now() - cutoff).days,
            "target": target,

            # Counts (#5 filters out abandoned).
            "counts": {
                "writing": len(writing),
                "speaking": len(speaking),
                "reading": len(reading),
                "listening": len(listening),
                "writing_raw": len(writing_qs),
                "speaking_raw": len(speaking_qs),
                "reading_raw": len(reading_qs),
                "listening_raw": len(listening_qs),
            },

            # Headline metrics
            "averages": averages,
            "latest": latest,
            "trends": trends,
            "eta_to_target": {k: v.isoformat() if v else None for k, v in eta.items()},

            # Streak + heatmap
            "streak_days": streak,
            "heatmap_12w": heatmap,
            "by_weekday": dow_counts,
            "by_hour": hour_counts,

            # Sub-skills + per-task splits
            "writing_subskills": writing_sub,
            "speaking_subskills": speaking_sub,
            "writing_task_split": writing_split,
            "speaking_part_split": speaking_split,

            # Speaking analysis state (#2)
            "speaking_analysis_state": {
                "total": speaking_total,
                "analyzed": speaking_analyzed,
                "pending": speaking_total - speaking_analyzed,
            },

            # Quality + effective time (#18)
            "quality": quality,
            "effective_practice_minutes": round(effective_practice_seconds / 60, 1),

            # Vocab (#19)
            "vocabulary": vocab_stats,

            # Calibration (#25)
            "calibration": {
                "samples": calibration["n"] or 0,
                "avg_delta": float(calibration["avg_delta"]) if calibration["avg_delta"] is not None else None,
            },

            # SRS (#22)
            "error_cards": error_cards,

            # Mock tests (#20)
            "mock_tests": mock_summary,

            # Alerts (#28)
            "alerts": alerts,
        })
