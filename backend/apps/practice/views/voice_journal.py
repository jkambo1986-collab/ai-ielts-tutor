"""
Voice journal endpoints (Hard 8).

Three endpoints:
  GET  /speaking/journal/today  — today's daily rotating prompt
  GET  /speaking/journal        — student's recent entries (paginated)
  POST /speaking/journal        — submit a new entry with transcript +
                                   duration; backend computes fluency metrics
                                   + a one-line lexical observation
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.practice.models import VocabularyObservation, VoiceJournalEntry


_DAILY_PROMPTS = [
    "Describe a small thing that made you smile this week.",
    "What is one habit you've changed in the last six months?",
    "Talk about a place you'd visit if travel were free.",
    "Describe a meal that means something to you.",
    "Tell a story about a time you were wrong about something.",
    "What would you spend a whole free day on?",
    "Describe something you used to dislike but now enjoy.",
]


def _today_prompt():
    today = timezone.localtime(timezone.now()).date()
    return _DAILY_PROMPTS[today.toordinal() % len(_DAILY_PROMPTS)]


def _serialize(e: VoiceJournalEntry) -> dict:
    return {
        "id": str(e.id),
        "prompt": e.prompt,
        "duration_seconds": e.duration_seconds,
        "transcript": e.transcript,
        "fluency_metrics": e.fluency_metrics,
        "lexical_note": e.lexical_note,
        "created_at": e.created_at.isoformat(),
    }


class JournalTodayView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"prompt": _today_prompt()})


class _CreateInput(serializers.Serializer):
    prompt = serializers.CharField(required=False, allow_blank=True, max_length=300, default="")
    transcript = serializers.CharField(min_length=10, max_length=8000)
    duration_seconds = serializers.IntegerField(min_value=10, max_value=600)


class JournalView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = list(
            VoiceJournalEntry.objects.filter(
                user=request.user, institute=request.user.institute,
            ).order_by("-created_at")[:30]
        )
        return Response({"entries": [_serialize(e) for e in rows]})

    def post(self, request):
        s = _CreateInput(data=request.data)
        s.is_valid(raise_exception=True)
        from apps.practice.services.fluency import compute_fluency
        from apps.practice.services.vocab import extract_lemmas

        transcript = s.validated_data["transcript"]
        duration = int(s.validated_data["duration_seconds"])
        prompt = s.validated_data.get("prompt") or _today_prompt()

        # Fluency metrics — wrap as a turn list so we reuse compute_fluency.
        try:
            metrics = compute_fluency(
                [{"speaker": "user", "text": transcript}],
                duration,
            )
        except Exception:
            metrics = None

        # One-line lexical observation: did this entry introduce a new B2+ word?
        lexical_note = ""
        try:
            lemmas = extract_lemmas(transcript)
            existing = set(
                VocabularyObservation.objects.filter(
                    user=request.user,
                ).values_list("lemma", flat=True)
            )
            new_advanced = [
                item["lemma"] for item in lemmas
                if item.get("cefr_level") in ("B2", "C1", "C2")
                and item.get("lemma") not in existing
            ][:3]
            if new_advanced:
                lexical_note = (
                    f"You used {len(new_advanced)} new advanced word"
                    f"{'' if len(new_advanced) == 1 else 's'}: "
                    f"{', '.join(new_advanced)}."
                )
        except Exception:
            pass

        entry = VoiceJournalEntry.objects.create(
            user=request.user, institute=request.user.institute,
            prompt=prompt, transcript=transcript,
            duration_seconds=duration,
            fluency_metrics=metrics,
            lexical_note=lexical_note,
        )

        # Vocab ingestion — same as speaking session, so the journal feeds
        # into the existing tracker.
        try:
            for item in lemmas:  # noqa: F821 — defined in the lexical block above
                obs, created = VocabularyObservation.objects.get_or_create(
                    user=request.user, lemma=item["lemma"],
                    defaults={
                        "institute": request.user.institute,
                        "cefr_level": item["cefr_level"],
                        "is_awl": item["is_awl"],
                        "last_session_type": "speaking",
                        "last_session_id": entry.id,
                    },
                )
                if not created:
                    obs.frequency += 1
                    obs.last_session_type = "speaking"
                    obs.last_session_id = entry.id
                    obs.save(update_fields=["frequency", "last_session_type", "last_session_id", "last_seen_at"])
        except Exception:
            pass

        return Response(_serialize(entry), status=201)
