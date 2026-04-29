"""
Promote a user to a higher role from the CLI.

Usage:
    python manage.py promote_user --email alice@x.com --role institute_admin
    python manage.py promote_user --email bob@x.com --role student     # demote

Useful when an institute admin loses access and ops needs to re-grant role
without going through Django admin.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.audit.models import AuditLogEntry
from apps.audit.services import record as audit_record

User = get_user_model()

VALID_ROLES = [
    User.ROLE_STUDENT,
    User.ROLE_INSTRUCTOR,
    User.ROLE_INSTITUTE_ADMIN,
    User.ROLE_SUPER_ADMIN,
]


class Command(BaseCommand):
    help = "Change a user's role."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--role", required=True, choices=VALID_ROLES)

    def handle(self, *args, **options):
        try:
            user = User.objects.get(email__iexact=options["email"])
        except User.DoesNotExist as exc:
            raise CommandError(f"No user with email {options['email']}") from exc

        old_role = user.role
        new_role = options["role"]
        if old_role == new_role:
            self.stdout.write(f"{user.email} is already {new_role}; nothing to do.")
            return

        user.role = new_role
        # super_admin can't be tied to an institute (matches the model constraint)
        if new_role == User.ROLE_SUPER_ADMIN:
            user.is_staff = True
            user.is_superuser = True
        user.save()
        audit_record(
            AuditLogEntry.ACTION_USER_ROLE_CHANGED,
            target_user=user, institute=user.institute,
            payload={"old_role": old_role, "new_role": new_role, "actor": "cli"},
        )
        self.stdout.write(self.style.SUCCESS(
            f"Promoted {user.email}: {old_role} -> {new_role}"
        ))
