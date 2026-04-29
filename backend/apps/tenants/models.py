"""
Tenant models. Every tenant-scoped row in the platform foreign-keys to Institute.

Multi-tenancy strategy: shared DB, single schema, institute_id on every row.
TenantQuerySet (in apps/common/managers.py) auto-filters reads by request.institute.
"""

import uuid

from django.db import models


class Institute(models.Model):
    """An institute / school / training center using the platform."""

    PLAN_FREE = "free"
    PLAN_STARTER = "starter"
    PLAN_PRO = "pro"
    PLAN_ENTERPRISE = "enterprise"
    PLAN_CHOICES = [
        (PLAN_FREE, "Free"),
        (PLAN_STARTER, "Starter"),
        (PLAN_PRO, "Pro"),
        (PLAN_ENTERPRISE, "Enterprise"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=80, unique=True, db_index=True)
    plan_tier = models.CharField(max_length=20, choices=PLAN_CHOICES, default=PLAN_FREE)
    max_users = models.PositiveIntegerField(default=50)
    billing_email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.slug})"


class InstituteSettings(models.Model):
    """Per-institute configuration knobs — feature flags, defaults, branding hooks."""

    institute = models.OneToOneField(
        Institute, on_delete=models.CASCADE, related_name="settings"
    )
    default_target_score = models.FloatField(default=7.0)
    allow_signup = models.BooleanField(default=True, help_text="Whether public signup is enabled")
    custom_branding = models.JSONField(default=dict, blank=True)
    feature_overrides = models.JSONField(
        default=dict,
        blank=True,
        help_text="Map of feature_flag -> bool, overriding plan_tier defaults",
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Settings for {self.institute.slug}"
