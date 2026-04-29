"""
Billing models. Phase 9 will swap the stub Subscription update logic
for real Stripe webhooks. Schema is already shaped to absorb that.
"""

import uuid

from django.db import models


class Subscription(models.Model):
    """Active subscription record per (user, institute). 1:1 with User but stored
    separately so we can keep historical records of plan changes."""

    STATUS_ACTIVE = "active"
    STATUS_CANCELED = "canceled"
    STATUS_EXPIRED = "expired"
    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Active"),
        (STATUS_CANCELED, "Canceled"),
        (STATUS_EXPIRED, "Expired"),
    ]

    PLAN_FREE = "free"
    PLAN_PRO = "pro"
    PLAN_CHOICES = [(PLAN_FREE, "Free"), (PLAN_PRO, "Pro")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        "accounts.User", on_delete=models.CASCADE, related_name="subscriptions"
    )
    institute = models.ForeignKey(
        "tenants.Institute", on_delete=models.CASCADE, related_name="subscriptions"
    )
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default=PLAN_FREE)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    current_period_start = models.DateTimeField(auto_now_add=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    canceled_at = models.DateTimeField(null=True, blank=True)
    # Filled in by Stripe webhook (Phase 9)
    stripe_customer_id = models.CharField(max_length=200, blank=True)
    stripe_subscription_id = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "status"])]

    def __str__(self) -> str:
        return f"{self.user.email} → {self.plan} ({self.status})"
