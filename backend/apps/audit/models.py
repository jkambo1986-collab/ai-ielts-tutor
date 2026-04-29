"""
AuditLogEntry — append-only record of significant events.

Compared to Django's LogEntry: this captures business events (Pro grant, login,
signup, prompt edited, user disabled), not admin-page changes. Each entry
records who, what, where, and the event payload.

This is the table support tickets refer to. Never delete rows — partition or
archive instead.
"""

import uuid

from django.db import models


class AuditLogEntry(models.Model):
    # -- Action vocabulary --
    # Auth
    ACTION_LOGIN = "auth.login"
    ACTION_LOGIN_FAILED = "auth.login_failed"
    ACTION_LOGOUT = "auth.logout"
    ACTION_SIGNUP = "auth.signup"
    ACTION_PASSWORD_RESET_REQUEST = "auth.password_reset_request"
    ACTION_PASSWORD_RESET_CONFIRM = "auth.password_reset_confirm"
    ACTION_EMAIL_VERIFIED = "auth.email_verified"
    # Billing
    ACTION_PRO_GRANTED = "billing.pro_granted"
    ACTION_PRO_REVOKED = "billing.pro_revoked"
    ACTION_PRO_EXPIRED = "billing.pro_expired"
    # Admin
    ACTION_USER_DISABLED = "admin.user_disabled"
    ACTION_USER_ENABLED = "admin.user_enabled"
    ACTION_USER_DELETED = "admin.user_deleted"
    ACTION_USER_ROLE_CHANGED = "admin.user_role_changed"
    ACTION_INVITE_SENT = "admin.invite_sent"
    ACTION_INVITE_ACCEPTED = "admin.invite_accepted"
    ACTION_INVITE_REVOKED = "admin.invite_revoked"
    # Content
    ACTION_PROMPT_CREATED = "content.prompt_created"
    ACTION_PROMPT_UPDATED = "content.prompt_updated"
    ACTION_PROMPT_DELETED = "content.prompt_deleted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "tenants.Institute",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_entries",
        help_text="Null for platform-level events.",
    )
    actor = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_actions",
        help_text="Null for system-initiated events (cron, expiry).",
    )
    target_user = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_targeted",
        help_text="The user this action affected, if any.",
    )
    action = models.CharField(max_length=80, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["institute", "-created_at"]),
            models.Index(fields=["actor", "-created_at"]),
            models.Index(fields=["action", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.action} by {self.actor_id} at {self.created_at:%Y-%m-%d %H:%M}"
