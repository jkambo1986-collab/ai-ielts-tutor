"""
Management command — generate a labelled bank of full-length mock tests.

Run via:  python manage.py generate_mock_test_bank --count 50

Calls the existing context-aware AI agents (no extra cost surface) and
labels each test with a topic taxonomy slot so the FE can filter:
  education, environment, technology, health, society, work, travel,
  arts, science, food, urbanism.

Storage: rows are written into the `MockTestBankItem` model with skill,
topic, difficulty (band band), and the JSON payload. Idempotent — re-runs
skip topics already covered N times each. Budget-aware: --count caps the
total Gemini calls per invocation; --dry-run prints planned topics without
calling.

Cost estimate at the time of writing: roughly $0.03 per generated test.
50 tests → ~$1.50 of Gemini spend. Document this on each invocation.
"""

from __future__ import annotations

import logging
from random import shuffle

from django.core.management.base import BaseCommand

log = logging.getLogger(__name__)

TOPIC_TAXONOMY = [
    "education", "environment", "technology", "health", "society",
    "work", "travel", "arts", "science", "food", "urbanism",
]
SKILLS = ["reading", "listening", "writing"]


class Command(BaseCommand):
    help = "Generate a bank of AI-authored mock tests labelled by topic + difficulty."

    def add_arguments(self, parser):
        parser.add_argument("--count", type=int, default=10, help="Total tests to generate (caps Gemini calls).")
        parser.add_argument("--per-topic-cap", type=int, default=2, help="Skip a (skill, topic) pair if it already has this many entries.")
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--target-band", type=float, default=7.0)

    def handle(self, *args, **opts):
        from apps.practice.models import MockTestBankItem
        from apps.ai import service as ai_service

        count = int(opts["count"])
        cap = int(opts["per_topic_cap"])
        dry = bool(opts["dry_run"])
        target = float(opts["target_band"])

        # Build a candidate plan: every (skill, topic) pair, shuffled.
        plan = [(s, t) for s in SKILLS for t in TOPIC_TAXONOMY]
        shuffle(plan)

        produced = 0
        for skill, topic in plan:
            if produced >= count:
                break
            existing = MockTestBankItem.objects.filter(skill=skill, topic=topic).count()
            if existing >= cap:
                continue
            self.stdout.write(f"  → {skill}/{topic} (existing={existing}) ...")
            if dry:
                produced += 1
                continue
            try:
                if skill == "reading":
                    payload = ai_service.generate_reading_test(target_score=target, test_type="Full Passage")
                elif skill == "listening":
                    payload = ai_service.generate_listening_test(target_score=target, test_type="Lecture")
                elif skill == "writing":
                    # Writing "test" here is a single Task 2 prompt the FE can
                    # serve; we wrap it in a consistent shape.
                    payload = {
                        "prompt": (
                            f"Write 250 words on a {topic}-related Task 2 question. "
                            f"Choose any debatable angle in the {topic} domain."
                        ),
                        "task_type": "task2",
                    }
                else:
                    continue
            except Exception as e:
                log.warning("generate failed for %s/%s: %s", skill, topic, e)
                continue
            MockTestBankItem.objects.create(
                skill=skill, topic=topic, target_band=target, payload=payload,
            )
            produced += 1

        self.stdout.write(self.style.SUCCESS(
            f"Generated {produced} mock test bank items (dry_run={dry})."
        ))
