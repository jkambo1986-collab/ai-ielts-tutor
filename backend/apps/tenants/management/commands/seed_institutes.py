"""
Seed two demo institutes (`default`, `demo`) plus an admin user in each.

Admin password is read from the SEED_ADMIN_PASSWORD env var (or the
--password CLI flag). The command refuses to run if neither is set —
no passwords are committed to source.

Idempotent — run multiple times safely.
"""

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.tenants.models import Institute, InstituteSettings

User = get_user_model()


SEEDS = [
    {
        "slug": "default",
        "name": "Default Institute",
        "admin_email": "admin@default.local",
    },
    {
        "slug": "demo",
        "name": "Demo Institute",
        "admin_email": "admin@demo.local",
    },
]


class Command(BaseCommand):
    help = "Seed demo institutes and admin users."

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            default=None,
            help="Admin password for both seeded admins. "
                 "Falls back to SEED_ADMIN_PASSWORD env var.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        password = options.get("password") or os.environ.get("SEED_ADMIN_PASSWORD")
        if not password:
            raise CommandError(
                "Set SEED_ADMIN_PASSWORD env var or pass --password=... to run this command."
            )
        if len(password) < 10:
            raise CommandError("Admin password must be at least 10 characters.")

        for seed in SEEDS:
            inst, created = Institute.objects.get_or_create(
                slug=seed["slug"],
                defaults={"name": seed["name"], "plan_tier": Institute.PLAN_PRO},
            )
            self.stdout.write(
                f"{'Created' if created else 'Exists '}: {inst.name} ({inst.slug})"
            )
            InstituteSettings.objects.get_or_create(institute=inst)

            admin, admin_created = User.objects.get_or_create(
                email=seed["admin_email"],
                defaults={
                    "name": f"{seed['name']} Admin",
                    "institute": inst,
                    "role": User.ROLE_INSTITUTE_ADMIN,
                    "is_staff": False,
                },
            )
            if admin_created:
                admin.set_password(password)
                admin.save()
                self.stdout.write(f"  + admin user: {admin.email} (password set from env)")
            else:
                self.stdout.write(f"  - admin user exists: {admin.email}")

        self.stdout.write(self.style.SUCCESS("Seeding complete."))
