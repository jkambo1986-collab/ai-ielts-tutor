from django.urls import path

from apps.accounts import invitations, views

urlpatterns = [
    path("signup", views.SignupView.as_view(), name="auth-signup"),
    path("login", views.LoginView.as_view(), name="auth-login"),
    path("logout", views.LogoutView.as_view(), name="auth-logout"),
    path("refresh", views.TokenRefreshView.as_view(), name="auth-refresh"),
    path("me", views.MeView.as_view(), name="auth-me"),
    path("password-reset-request", views.PasswordResetRequestView.as_view(), name="auth-password-reset-request"),
    path("password-reset-confirm", views.PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
    path("verify-email", views.VerifyEmailView.as_view(), name="auth-verify-email"),
    # Public invite flow (no auth required)
    path("invite/accept", invitations.InviteAcceptView.as_view(), name="auth-invite-accept"),
    path("invite/<str:token>", invitations.InviteLookupView.as_view(), name="auth-invite-lookup"),
]
