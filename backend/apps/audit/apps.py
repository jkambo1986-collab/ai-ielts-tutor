"""Django app config for the append-only AuditLogEntry — every Pro grant, role change, etc."""

from django.apps import AppConfig


class AuditConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.audit"
    label = "audit"
