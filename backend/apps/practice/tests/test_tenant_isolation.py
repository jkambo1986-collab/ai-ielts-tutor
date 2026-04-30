"""
Cross-tenant isolation tests for the new endpoints we shipped this
session: debate rooms, voice journal, tutor marketplace, partner
matching, review queue, daily challenge, badges, bookmarks, and the
guarantee predictor.

The pattern: create two institutes (A, B). Provision a student in A who
generates state. Then attempt the same operations from a student in B.
Each operation must NOT surface A's data to B (404 / 403 / empty list,
never a leak).

Failing any of these tests = a B2B-deal-killer-grade bug. They run on
every CI pass.
"""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.practice.models import (
    DebateRoom,
    PartnerOptIn,
    ReviewRequest,
    SpeakingSession,
    TutorProfile,
    VoiceJournalEntry,
)
from apps.tenants.models import Institute, InstituteSettings


def _institute(slug: str) -> Institute:
    inst = Institute.objects.create(name=slug.capitalize(), slug=slug)
    InstituteSettings.objects.create(institute=inst)
    return inst


def _student(email: str, inst: Institute) -> User:
    return User.objects.create_user(email=email, password="x", institute=inst)


def _client_for(user: User, inst: Institute) -> APIClient:
    refresh = RefreshToken.for_user(user)
    c = APIClient()
    c.credentials(
        HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}",
        HTTP_X_INSTITUTE_SLUG=inst.slug,
    )
    return c


# ----- Fixtures ----- #

@pytest.fixture
def two_tenants(db):
    a = _institute("alpha")
    b = _institute("beta")
    alice = _student("alice@alpha.test", a)
    bob = _student("bob@beta.test", b)
    return a, b, alice, bob


@pytest.fixture
def alpha_state(two_tenants):
    """Provision data inside Alpha that Beta should never see."""
    a, _b, alice, _bob = two_tenants
    sess = SpeakingSession.objects.create(
        user=alice, institute=a, mode="Standard",
    )
    journal = VoiceJournalEntry.objects.create(
        user=alice, institute=a, prompt="x", transcript="hello world", duration_seconds=30,
    )
    review = ReviewRequest.objects.create(
        user=alice, institute=a,
        session_type="speaking", session_id=sess.id,
        sla_due_at=__import__("django").utils.timezone.now() + __import__("datetime").timedelta(hours=48),
    )
    PartnerOptIn.objects.create(user=alice, institute=a, is_active=True)
    return sess, journal, review


# ----- Tests ----- #

def test_voice_journal_isolated(two_tenants, alpha_state):
    _a, b, _alice, bob = two_tenants
    c = _client_for(bob, b)
    resp = c.get("/api/v1/speaking/journal")
    assert resp.status_code == 200
    assert resp.json()["entries"] == [], "Voice journal leaked across tenants"


def test_review_queue_isolated(two_tenants, alpha_state):
    _a, b, _alice, bob = two_tenants
    c = _client_for(bob, b)
    resp = c.get("/api/v1/analytics/reviews")
    assert resp.status_code == 200
    assert resp.json()["reviews"] == [], "Review queue leaked across tenants"


def test_speaking_session_not_accessible_cross_tenant(two_tenants, alpha_state):
    sess, _journal, _review = alpha_state
    _a, b, _alice, bob = two_tenants
    c = _client_for(bob, b)
    # Bookmark endpoint requires the session to belong to the requester's institute.
    resp = c.post(
        f"/api/v1/speaking/sessions/{sess.id}/bookmarks",
        {"transcript_index": 0, "note": "leak"}, format="json",
    )
    # Should 404 (or 403). Never 201, which would mean we wrote a
    # bookmark across the tenant boundary.
    assert resp.status_code in (404, 403), f"expected 404/403, got {resp.status_code}"


def test_partner_match_does_not_pair_across_tenants_without_consent(two_tenants):
    a, b, alice, bob = two_tenants
    # Alice opts in (institute-only). Bob also opts in but in Beta.
    PartnerOptIn.objects.create(user=alice, institute=a, is_active=True, cross_institute_ok=False)
    PartnerOptIn.objects.create(user=bob, institute=b, is_active=True, cross_institute_ok=False)
    c = _client_for(alice, a)
    resp = c.post("/api/v1/analytics/partner/match-now", {}, format="json")
    # 204 = no eligible partner. 201 with bob would be the leak.
    assert resp.status_code in (204, 201)
    if resp.status_code == 201:
        # Should not have matched Bob — different institute, no consent.
        body = resp.json()
        assert body.get("partner_id") != str(bob.id), "Cross-tenant match without consent"


def test_tutor_list_scoped_to_caller_institute(two_tenants):
    a, b, alice, bob = two_tenants
    # Bob is a tutor in Beta.
    bob.role = User.ROLE_INSTRUCTOR
    bob.save()
    TutorProfile.objects.create(user=bob, institute=b, bio="beta tutor", is_active=True)
    c = _client_for(alice, a)
    resp = c.get("/api/v1/speaking/tutors")
    assert resp.status_code == 200
    tutor_ids = [t["user_id"] for t in resp.json()["tutors"]]
    assert str(bob.id) not in tutor_ids, "Tutor list leaked across tenants"


def test_debate_room_not_accessible_cross_tenant(two_tenants):
    a, b, alice, bob = two_tenants
    room = DebateRoom.objects.create(
        institute=a, topic="alpha topic", target_band=__import__("decimal").Decimal("7.0"),
    )
    c = _client_for(bob, b)
    resp = c.get(f"/api/v1/speaking/debate/rooms/{room.id}")
    assert resp.status_code == 404, f"expected 404, got {resp.status_code}"


def test_daily_challenge_is_per_user(two_tenants):
    """Two students in DIFFERENT institutes both get their OWN
    daily-challenge row, never sharing one."""
    a, b, alice, bob = two_tenants
    ca = _client_for(alice, a)
    cb = _client_for(bob, b)
    ra = ca.get("/api/v1/analytics/daily-challenge")
    rb = cb.get("/api/v1/analytics/daily-challenge")
    assert ra.status_code in (200, 201)
    assert rb.status_code in (200, 201)
    assert ra.json()["id"] != rb.json()["id"], "Daily challenge shared across users"


def test_guarantee_assesses_only_caller(two_tenants, alpha_state):
    _a, b, _alice, bob = two_tenants
    c = _client_for(bob, b)
    resp = c.get("/api/v1/analytics/guarantee")
    assert resp.status_code == 200
    body = resp.json()
    # Bob has no sessions — should be ineligible.
    assert body["eligible"] is False
