"""
Transactional email senders.

Plain-text bodies for now — easy to read in the dev console, easy to grep
in support tickets, no template engine to maintain. When marketing wants
HTML emails, switch each function to `EmailMultiAlternatives` + a Django
template.
"""

import logging

from django.conf import settings
from django.core.mail import send_mail

log = logging.getLogger(__name__)


def _send(subject: str, body: str, to_email: str) -> None:
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to_email],
            fail_silently=False,
        )
    except Exception:  # noqa: BLE001
        # Email failures should never break the calling flow (signup,
        # password reset). Log and move on.
        log.exception("Failed to send email subject=%r to=%s", subject, to_email)


def send_email_verification(user, token: str) -> None:
    link = f"{settings.FRONTEND_BASE_URL}/verify-email?token={token}"
    body = (
        f"Hi {user.name or user.email},\n\n"
        f"Confirm your email address by visiting:\n{link}\n\n"
        f"This link expires in {settings.EMAIL_VERIFICATION_TIMEOUT_HOURS} hours.\n\n"
        f"If you didn't sign up, you can ignore this email.\n"
    )
    _send("Confirm your AI IELTS Tutor email", body, user.email)


def send_password_reset(user, token: str) -> None:
    link = f"{settings.FRONTEND_BASE_URL}/reset-password?token={token}"
    body = (
        f"Hi {user.name or user.email},\n\n"
        f"Reset your password by visiting:\n{link}\n\n"
        f"This link expires in {settings.PASSWORD_RESET_TIMEOUT_HOURS} hours.\n"
        f"If you didn't request this, you can ignore this email — your "
        f"password won't change.\n"
    )
    _send("Reset your AI IELTS Tutor password", body, user.email)


def send_invitation(invitation) -> None:
    body = (
        f"You've been invited to join {invitation.institute.name} on "
        f"AI IELTS Tutor.\n\n"
        f"Accept the invitation to set up your account:\n{invitation.accept_url}\n\n"
        f"This invite expires in {settings.INVITE_TIMEOUT_DAYS} days.\n"
    )
    if invitation.invited_by:
        body = f"{invitation.invited_by.name or invitation.invited_by.email} invited you.\n\n" + body
    _send(f"You're invited to {invitation.institute.name} — AI IELTS Tutor", body, invitation.email)
