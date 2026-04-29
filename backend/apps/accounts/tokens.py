"""
Models for one-time tokens (password reset, email verification, invites).

Why three models instead of one polymorphic table:
  - Each lifecycle is different (reset = short TTL, verify = medium, invite = long).
  - Constraints differ (invite belongs to an institute, reset doesn't).
  - Querying "all active tokens for X" is simpler with separate tables.
"""

import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


def _make_token() -> str:
    """URL-safe one-time token. 256-bit entropy."""
    return secrets.token_urlsafe(32)


class _TokenBase(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    token = models.CharField(max_length=80, unique=True, db_index=True, default=_make_token)
    expires_at = models.DateTimeField(db_index=True)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True

    @property
    def is_active(self) -> bool:
        return self.used_at is None and self.expires_at > timezone.now()

    def consume(self):
        self.used_at = timezone.now()
        self.save(update_fields=["used_at"])


class PasswordResetToken(_TokenBase):
    user = models.ForeignKey(
        "accounts.User", on_delete=models.CASCADE, related_name="password_reset_tokens"
    )

    @classmethod
    def issue(cls, user) -> "PasswordResetToken":
        # Invalidate any earlier outstanding tokens — only one is valid at a time
        cls.objects.filter(user=user, used_at__isnull=True).update(used_at=timezone.now())
        return cls.objects.create(
            user=user,
            expires_at=timezone.now() + timedelta(hours=settings.PASSWORD_RESET_TIMEOUT_HOURS),
        )

    class Meta:
        ordering = ["-created_at"]


class EmailVerificationToken(_TokenBase):
    user = models.ForeignKey(
        "accounts.User", on_delete=models.CASCADE, related_name="email_verification_tokens"
    )

    @classmethod
    def issue(cls, user) -> "EmailVerificationToken":
        cls.objects.filter(user=user, used_at__isnull=True).update(used_at=timezone.now())
        return cls.objects.create(
            user=user,
            expires_at=timezone.now() + timedelta(hours=settings.EMAIL_VERIFICATION_TIMEOUT_HOURS),
        )

    class Meta:
        ordering = ["-created_at"]


class UserInvitation(_TokenBase):
    """Issued by an institute admin to onboard a student.

    On accept: creates the user, marks token as used, links audit entry.
    """

    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="invitations")
    invited_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="invitations_sent",
    )
    email = models.EmailField(db_index=True)
    name = models.CharField(max_length=200, blank=True)
    role = models.CharField(max_length=20, default="student")
    accepted_user = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="invitation",
    )

    @classmethod
    def issue(cls, *, institute, invited_by, email: str, name: str = "", role: str = "student") -> "UserInvitation":
        return cls.objects.create(
            institute=institute,
            invited_by=invited_by,
            email=email.lower(),
            name=name,
            role=role,
            expires_at=timezone.now() + timedelta(days=settings.INVITE_TIMEOUT_DAYS),
        )

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # Anti-spam: one outstanding invite per (institute, email)
            models.UniqueConstraint(
                fields=["institute", "email"],
                condition=models.Q(used_at__isnull=True),
                name="unique_outstanding_invite_per_institute_email",
            ),
        ]

    @property
    def accept_url(self) -> str:
        return f"{settings.FRONTEND_BASE_URL}/accept-invite?token={self.token}"
