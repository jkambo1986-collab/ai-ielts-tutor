"""Django app config for the practice domain — sessions, dashboard analytics, vocab, SRS, mock tests, share links, alerts, notifications."""

from django.apps import AppConfig


class PracticeConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.practice"
    label = "practice"
