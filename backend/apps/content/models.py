"""
Per-institute prompt library.

Replaces the hard-coded WRITING_TASK_2_PROMPTS / SPEAKING_PROMPTS in the
frontend constants.ts. Each institute gets its own list; the FE falls back to
the legacy hard-coded list if the API returns no rows.
"""

import uuid

from django.db import models


class Prompt(models.Model):
    SKILL_WRITING = "writing"
    SKILL_SPEAKING = "speaking"
    SKILL_CHOICES = [
        (SKILL_WRITING, "Writing"),
        (SKILL_SPEAKING, "Speaking"),
    ]

    # For Speaking prompts only — IELTS Part 1 / 2 / 3
    PART_1 = "Part 1"
    PART_2 = "Part 2"
    PART_3 = "Part 3"
    PART_CHOICES = [(PART_1, "Part 1"), (PART_2, "Part 2"), (PART_3, "Part 3")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "tenants.Institute", on_delete=models.CASCADE, related_name="prompts"
    )
    skill = models.CharField(max_length=20, choices=SKILL_CHOICES, db_index=True)
    part = models.CharField(
        max_length=10, choices=PART_CHOICES, blank=True,
        help_text="Only meaningful for speaking prompts.",
    )
    text = models.TextField()
    is_active = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["skill", "part", "-created_at"]
        indexes = [models.Index(fields=["institute", "skill", "is_active"])]

    def __str__(self) -> str:
        return f"[{self.skill}{' ' + self.part if self.part else ''}] {self.text[:60]}..."
