"""
Soft-delete mixin for models that should not be hard-deleted.

Why: support and compliance teams need a record of what was deleted and
when, even after a user clicks "delete". Hard deletes lose audit trails;
soft deletes keep the row but hide it from default queries.

Usage:
  class WritingSession(SoftDeleteMixin, PracticeSessionBase): ...

Then `WritingSession.objects.all()` excludes soft-deleted rows by default.
Use `WritingSession.all_objects.all()` to include them (admin-only).
"""

from django.db import models
from django.utils import timezone


class SoftDeleteQuerySet(models.QuerySet):
    def delete(self):  # type: ignore[override]
        """QuerySet bulk-delete also soft-deletes."""
        return super().update(deleted_at=timezone.now())

    def hard_delete(self):
        return super().delete()

    def alive(self):
        return self.filter(deleted_at__isnull=True)

    def dead(self):
        return self.filter(deleted_at__isnull=False)


class SoftDeleteManager(models.Manager):
    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db).filter(deleted_at__isnull=True)


class AllObjectsManager(models.Manager):
    """Includes soft-deleted rows. Used by admin queries / hard-delete migrations."""

    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db)


class SoftDeleteMixin(models.Model):
    """Adds `deleted_at` + soft-delete `delete()` to the model.

    Concrete models keep their existing `objects` manager but the manager
    will filter on `deleted_at IS NULL`. Use `Model.all_objects.all()` to
    bypass.
    """

    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True

    def delete(self, using=None, keep_parents=False):  # type: ignore[override]
        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at"])

    def hard_delete(self, using=None, keep_parents=False):
        return super().delete(using=using, keep_parents=keep_parents)

    def restore(self):
        self.deleted_at = None
        self.save(update_fields=["deleted_at"])
