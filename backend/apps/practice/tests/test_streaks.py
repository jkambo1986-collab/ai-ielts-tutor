"""Tests for streak computation + STREAK_LOST alert generation."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.practice.models import (
    DashboardAlert,
    ListeningSession,
    SpeakingSession,
    WritingSession,
)
from apps.practice.services.alerts import generate_alerts
from apps.practice.services.streaks import compute_streak
from apps.tenants.models import Institute, InstituteSettings


@pytest.fixture
def institute(db):
    inst = Institute.objects.create(name="Default", slug="default")
    InstituteSettings.objects.create(institute=inst)
    return inst


@pytest.fixture
def student(institute):
    return User.objects.create_user(
        email="alice@example.com", password="x", institute=institute,
    )


def _on_day(student, institute, day_offset_from_today: int):
    """Create one writing session whose created_at lands on today + offset
    (negative = past)."""
    when = timezone.make_aware(
        datetime.combine(
            date.today() + timedelta(days=day_offset_from_today), time(12, 0),
        )
    )
    s = WritingSession.objects.create(
        user=student, institute=institute, prompt="x", essay="y" * 60,
        band_score=Decimal("6.5"), feedback={},
    )
    WritingSession.objects.filter(id=s.id).update(created_at=when)
    return s


def test_no_sessions_means_zero_streak(student):
    s = compute_streak(student)
    assert s["current_days"] == 0
    assert s["longest_days"] == 0
    assert s["last_session_date"] is None
    assert s["is_at_risk"] is False
    assert s["just_broken"] is False


def test_single_session_today_is_streak_1(student, institute):
    _on_day(student, institute, 0)
    s = compute_streak(student)
    assert s["current_days"] == 1
    assert s["longest_days"] == 1
    assert s["is_at_risk"] is False


def test_yesterday_only_is_alive_at_risk(student, institute):
    """Grace period: practising yesterday keeps the streak alive but flags it."""
    _on_day(student, institute, -1)
    s = compute_streak(student)
    assert s["current_days"] == 1
    assert s["is_at_risk"] is True
    assert s["just_broken"] is False


def test_three_consecutive_days_streak(student, institute):
    for offset in (-2, -1, 0):
        _on_day(student, institute, offset)
    s = compute_streak(student)
    assert s["current_days"] == 3
    assert s["longest_days"] == 3


def test_gap_breaks_streak_just_broken_signal(student, institute):
    """Built a 3-day streak, missed 3+ days → just_broken True."""
    for offset in (-7, -6, -5):
        _on_day(student, institute, offset)
    s = compute_streak(student)
    assert s["current_days"] == 0
    assert s["longest_days"] == 3
    assert s["just_broken"] is True


def test_short_broken_run_not_just_broken(student, institute):
    """A 1-day "streak" that broke isn't worth a STREAK_LOST notification —
    just_broken requires the prior run to be ≥ 3 days."""
    _on_day(student, institute, -5)
    s = compute_streak(student)
    assert s["current_days"] == 0
    assert s["just_broken"] is False


def test_multiple_skills_count_as_one_day(student, institute):
    """Writing + speaking on the same day shouldn't double-count."""
    _on_day(student, institute, 0)
    SpeakingSession.objects.create(user=student, institute=institute)
    ListeningSession.objects.create(
        user=student, institute=institute, score=5, total_questions=10,
    )
    s = compute_streak(student)
    assert s["current_days"] == 1


def test_streak_lost_alert_fires_once(student, institute):
    """generate_alerts must create a STREAK_LOST alert when just_broken is
    True, and must NOT duplicate on a second invocation."""
    for offset in (-7, -6, -5):
        _on_day(student, institute, offset)

    first = generate_alerts(student)
    streak_alerts = [a for a in first if a.alert_type == DashboardAlert.TYPE_STREAK_LOST]
    assert len(streak_alerts) == 1

    second = generate_alerts(student)
    streak_alerts_2 = [a for a in second if a.alert_type == DashboardAlert.TYPE_STREAK_LOST]
    assert streak_alerts_2 == []


def test_student_context_surfaces_streak(student, institute):
    """≥3-day streak should appear in StudentContext.prompt_block, but a
    1-day streak should not (over-praise risk)."""
    from apps.ai.context import build_for_user

    for offset in (-2, -1, 0):
        _on_day(student, institute, offset)
    ctx = build_for_user(student)
    assert ctx.current_streak_days == 3
    block = ctx.prompt_block(focus="writing")
    assert "Practice streak: 3" in block


def test_short_streak_not_in_prompt_block(student, institute):
    """Streak of 1-2 days isn't surfaced — too easy to over-praise."""
    from apps.ai.context import build_for_user

    _on_day(student, institute, 0)
    ctx = build_for_user(student)
    assert ctx.current_streak_days == 1
    block = ctx.prompt_block(focus="writing")
    assert "Practice streak" not in block
