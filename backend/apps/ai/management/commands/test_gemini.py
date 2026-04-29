"""
Smoke-test the Gemini provider in whichever mode is currently configured.

Usage:
    python manage.py test_gemini

Run it after switching USE_VERTEX_AI to verify Vertex is drawing GCP credits
(look for traffic_type=ON_DEMAND in the output).
"""

import json

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.ai.client import get_client
from apps.ai.service import generate_quiz


class Command(BaseCommand):
    help = "Smoke-test the configured Gemini provider with one quiz call."

    def handle(self, *args, **options):
        mode = "Vertex AI" if settings.USE_VERTEX_AI else "AI Studio"
        self.stdout.write(self.style.HTTP_INFO(f"Provider mode: {mode}"))
        if settings.USE_VERTEX_AI:
            self.stdout.write(f"  project={settings.GOOGLE_CLOUD_PROJECT} region={settings.GCP_REGION}")
        self.stdout.write(f"  model={settings.GEMINI_MODEL}")

        client = get_client()
        self.stdout.write("Calling generate_quiz('Easy')...")

        # We run a low-token call (5-question quiz) so this is fast and cheap.
        from django.utils import timezone
        t0 = timezone.now()
        result = generate_quiz("Easy")
        elapsed = (timezone.now() - t0).total_seconds()

        self.stdout.write(self.style.SUCCESS(f"OK ({elapsed:.2f}s)"))
        title = result.get("title", "(no title)")
        n_questions = len(result.get("questions", []))
        self.stdout.write(f"  title: {title}")
        self.stdout.write(f"  questions: {n_questions}")

        # Show first question for sanity
        if n_questions:
            q = result["questions"][0]
            self.stdout.write(f"  Q1: {q['question'][:120]}")
            self.stdout.write(f"  correctAnswer: {q.get('correctAnswer')}")

        # Verify trafficType in Vertex mode
        # (Requires re-running via raw client to get response object)
        if settings.USE_VERTEX_AI:
            self.stdout.write("\nVerifying traffic_type (Vertex mode only)...")
            from apps.ai import schemas
            response = client._client.models.generate_content(  # noqa: SLF001
                model=client.model,
                contents="Reply with the word 'pong'.",
                config=None,
            )
            traffic_type = client.get_traffic_type(response)
            if traffic_type == "ON_DEMAND":
                self.stdout.write(self.style.SUCCESS(f"  traffic_type=ON_DEMAND  (Vertex credits will be drawn)"))
            else:
                self.stdout.write(self.style.WARNING(f"  traffic_type={traffic_type}  (verify billing setup)"))

        self.stdout.write(self.style.SUCCESS("\nGemini provider is working."))
