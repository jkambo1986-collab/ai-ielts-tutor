"""URL routes for /api/v1/auth/* — signup, login, refresh, logout, me, password reset, plus invitation-accept."""

from django.urls import path

from apps.accounts import guardians, invitations, views

urlpatterns = [
    path("signup", views.SignupView.as_view(), name="auth-signup"),
    path("login", views.LoginView.as_view(), name="auth-login"),
    path("logout", views.LogoutView.as_view(), name="auth-logout"),
    path("refresh", views.TokenRefreshView.as_view(), name="auth-refresh"),
    path("me", views.MeView.as_view(), name="auth-me"),
    path("password-reset-request", views.PasswordResetRequestView.as_view(), name="auth-password-reset-request"),
    path("password-reset-confirm", views.PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
    path("verify-email", views.VerifyEmailView.as_view(), name="auth-verify-email"),
    # F2 Guardian / sponsor management (authenticated student)
    path("guardians", guardians.GuardiansView.as_view(), name="auth-guardians"),
    path("guardians/<uuid:guardian_id>/revoke", guardians.GuardianRevokeView.as_view(), name="auth-guardian-revoke"),
    # Public invite flow (no auth required)
    path("invite/accept", invitations.InviteAcceptView.as_view(), name="auth-invite-accept"),
    path("invite/<str:token>", invitations.InviteLookupView.as_view(), name="auth-invite-lookup"),
]
