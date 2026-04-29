"""
Tenant-aware base manager.

Any model that has institute_id should subclass TenantScopedModel and use
TenantQuerySet — but explicit filtering at the view layer is the primary
defense. This manager is a safety net.
"""

from django.db import models


class TenantQuerySet(models.QuerySet):
    def for_request(self, request):
        institute = getattr(request, "institute", None)
        if institute is None:
            return self.none()
        return self.filter(institute=institute)

    def for_user(self, user):
        if not user.is_authenticated:
            return self.none()
        return self.filter(institute=user.institute)


class TenantManager(models.Manager.from_queryset(TenantQuerySet)):
    pass


class TenantScopedModel(models.Model):
    """Abstract base for any model that belongs to an Institute."""

    institute = models.ForeignKey(
        "tenants.Institute",
        on_delete=models.CASCADE,
        related_name="+",
        db_index=True,
    )

    objects = TenantManager()

    class Meta:
        abstract = True
