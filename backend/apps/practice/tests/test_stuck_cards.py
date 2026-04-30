"""Tests for the stuck-card escalation in ErrorCardReviewView."""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.practice.models import DashboardAlert, ErrorCard
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


@pytest.fixture
def auth_client(student, institute):
    refresh = RefreshToken.for_user(student)
    c = APIClient()
    c.credentials(
        HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}",
        HTTP_X_INSTITUTE_SLUG=institute.slug,
    )
    return c


def _stuck_card(student, institute, *, reviews: int, corrects: int) -> ErrorCard:
    return ErrorCard.objects.create(
        user=student, institute=institute,
        source_session_type="writing", source_session_id=uuid.uuid4(),
        category=ErrorCard.CATEGORY_GRAMMAR,
        error_text="he go to school every day morning before breakfast",
        due_at=timezone.now(),
        review_count=reviews, correct_count=corrects,
        repetitions=reviews,
    )


def test_stuck_card_archived_and_alert_fired(auth_client, student, institute):
    """10 reviews, 2 correct → 20% correct rate. Should archive + alert."""
    card = _stuck_card(student, institute, reviews=9, corrects=2)
    resp = auth_client.post(
        f"/api/v1/analytics/error-cards/{card.id}/review",
        {"quality": 1}, format="json",
    )
    assert resp.status_code == 200
    card.refresh_from_db()
    assert card.archived_at is not None
    alerts = DashboardAlert.objects.filter(
        user=student, alert_type=DashboardAlert.TYPE_QUICK_WIN,
        payload__kind="stuck_card",
    )
    assert alerts.count() == 1
    assert alerts.first().payload["card_id"] == str(card.id)


def test_not_archived_below_review_threshold(auth_client, student, institute):
    """9 reviews → not enough data yet; don't archive."""
    card = _stuck_card(student, institute, reviews=8, corrects=1)
    resp = auth_client.post(
        f"/api/v1/analytics/error-cards/{card.id}/review",
        {"quality": 1}, format="json",
    )
    assert resp.status_code == 200
    card.refresh_from_db()
    assert card.archived_at is None


def test_not_archived_when_correct_rate_high_enough(auth_client, student, institute):
    """10 reviews, 5 correct → 50% rate, above 30% threshold. Keep going."""
    card = _stuck_card(student, institute, reviews=9, corrects=5)
    resp = auth_client.post(
        f"/api/v1/analytics/error-cards/{card.id}/review",
        {"quality": 4}, format="json",
    )
    assert resp.status_code == 200
    card.refresh_from_db()
    assert card.archived_at is None
