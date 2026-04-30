"""
Public score-predictor endpoint — /api/v1/predict

Anonymous, no auth, no tenant. Lead-gen tool every IELTS competitor has
(Magoosh, Deep IELTS, Upscore, IELTAI). Caps at 2 essays per IP per day
to keep abuse + Gemini cost bounded.

Reuses `evaluate_writing` agent without StudentContext (we have no user)
and trims the response to a band estimate + one coaching line, so
visitors get value but enough is held back to motivate signup.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.ai import service as ai_service

log = logging.getLogger(__name__)

DAILY_LIMIT_PER_IP = 2
RATE_LIMIT_TTL = 24 * 60 * 60  # 24 hours


def _client_ip(request) -> str:
    """Best-effort client IP. Honour X-Forwarded-For when set by Railway."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


def _ip_key(ip: str) -> str:
    """Hash the IP so the cache key doesn't expose raw IPs in logs."""
    return "predict:rl:" + hashlib.sha256(ip.encode()).hexdigest()[:16]


class _PredictInput(serializers.Serializer):
    prompt = serializers.CharField(min_length=10, max_length=2000)
    essay = serializers.CharField(min_length=50, max_length=5000)


class PredictView(APIView):
    """POST /api/v1/predict — anonymous IELTS Writing Task 2 band estimate.

    The response is intentionally compact:
      - estimated_band: number (rounded to 0.5)
      - top_strength: one sentence
      - top_focus: one sentence
      - signup_cta: True when the user has hit their daily limit and the
        next call would 429 — gives the FE a clean place to surface the
        signup prompt.
    """

    permission_classes = [AllowAny]
    authentication_classes = []  # truly anonymous; don't even try JWT

    def post(self, request):
        ip = _client_ip(request)
        key = _ip_key(ip)
        used = cache.get(key, 0)
        if used >= DAILY_LIMIT_PER_IP:
            return Response(
                {
                    "detail": (
                        "Daily limit reached. Sign up for a free account "
                        "to keep practising — full feedback, SRS, and tracking included."
                    ),
                    "signup_cta": True,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        s = _PredictInput(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            feedback = ai_service.evaluate_writing(
                prompt=s.validated_data["prompt"],
                essay=s.validated_data["essay"],
                target_score=None,
                ctx=None,  # no user => no StudentContext
            )
        except Exception:
            log.exception("predict: AI call failed")
            return Response(
                {"detail": "Could not estimate your band right now. Try again in a minute."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Increment counter only on success — failed calls shouldn't burn budget.
        cache.set(key, used + 1, RATE_LIMIT_TTL)

        band = feedback.get("bandScore") if isinstance(feedback, dict) else None
        # Pull the highest-priority criterion text as the focus, the
        # vocabulary suggestion as the strength clue. Tolerate any shape.
        criteria = feedback.get("feedback", {}) if isinstance(feedback, dict) else {}
        top_focus = ""
        for key_name in ("grammaticalRangeAndAccuracy", "lexicalResource", "coherenceAndCohesion", "taskAchievement"):
            crit = criteria.get(key_name) or {}
            text = (crit.get("text") if isinstance(crit, dict) else "") or ""
            if text:
                top_focus = text.split(".")[0].strip()[:240] + "."
                break
        top_strength = ""
        suggestions = feedback.get("suggestions") if isinstance(feedback, dict) else None
        if isinstance(suggestions, list) and suggestions:
            top_strength = str(suggestions[0])[:240]

        signup_cta = used + 1 >= DAILY_LIMIT_PER_IP

        return Response({
            "estimated_band": float(band) if band is not None else None,
            "top_focus": top_focus or "Try expanding your second body paragraph with a concrete example.",
            "top_strength": top_strength or "Stay consistent on your task response — that's the highest-leverage criterion.",
            "uses_remaining_today": max(0, DAILY_LIMIT_PER_IP - (used + 1)),
            "signup_cta": signup_cta,
        })
