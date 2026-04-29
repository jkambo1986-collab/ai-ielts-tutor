"""Django app config for the admin panel — sitemap, users list, usage stats, audit log."""

from django.apps import AppConfig


class AdminPanelConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.adminpanel"
    label = "adminpanel"
