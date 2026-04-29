"""Auth + profile views."""

import logging

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView as _TokenRefreshView

from apps.audit.models import AuditLogEntry
from apps.audit.services import record as audit_record
from apps.accounts.emails import send_email_verification, send_password_reset
from apps.accounts.tokens import EmailVerificationToken, PasswordResetToken
from apps.accounts.serializers import (
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileUpdateSerializer,
    SignupSerializer,
    TokenObtainSerializer,
    UserSerializer,
)

log = logging.getLogger(__name__)


def _tokens_for_user(user):
    refresh = TokenObtainSerializer.get_token(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


class SignupView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "anon"

    def post(self, request):
        serializer = SignupSerializer(
            data=request.data,
            context={"institute": getattr(request, "institute", None)},
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        audit_record(AuditLogEntry.ACTION_SIGNUP, actor=user, target_user=user, request=request)
        # Send verification email — failures are logged but don't block signup
        try:
            tk = EmailVerificationToken.issue(user)
            send_email_verification(user, tk.token)
        except Exception:  # noqa: BLE001
            log.exception("Could not send verification email to %s", user.email)
        return Response(
            {
                "user": UserSerializer(user).data,
                **_tokens_for_user(user),
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "anon"

    def post(self, request):
        serializer = LoginSerializer(
            data=request.data,
            context={"request": request, "institute": getattr(request, "institute", None)},
        )
        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            # Record failed login (without password) so suspicious patterns
            # show up in the audit log.
            audit_record(
                AuditLogEntry.ACTION_LOGIN_FAILED,
                payload={"email": request.data.get("email", "")[:200]},
                request=request,
            )
            raise
        user = serializer.validated_data["user"]
        audit_record(AuditLogEntry.ACTION_LOGIN, actor=user, target_user=user, request=request)
        return Response(
            {
                "user": UserSerializer(user).data,
                **_tokens_for_user(user),
            }
        )


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response({"detail": "refresh token required"}, status=400)
        try:
            RefreshToken(refresh_token).blacklist()
        except TokenError:
            pass  # Already blacklisted or expired — idempotent
        return Response({"success": True})


class TokenRefreshView(_TokenRefreshView):
    """Standard simplejwt refresh — exposed at our /api/auth/refresh path."""


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        request.user.downgrade_if_expired()
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class PasswordResetRequestView(APIView):
    """POST /auth/password-reset-request — issue a token and email a reset link.

    Anti-enumeration: same response whether the email exists or not.
    """

    permission_classes = [AllowAny]
    throttle_scope = "anon"

    def post(self, request):
        from apps.accounts.models import User as UserModel

        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        institute = getattr(request, "institute", None)
        user = (
            UserModel.objects
            .filter(email__iexact=email, deleted_at__isnull=True)
            .filter(institute=institute) if institute else UserModel.objects.filter(email__iexact=email, deleted_at__isnull=True)
        ).first() if institute else UserModel.objects.filter(email__iexact=email, deleted_at__isnull=True).first()

        # Scope to current institute when one is resolved (anti cross-tenant probe)
        if user and institute and user.institute_id != institute.id and user.role != UserModel.ROLE_SUPER_ADMIN:
            user = None

        if user:
            tk = PasswordResetToken.issue(user)
            send_password_reset(user, tk.token)
            audit_record(
                AuditLogEntry.ACTION_PASSWORD_RESET_REQUEST,
                target_user=user, institute=user.institute, request=request,
            )

        return Response({"detail": "If an account exists, a reset email has been sent."})


class PasswordResetConfirmView(APIView):
    """POST /auth/password-reset-confirm — verify token and set new password."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tk = PasswordResetToken.objects.select_related("user").get(
                token=serializer.validated_data["token"],
            )
        except PasswordResetToken.DoesNotExist:
            return Response({"detail": "Invalid or expired token."}, status=400)

        if not tk.is_active:
            return Response({"detail": "Invalid or expired token."}, status=400)

        user = tk.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        tk.consume()
        audit_record(
            AuditLogEntry.ACTION_PASSWORD_RESET_CONFIRM,
            target_user=user, institute=user.institute, request=request,
        )
        return Response({"detail": "Password updated. You can now log in."})


class VerifyEmailView(APIView):
    """POST /auth/verify-email — consume an email verification token."""

    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get("token", "")
        try:
            tk = EmailVerificationToken.objects.select_related("user").get(token=token)
        except EmailVerificationToken.DoesNotExist:
            return Response({"detail": "Invalid or expired token."}, status=400)

        if not tk.is_active:
            return Response({"detail": "Invalid or expired token."}, status=400)

        tk.consume()
        # We mirror the verified state on the User model via a lightweight flag
        # added to the User table (see accounts/models.py — email_verified_at).
        user = tk.user
        from django.utils import timezone as _tz
        if not user.email_verified_at:
            user.email_verified_at = _tz.now()
            user.save(update_fields=["email_verified_at"])
        audit_record(
            AuditLogEntry.ACTION_EMAIL_VERIFIED,
            target_user=user, institute=user.institute, request=request,
        )
        return Response({"detail": "Email verified."})
