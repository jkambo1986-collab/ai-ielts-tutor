"""Django app config for the AI layer — GeminiClient + service.py for all Gemini calls."""

from django.apps import AppConfig


class AiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.ai"
    label = "ai"
