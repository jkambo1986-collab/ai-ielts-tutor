"""End-to-end smoke tests for the auth flow + tenant isolation.

These don't hit Gemini — they exercise everything between HTTP and the DB
to catch the kinds of regressions that are easy to introduce when refactoring
the tenant middleware or JWT claims.
"""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.tenants.models import Institute, InstituteSettings


@pytest.fixture
def institute_default(db):
    inst = Institute.objects.create(name="Default", slug="default")
    InstituteSettings.objects.create(institute=inst)
    return inst


@pytest.fixture
def institute_demo(db):
    inst = Institute.objects.create(name="Demo", slug="demo")
    InstituteSettings.objects.create(institute=inst)
    return inst


@pytest.fixture
def client():
    return APIClient()


def _with_tenant(client, slug):
    client.credentials(HTTP_X_INSTITUTE_SLUG=slug)
    return client


def test_signup_creates_user_in_correct_tenant(client, institute_default):
    _with_tenant(client, "default")
    resp = client.post(
        "/api/v1/auth/signup",
        {"name": "Bob", "email": "bob@example.com", "password": "Tr0ub4dor&3xY9"},
        format="json",
    )
    assert resp.status_code == 201, resp.content
    user = User.objects.get(email="bob@example.com")
    assert user.institute_id == institute_default.id
    assert user.role == User.ROLE_STUDENT


def test_login_returns_tokens(client, institute_default):
    _with_tenant(client, "default")
    client.post(
        "/api/v1/auth/signup",
        {"name": "Bob", "email": "bob@example.com", "password": "Tr0ub4dor&3xY9"},
        format="json",
    )
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "bob@example.com", "password": "Tr0ub4dor&3xY9"},
        format="json",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access" in data and "refresh" in data
    assert data["user"]["email"] == "bob@example.com"


def test_cross_tenant_login_blocked(client, institute_default, institute_demo):
    # User signs up in default
    _with_tenant(client, "default")
    client.post(
        "/api/v1/auth/signup",
        {"name": "Bob", "email": "bob@example.com", "password": "Tr0ub4dor&3xY9"},
        format="json",
    )
    # Tries to log in via demo's tenant — must fail
    _with_tenant(client, "demo")
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "bob@example.com", "password": "Tr0ub4dor&3xY9"},
        format="json",
    )
    assert resp.status_code == 400


def test_unknown_tenant_returns_404(client, db):
    _with_tenant(client, "does-not-exist")
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 404


def test_me_requires_auth(client, institute_default):
    _with_tenant(client, "default")
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401


def test_me_returns_profile(client, institute_default):
    _with_tenant(client, "default")
    signup = client.post(
        "/api/v1/auth/signup",
        {"name": "Bob", "email": "bob@example.com", "password": "Tr0ub4dor&3xY9"},
        format="json",
    ).json()
    client.credentials(
        HTTP_X_INSTITUTE_SLUG="default",
        HTTP_AUTHORIZATION=f"Bearer {signup['access']}",
    )
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    assert resp.json()["email"] == "bob@example.com"
    assert resp.json()["institute_slug"] == "default"


def test_institute_admin_can_grant_pro(client, institute_default):
    """Institute admins (not students) grant Pro to users."""
    # Create a student via signup
    _with_tenant(client, "default")
    signup = client.post(
        "/api/v1/auth/signup",
        {"name": "Bob", "email": "bob@example.com", "password": "Tr0ub4dor&3xY9"},
        format="json",
    ).json()
    assert signup["user"]["subscription_plan"] == "free"

    # Create an admin directly (admin signup is out of scope of public signup)
    admin = User.objects.create_user(
        email="admin@default.local",
        password="AdminPass1234",
        name="Admin",
        institute=institute_default,
        role=User.ROLE_INSTITUTE_ADMIN,
    )
    admin_login = client.post(
        "/api/v1/auth/login",
        {"email": admin.email, "password": "AdminPass1234"},
        format="json",
    ).json()

    # Admin grants Pro to the student
    client.credentials(
        HTTP_X_INSTITUTE_SLUG="default",
        HTTP_AUTHORIZATION=f"Bearer {admin_login['access']}",
    )
    resp = client.post(
        "/api/v1/billing/grant-pro",
        {"user_email": "bob@example.com", "days": 30},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.json()["user"]["subscription_plan"] == "pro"
    assert resp.json()["user"]["is_pro"] is True


def test_student_cannot_grant_pro(client, institute_default):
    """A student calling grant-pro must get 403."""
    _with_tenant(client, "default")
    signup = client.post(
        "/api/v1/auth/signup",
        {"name": "Bob", "email": "bob@example.com", "password": "Tr0ub4dor&3xY9"},
        format="json",
    ).json()
    client.credentials(
        HTTP_X_INSTITUTE_SLUG="default",
        HTTP_AUTHORIZATION=f"Bearer {signup['access']}",
    )
    resp = client.post(
        "/api/v1/billing/grant-pro",
        {"user_email": "bob@example.com"},
        format="json",
    )
    assert resp.status_code == 403


def test_pro_feature_blocks_free_user(client, institute_default):
    _with_tenant(client, "default")
    signup = client.post(
        "/api/v1/auth/signup",
        {"name": "Bob", "email": "bob@example.com", "password": "Tr0ub4dor&3xY9"},
        format="json",
    ).json()
    client.credentials(
        HTTP_X_INSTITUTE_SLUG="default",
        HTTP_AUTHORIZATION=f"Bearer {signup['access']}",
    )
    # RolePlay is Pro-only — Free user must get 402
    resp = client.post("/api/v1/speaking/start-session", {"mode": "RolePlay"}, format="json")
    assert resp.status_code == 402
    assert "Pro" in resp.json()["detail"]
