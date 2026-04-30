"""Tests for the smart re-attempt CTA alert."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.practice.models import DashboardAlert, WritingSession
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


def _writing(student, institute, band: float, days_ago: int = 0, parent=None):
    session = WritingSession.objects.create(
        user=student, institute=institute, prompt="x", essay="y" * 60,
        band_score=Decimal(str(band)), feedback={}, parent_session=parent,
    )
    if days_ago:
        WritingSession.objects.filter(id=session.id).update(
            created_at=timezone.now() - timedelta(days=days_ago),
        )
    return session


def test_reattempt_fires_when_latest_below_average(student, institute):
    """Latest = 5.5, avg of priors = 7.0+. Should fire a re-attempt alert."""
    _writing(student, institute, 7.0, days_ago=5)
    _writing(student, institute, 7.0, days_ago=4)
    _writing(student, institute, 7.5, days_ago=3)
    latest = _writing(student, institute, 5.5, days_ago=0)

    alerts = generate_alerts(student)
    quick_wins = [
        a for a in alerts
        if a.alert_type == DashboardAlert.TYPE_QUICK_WIN
        and a.payload.get("kind") == "reattempt"
    ]
    assert len(quick_wins) == 1
    assert quick_wins[0].payload["parent_session_id"] == str(latest.id)
    assert quick_wins[0].payload["skill"] == "writing"


def test_reattempt_does_not_fire_when_latest_in_line(student, institute):
    """Latest = 6.8, avg = 7.0. Within 0.5 → no nudge needed."""
    _writing(student, institute, 7.0, days_ago=5)
    _writing(student, institute, 7.0, days_ago=4)
    _writing(student, institute, 7.0, days_ago=3)
    _writing(student, institute, 6.8, days_ago=0)

    alerts = generate_alerts(student)
    assert not any(
        a.alert_type == DashboardAlert.TYPE_QUICK_WIN
        and a.payload.get("kind") == "reattempt"
        for a in alerts
    )


def test_reattempt_skipped_when_already_reattempted(student, institute):
    """If the user already created a re-attempt for this session, the
    nudge isn't useful — suppress."""
    _writing(student, institute, 7.0, days_ago=5)
    _writing(student, institute, 7.0, days_ago=4)
    _writing(student, institute, 7.0, days_ago=3)
    weak = _writing(student, institute, 5.5, days_ago=1)
    # User already retried.
    _writing(student, institute, 6.5, days_ago=0, parent=weak)

    alerts = generate_alerts(student)
    assert not any(
        a.alert_type == DashboardAlert.TYPE_QUICK_WIN
        and a.payload.get("kind") == "reattempt"
        for a in alerts
    )


def test_reattempt_dedups_per_parent_session(student, institute):
    """Two dashboard polls for the same weak session must produce only one
    alert (per-parent dedup via payload.parent_session_id)."""
    _writing(student, institute, 7.0, days_ago=5)
    _writing(student, institute, 7.0, days_ago=4)
    _writing(student, institute, 7.0, days_ago=3)
    _writing(student, institute, 5.5, days_ago=0)

    generate_alerts(student)
    generate_alerts(student)

    quick_wins = DashboardAlert.objects.filter(
        user=student, alert_type=DashboardAlert.TYPE_QUICK_WIN,
        payload__kind="reattempt",
    )
    assert quick_wins.count() == 1


def test_reattempt_needs_enough_priors(student, institute):
    """Just one weak session and nothing else — can't compute a meaningful
    average. Should NOT fire."""
    _writing(student, institute, 5.0, days_ago=0)
    alerts = generate_alerts(student)
    assert not any(
        a.alert_type == DashboardAlert.TYPE_QUICK_WIN
        and a.payload.get("kind") == "reattempt"
        for a in alerts
    )
