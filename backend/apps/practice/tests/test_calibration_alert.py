"""Tests for the calibration coaching alert."""

from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounts.models import User
from apps.practice.models import CalibrationEntry, DashboardAlert
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
    )


def _calibration(student, institute, predicted: float, actual: float):
    import uuid
    return CalibrationEntry.objects.create(
        user=student, institute=institute,
        session_type="writing", session_id=uuid.uuid4(),
        predicted_band=Decimal(str(predicted)),
        actual_band=Decimal(str(actual)),
        delta=Decimal(str(predicted - actual)),
    )


def test_no_alert_when_below_threshold(student, institute):
    for _ in range(4):
        _calibration(student, institute, 7.5, 7.0)  # delta = 0.5, below 1.0
    alerts = generate_alerts(student)
    assert not any(
        a.alert_type == DashboardAlert.TYPE_QUICK_WIN
        and a.payload.get("kind") == "calibration"
        for a in alerts
    )


def test_no_alert_when_too_few_samples(student, institute):
    """Need ≥3 calibrations before drawing a conclusion."""
    _calibration(student, institute, 8.0, 6.0)  # delta = 2.0
    _calibration(student, institute, 8.0, 6.0)
    alerts = generate_alerts(student)
    assert not any(
        a.alert_type == DashboardAlert.TYPE_QUICK_WIN
        and a.payload.get("kind") == "calibration"
        for a in alerts
    )


def test_over_prediction_fires_alert(student, institute):
    """Avg delta = +1.5 over 4 samples → over-prediction alert."""
    for _ in range(4):
        _calibration(student, institute, 8.0, 6.5)  # delta = 1.5
    alerts = generate_alerts(student)
    matched = [
        a for a in alerts
        if a.alert_type == DashboardAlert.TYPE_QUICK_WIN
        and a.payload.get("kind") == "calibration"
    ]
    assert len(matched) == 1
    assert matched[0].payload["direction"] == "over"
    assert matched[0].payload["samples"] == 4


def test_under_prediction_fires_alert(student, institute):
    """Avg delta = -1.5 over 4 samples → under-prediction alert (under-confident)."""
    for _ in range(4):
        _calibration(student, institute, 6.0, 7.5)  # delta = -1.5
    alerts = generate_alerts(student)
    matched = [
        a for a in alerts
        if a.alert_type == DashboardAlert.TYPE_QUICK_WIN
        and a.payload.get("kind") == "calibration"
    ]
    assert len(matched) == 1
    assert matched[0].payload["direction"] == "under"


def test_calibration_alert_dedups_by_direction(student, institute):
    """Two dashboard polls in the same week → still only one alert."""
    for _ in range(4):
        _calibration(student, institute, 8.0, 6.5)
    generate_alerts(student)
    generate_alerts(student)
    count = DashboardAlert.objects.filter(
        user=student, alert_type=DashboardAlert.TYPE_QUICK_WIN,
        payload__kind="calibration", payload__direction="over",
    ).count()
    assert count == 1
