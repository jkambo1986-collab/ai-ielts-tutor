"""Tests for the pre-session SRS warmup endpoint."""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.practice.models import ErrorCard
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
    from rest_framework_simplejwt.tokens import RefreshToken
    refresh = RefreshToken.for_user(student)
    c = APIClient()
    c.credentials(
        HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}",
        HTTP_X_INSTITUTE_SLUG=institute.slug,
    )
    return c


def _card(student, institute, category, *, days_until_due=0):
    return ErrorCard.objects.create(
        user=student, institute=institute,
        source_session_type="writing", source_session_id=uuid.uuid4(),
        category=category,
        error_text=f"Sample error text for {category} category demonstration.",
        due_at=timezone.now() + timedelta(days=days_until_due),
    )


def test_warmup_returns_zero_when_no_due_cards(auth_client):
    resp = auth_client.get("/api/v1/analytics/warmup")
    assert resp.status_code == 200
    body = resp.json()
    assert body["due_srs_count"] == 0
    assert body["due_categories"] == []
    assert body["suggested_cards"] == []


def test_warmup_counts_only_due_cards(auth_client, student, institute):
    _card(student, institute, ErrorCard.CATEGORY_GRAMMAR, days_until_due=0)
    _card(student, institute, ErrorCard.CATEGORY_LEXICAL, days_until_due=0)
    _card(student, institute, ErrorCard.CATEGORY_PRONUNCIATION, days_until_due=5)  # not due
    resp = auth_client.get("/api/v1/analytics/warmup")
    assert resp.status_code == 200
    body = resp.json()
    assert body["due_srs_count"] == 2


def test_warmup_excludes_archived_cards(auth_client, student, institute):
    _card(student, institute, ErrorCard.CATEGORY_GRAMMAR)
    archived = _card(student, institute, ErrorCard.CATEGORY_LEXICAL)
    archived.archived_at = timezone.now()
    archived.save(update_fields=["archived_at"])
    resp = auth_client.get("/api/v1/analytics/warmup")
    body = resp.json()
    assert body["due_srs_count"] == 1


def test_warmup_reranks_by_session_type(auth_client, student, institute):
    """A speaking session should surface pronunciation cards first."""
    _card(student, institute, ErrorCard.CATEGORY_GRAMMAR)
    _card(student, institute, ErrorCard.CATEGORY_LEXICAL)
    _card(student, institute, ErrorCard.CATEGORY_PRONUNCIATION)

    resp = auth_client.get("/api/v1/analytics/warmup?session_type=speaking")
    body = resp.json()
    assert body["session_type"] == "speaking"
    # Pronunciation should be the first suggested card for a speaking session.
    suggested_cats = [c["category"] for c in body["suggested_cards"]]
    assert suggested_cats[0] == ErrorCard.CATEGORY_PRONUNCIATION


def test_warmup_returns_top_3_suggested(auth_client, student, institute):
    for cat in [
        ErrorCard.CATEGORY_GRAMMAR,
        ErrorCard.CATEGORY_LEXICAL,
        ErrorCard.CATEGORY_COHERENCE,
        ErrorCard.CATEGORY_TASK,
        ErrorCard.CATEGORY_FLUENCY,
    ]:
        _card(student, institute, cat)
    resp = auth_client.get("/api/v1/analytics/warmup")
    body = resp.json()
    assert len(body["suggested_cards"]) == 3


def test_warmup_isolates_per_user(auth_client, student, institute):
    """One student's due cards must not show up in another's warmup."""
    other = User.objects.create_user(
        email="other@example.com", password="x", institute=institute,
    )
    _card(other, institute, ErrorCard.CATEGORY_GRAMMAR)
    resp = auth_client.get("/api/v1/analytics/warmup")
    assert resp.json()["due_srs_count"] == 0
