"""Django app config for multi-tenancy — Institute, InstituteSettings, TenantMiddleware, TenantManager."""

from django.apps import AppConfig


class TenantsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.tenants"
    label = "tenants"
