"""
Study-partner endpoints (Hard 5).

  GET    /analytics/partner/opt-in     — read consent + display name
  POST   /analytics/partner/opt-in     — set consent + display name
  GET    /analytics/partner/suggestions — list the user's suggestions
  POST   /analytics/partner/suggestions/<id>/accept — accept the pairing
  POST   /analytics/partner/suggestions/<id>/dismiss — dismiss
  POST   /analytics/partner/match-now  — manually trigger matching for
                                          this user (cooldown applies)
"""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.practice.models import PartnerOptIn, PartnerSuggestion


def _serialize_suggestion(s: PartnerSuggestion) -> dict:
    return {
        "id": str(s.id),
        "partner_display_name": (
            getattr(s.partner.partner_opt_in, "display_name", "")
            if hasattr(s.partner, "partner_opt_in") else ""
        ) or s.partner.name or "Partner",
        "similarity_score": s.similarity_score,
        "target_band_delta": s.target_band_delta,
        "suggested_task": s.suggested_task,
        "accepted_at": s.accepted_at.isoformat() if s.accepted_at else None,
        "dismissed_at": s.dismissed_at.isoformat() if s.dismissed_at else None,
        "created_at": s.created_at.isoformat(),
    }


class _OptInInput(serializers.Serializer):
    is_active = serializers.BooleanField()
    cross_institute_ok = serializers.BooleanField(required=False, default=False)
    display_name = serializers.CharField(required=False, allow_blank=True, max_length=80, default="")


class PartnerOptInView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        opt = PartnerOptIn.objects.filter(user=request.user).first()
        if not opt:
            return Response({"is_active": False, "cross_institute_ok": False, "display_name": ""})
        return Response({
            "is_active": opt.is_active,
            "cross_institute_ok": opt.cross_institute_ok,
            "display_name": opt.display_name,
        })

    def post(self, request):
        s = _OptInInput(data=request.data)
        s.is_valid(raise_exception=True)
        opt, _ = PartnerOptIn.objects.update_or_create(
            user=request.user,
            defaults={
                "institute": request.user.institute,
                "is_active": s.validated_data["is_active"],
                "cross_institute_ok": s.validated_data.get("cross_institute_ok", False),
                "display_name": s.validated_data.get("display_name", "")[:80],
            },
        )
        return Response({
            "is_active": opt.is_active,
            "cross_institute_ok": opt.cross_institute_ok,
            "display_name": opt.display_name,
        })


class PartnerSuggestionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = list(
            PartnerSuggestion.objects.filter(user=request.user)
            .select_related("partner").order_by("-created_at")[:20]
        )
        return Response({"suggestions": [_serialize_suggestion(s) for s in rows]})


class PartnerSuggestionActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, suggestion_id, action):
        s = get_object_or_404(PartnerSuggestion, id=suggestion_id, user=request.user)
        if action == "accept":
            s.accepted_at = timezone.now()
            s.save(update_fields=["accepted_at"])
        elif action == "dismiss":
            s.dismissed_at = timezone.now()
            s.save(update_fields=["dismissed_at"])
        else:
            return Response({"detail": "Unknown action."}, status=400)
        return Response(_serialize_suggestion(s))


class PartnerMatchNowView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.practice.services.partner_matching import evaluate_for_user
        sugg = evaluate_for_user(request.user)
        if not sugg:
            return Response({"detail": "No eligible partner right now. Try again next week."}, status=204)
        return Response(_serialize_suggestion(sugg), status=201)
