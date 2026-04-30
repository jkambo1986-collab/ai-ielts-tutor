"""Tests for the dashboard alert generator.

Locks down the dedup bug found in the audit: previously
_alert_exists(user, 'regression_writing') filtered alert_type='regression_writing'
but alerts were stored as alert_type='regression' with skill in payload —
so dedup never matched and every dashboard load created a new alert. Now
dedup filters on (alert_type, payload__skill) which actually matches.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.practice.models import DashboardAlert, SpeakingSession, WritingSession
from apps.practice.services.alerts import generate_alerts
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
        target_score=Decimal("7.0"),
    )


def _seed_writing_series(student, institute, bands: list[float]):
    """Create writing sessions in chronological order with the given bands."""
    base = timezone.now() - timedelta(days=len(bands) + 1)
    for i, b in enumerate(bands):
        s = WritingSession.objects.create(
            user=student, institute=institute,
            prompt="x", essay="y" * 60, band_score=Decimal(str(b)),
            feedback={},
        )
        WritingSession.objects.filter(id=s.id).update(
            created_at=base + timedelta(days=i),
        )


def test_no_regression_when_series_too_short(student, institute):
    _seed_writing_series(student, institute, [7.0, 7.0, 7.0])
    alerts = generate_alerts(student)
    assert not any(a.alert_type == DashboardAlert.TYPE_REGRESSION for a in alerts)


def test_writing_regression_creates_one_alert(student, institute):
    # Earlier 3 = 7.5, latest 3 = 6.5 → delta = -1.0 < -0.5 threshold
    _seed_writing_series(student, institute, [7.5, 7.5, 7.5, 6.5, 6.5, 6.5])
    alerts = generate_alerts(student)
    regression = [a for a in alerts if a.alert_type == DashboardAlert.TYPE_REGRESSION]
    assert len(regression) == 1
    assert regression[0].payload["skill"] == "writing"


def test_dedup_does_not_create_duplicate_regression(student, institute):
    """The bug: previous code's _alert_exists filter never matched the
    stored alert_type, so every call recreated. Verify the fix prevents that."""
    _seed_writing_series(student, institute, [7.5, 7.5, 7.5, 6.5, 6.5, 6.5])
    first = generate_alerts(student)
    assert len([a for a in first if a.alert_type == DashboardAlert.TYPE_REGRESSION]) == 1

    # Second call within 7 days must NOT create another regression alert.
    second = generate_alerts(student)
    regression_second = [a for a in second if a.alert_type == DashboardAlert.TYPE_REGRESSION]
    assert regression_second == []

    # Total in DB is still 1.
    total = DashboardAlert.objects.filter(
        user=student, alert_type=DashboardAlert.TYPE_REGRESSION,
    ).count()
    assert total == 1


def test_writing_and_speaking_regressions_are_distinct(student, institute):
    """Both share alert_type='regression' but have different payload.skill —
    payload-aware dedup must let both coexist."""
    _seed_writing_series(student, institute, [7.5, 7.5, 7.5, 6.5, 6.5, 6.5])

    base = timezone.now() - timedelta(days=10)
    for i, band in enumerate([7.5, 7.5, 7.5, 6.5, 6.5, 6.5]):
        s = SpeakingSession.objects.create(
            user=student, institute=institute,
            analysis={"overallBandScore": band, "fluencyAndCoherence": {}},
        )
        SpeakingSession.objects.filter(id=s.id).update(
            created_at=base + timedelta(days=i),
        )

    alerts = generate_alerts(student)
    skills = {
        a.payload.get("skill") for a in alerts
        if a.alert_type == DashboardAlert.TYPE_REGRESSION
    }
    assert skills == {"writing", "speaking"}


def test_dismissed_alert_does_not_block_new_one(student, institute):
    """Dismissed alerts shouldn't block re-creation if the condition is still
    true on the next dashboard load."""
    _seed_writing_series(student, institute, [7.5, 7.5, 7.5, 6.5, 6.5, 6.5])
    [first] = [
        a for a in generate_alerts(student)
        if a.alert_type == DashboardAlert.TYPE_REGRESSION
    ]

    # User dismisses it.
    first.dismissed_at = timezone.now()
    first.save(update_fields=["dismissed_at"])

    # Same condition still holds — should create a fresh alert.
    second_run = generate_alerts(student)
    new_alerts = [
        a for a in second_run if a.alert_type == DashboardAlert.TYPE_REGRESSION
    ]
    assert len(new_alerts) == 1


def test_goal_reached_dedup_per_skill(student, institute):
    """Goal-reached uses the same payload.skill dedup pattern."""
    # Latest writing session = 7.5 ≥ target 7.0 → should fire.
    _seed_writing_series(student, institute, [7.5])
    first = generate_alerts(student)
    goals = [a for a in first if a.alert_type == DashboardAlert.TYPE_GOAL_REACHED]
    assert len(goals) == 1
    assert goals[0].payload["skill"] == "writing"

    # Re-running must not duplicate.
    second = generate_alerts(student)
    assert [a for a in second if a.alert_type == DashboardAlert.TYPE_GOAL_REACHED] == []
