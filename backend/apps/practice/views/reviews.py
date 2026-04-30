"""
Human review queue endpoints (T2#7).

Three roles touch this surface:
  - Student: POST /reviews to queue, GET /reviews to see status.
  - Marker (instructor on the institute): GET /reviews/queue, POST claim,
    POST complete.
  - Institute admin: GET /reviews/queue (institute-wide).

Payment integration is intentionally stubbed — the model has paid_at +
payment_intent_id columns reserved for the Stripe Connect cutover, which
needs business decisions (revenue split, KYC, tax) before code can ship.
The /pay-stub endpoint marks paid=True without actually charging so the
end-to-end flow can be exercised in dev.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.practice.models import ReviewRequest


def _is_marker(user) -> bool:
    """Approved markers are institute admins or instructors of the same institute."""
    return user.role in (User.ROLE_INSTITUTE_ADMIN, User.ROLE_INSTRUCTOR, User.ROLE_SUPER_ADMIN)


class _CreateInput(serializers.Serializer):
    session_type = serializers.ChoiceField(choices=["writing", "speaking"])
    session_id = serializers.UUIDField()
    student_notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    sla_hours = serializers.IntegerField(required=False, min_value=12, max_value=168, default=48)


def _serialize(r: ReviewRequest) -> dict:
    return {
        "id": str(r.id),
        "session_type": r.session_type,
        "session_id": str(r.session_id),
        "status": r.status,
        "sla_due_at": r.sla_due_at.isoformat(),
        "student_notes": r.student_notes,
        "marker_id": str(r.marker_id) if r.marker_id else None,
        "claimed_at": r.claimed_at.isoformat() if r.claimed_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        "marker_band_score": float(r.marker_band_score) if r.marker_band_score is not None else None,
        "marker_notes": r.marker_notes,
        "paid_at": r.paid_at.isoformat() if r.paid_at else None,
        "created_at": r.created_at.isoformat(),
    }


class StudentReviewsView(APIView):
    """GET /reviews — student's queue. POST /reviews — create a new request."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = list(
            ReviewRequest.objects.filter(
                user=request.user, institute=request.user.institute,
            ).order_by("-created_at")[:50]
        )
        return Response({"reviews": [_serialize(r) for r in rows]})

    def post(self, request):
        s = _CreateInput(data=request.data)
        s.is_valid(raise_exception=True)
        sla_hours = int(s.validated_data.get("sla_hours") or 48)
        r = ReviewRequest.objects.create(
            user=request.user, institute=request.user.institute,
            session_type=s.validated_data["session_type"],
            session_id=s.validated_data["session_id"],
            student_notes=s.validated_data.get("student_notes", ""),
            sla_due_at=timezone.now() + timedelta(hours=sla_hours),
        )
        return Response(_serialize(r), status=201)


class ReviewQueueView(APIView):
    """GET /reviews/queue — institute marker pool. Returns queued reviews
    awaiting a marker. Requires instructor / admin role."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_marker(request.user):
            return Response({"detail": "Markers only."}, status=403)
        rows = list(
            ReviewRequest.objects.filter(
                institute=request.user.institute,
                status=ReviewRequest.STATUS_QUEUED,
            ).order_by("sla_due_at")[:100]
        )
        return Response({"queue": [_serialize(r) for r in rows]})


class ReviewClaimView(APIView):
    """POST /reviews/<id>/claim — marker claims an unassigned review."""

    permission_classes = [IsAuthenticated]

    def post(self, request, review_id):
        if not _is_marker(request.user):
            return Response({"detail": "Markers only."}, status=403)
        r = get_object_or_404(
            ReviewRequest, id=review_id, institute=request.user.institute,
        )
        if r.status != ReviewRequest.STATUS_QUEUED:
            return Response({"detail": "Already claimed or finished."}, status=409)
        r.status = ReviewRequest.STATUS_CLAIMED
        r.marker = request.user
        r.claimed_at = timezone.now()
        r.save(update_fields=["status", "marker", "claimed_at"])
        return Response(_serialize(r))


class _CompleteInput(serializers.Serializer):
    # min/max passed as Decimal to silence DRF's UserWarning about float bounds
    # on a DecimalField — see rest_framework/fields.py:990,992.
    band_score = serializers.DecimalField(
        max_digits=3, decimal_places=1,
        min_value=Decimal("1.0"), max_value=Decimal("9.0"),
    )
    notes = serializers.CharField(allow_blank=True, max_length=8000, default="")


class ReviewCompleteView(APIView):
    """POST /reviews/<id>/complete — marker submits the review."""

    permission_classes = [IsAuthenticated]

    def post(self, request, review_id):
        if not _is_marker(request.user):
            return Response({"detail": "Markers only."}, status=403)
        r = get_object_or_404(
            ReviewRequest, id=review_id, institute=request.user.institute,
        )
        if r.marker_id != request.user.id and request.user.role != User.ROLE_INSTITUTE_ADMIN:
            return Response({"detail": "Not your claim."}, status=403)
        if r.status not in (ReviewRequest.STATUS_QUEUED, ReviewRequest.STATUS_CLAIMED):
            return Response({"detail": "Already finished."}, status=409)
        s = _CompleteInput(data=request.data)
        s.is_valid(raise_exception=True)
        r.status = ReviewRequest.STATUS_COMPLETED
        r.marker_band_score = s.validated_data["band_score"]
        r.marker_notes = s.validated_data.get("notes", "")
        r.completed_at = timezone.now()
        r.save(update_fields=["status", "marker_band_score", "marker_notes", "completed_at"])
        return Response(_serialize(r))


class ReviewPayStubView(APIView):
    """POST /reviews/<id>/pay-stub — marks the request as paid WITHOUT
    actually charging. Reserved hook for the Stripe Connect cutover.

    This is gated to the student who owns the review (they're the payer).
    Real payment + revenue split needs a separate engineering pass once
    the business decisions on rate / tax / KYC are in.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, review_id):
        r = get_object_or_404(
            ReviewRequest, id=review_id, user=request.user,
        )
        if r.paid_at:
            return Response(_serialize(r))
        r.paid_at = timezone.now()
        r.payment_intent_id = "stub_" + str(r.id)[:12]
        r.save(update_fields=["paid_at", "payment_intent_id"])
        return Response(_serialize(r))
