"""
Tutor marketplace endpoints (T3#13).

Three surfaces:
  - GET  /tutors                    — public-ish: list active tutors in the
                                       student's institute. Read-only.
  - POST /tutors/upsert             — institute admin / tutor self-onboard
                                       creates or updates their TutorProfile.
  - GET  /tutors/<id>               — single tutor profile.
  - POST /bookings                  — student requests a booking.
  - GET  /bookings                  — student's bookings (or tutor's, role-aware).
  - POST /bookings/<id>/confirm     — tutor confirms.
  - POST /bookings/<id>/cancel      — either party cancels.
  - POST /bookings/<id>/pay-stub    — placeholder for Stripe Connect.

Payment is intentionally stubbed. Real integration needs the revenue-split
and KYC decisions from the business side; the model schema is ready.
"""

from __future__ import annotations

from datetime import timedelta

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.practice.models import TutorBooking, TutorProfile


def _serialize_tutor(t: TutorProfile) -> dict:
    return {
        "id": str(t.id),
        "user_id": str(t.user_id),
        "name": getattr(t.user, "name", "") or t.user.email,
        "bio": t.bio,
        "hourly_rate_cents": t.hourly_rate_cents,
        "currency": t.currency,
        "languages": t.languages,
        "specialities": t.specialities,
        "availability": t.availability,
        "rating_avg": t.rating_avg,
        "rating_count": t.rating_count,
        "is_active": t.is_active,
    }


def _serialize_booking(b: TutorBooking) -> dict:
    return {
        "id": str(b.id),
        "tutor_id": str(b.tutor_id),
        "student_id": str(b.student_id),
        "scheduled_for": b.scheduled_for.isoformat(),
        "duration_minutes": b.duration_minutes,
        "status": b.status,
        "rate_cents": b.rate_cents,
        "currency": b.currency,
        "paid_at": b.paid_at.isoformat() if b.paid_at else None,
        "speaking_session_id": str(b.speaking_session_id) if b.speaking_session_id else None,
        "student_notes": b.student_notes,
        "tutor_notes": b.tutor_notes,
        "created_at": b.created_at.isoformat(),
    }


class TutorListView(APIView):
    """GET /api/v1/speaking/tutors — active tutors in the student's institute."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = list(
            TutorProfile.objects.filter(
                institute=request.user.institute, is_active=True,
            ).select_related("user").order_by("-rating_avg", "-created_at")[:200]
        )
        return Response({"tutors": [_serialize_tutor(t) for t in rows]})


class _TutorUpsertInput(serializers.Serializer):
    bio = serializers.CharField(required=False, allow_blank=True, max_length=4000, default="")
    hourly_rate_cents = serializers.IntegerField(required=False, min_value=0, default=0)
    currency = serializers.CharField(required=False, max_length=3, default="USD")
    languages = serializers.ListField(child=serializers.CharField(max_length=10), required=False, default=list)
    specialities = serializers.ListField(child=serializers.CharField(max_length=40), required=False, default=list)
    availability = serializers.JSONField(required=False, default=dict)
    is_active = serializers.BooleanField(required=False, default=True)


class TutorUpsertView(APIView):
    """POST /api/v1/speaking/tutors/upsert — instructor / institute admin
    creates or updates their own TutorProfile. Students cannot use this."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in (User.ROLE_INSTRUCTOR, User.ROLE_INSTITUTE_ADMIN, User.ROLE_SUPER_ADMIN):
            return Response({"detail": "Instructor or admin only."}, status=403)
        s = _TutorUpsertInput(data=request.data)
        s.is_valid(raise_exception=True)
        profile, _ = TutorProfile.objects.update_or_create(
            user=request.user,
            defaults={
                "institute": request.user.institute,
                **s.validated_data,
            },
        )
        return Response(_serialize_tutor(profile))


class _BookingCreateInput(serializers.Serializer):
    tutor_id = serializers.UUIDField()
    scheduled_for = serializers.DateTimeField()
    duration_minutes = serializers.IntegerField(min_value=15, max_value=180, default=30)
    student_notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")


class BookingsView(APIView):
    """GET — list user's bookings (student or tutor).
    POST — student requests a new booking."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Student bookings + tutor's incoming bookings, deduped.
        qs = TutorBooking.objects.filter(
            institute=request.user.institute,
        ).filter(
            # Either the user is the student, or they're the tutor on the booking.
            student=request.user,
        ) | TutorBooking.objects.filter(
            tutor__user=request.user, institute=request.user.institute,
        )
        rows = list(qs.distinct().order_by("-scheduled_for")[:100])
        return Response({"bookings": [_serialize_booking(b) for b in rows]})

    def post(self, request):
        s = _BookingCreateInput(data=request.data)
        s.is_valid(raise_exception=True)
        tutor = get_object_or_404(
            TutorProfile, id=s.validated_data["tutor_id"],
            institute=request.user.institute, is_active=True,
        )
        # Avoid back-to-back overlap on the same tutor.
        scheduled = s.validated_data["scheduled_for"]
        duration = int(s.validated_data["duration_minutes"])
        end = scheduled + timedelta(minutes=duration)
        overlap = TutorBooking.objects.filter(
            tutor=tutor,
            status__in=[TutorBooking.STATUS_REQUESTED, TutorBooking.STATUS_CONFIRMED, TutorBooking.STATUS_LIVE],
            scheduled_for__lt=end,
        ).filter(
            # crude "ends after the new start" check via duration arithmetic in app
        )
        for b in overlap:
            b_end = b.scheduled_for + timedelta(minutes=b.duration_minutes)
            if b_end > scheduled:
                return Response({"detail": "Tutor unavailable at that time."}, status=409)
        booking = TutorBooking.objects.create(
            institute=request.user.institute,
            student=request.user,
            tutor=tutor,
            scheduled_for=scheduled,
            duration_minutes=duration,
            rate_cents=tutor.hourly_rate_cents,
            currency=tutor.currency,
            student_notes=s.validated_data.get("student_notes", ""),
        )
        return Response(_serialize_booking(booking), status=201)


class BookingActionView(APIView):
    """POST /bookings/<id>/(confirm|cancel|pay-stub)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id, action):
        b = get_object_or_404(
            TutorBooking, id=booking_id, institute=request.user.institute,
        )
        is_tutor = b.tutor.user_id == request.user.id
        is_student = b.student_id == request.user.id
        if not (is_tutor or is_student or request.user.role == User.ROLE_INSTITUTE_ADMIN):
            return Response({"detail": "Not your booking."}, status=403)

        if action == "confirm":
            if not is_tutor:
                return Response({"detail": "Only the tutor can confirm."}, status=403)
            if b.status != TutorBooking.STATUS_REQUESTED:
                return Response({"detail": "Already past requested state."}, status=409)
            b.status = TutorBooking.STATUS_CONFIRMED
            b.save(update_fields=["status"])
        elif action == "cancel":
            if b.status in (TutorBooking.STATUS_COMPLETED, TutorBooking.STATUS_CANCELLED):
                return Response({"detail": "Already terminal."}, status=409)
            b.status = TutorBooking.STATUS_CANCELLED
            b.save(update_fields=["status"])
        elif action == "pay-stub":
            if not is_student:
                return Response({"detail": "Only the student pays."}, status=403)
            if b.paid_at:
                return Response(_serialize_booking(b))
            b.paid_at = timezone.now()
            b.payment_intent_id = "stub_" + str(b.id)[:12]
            b.save(update_fields=["paid_at", "payment_intent_id"])
        else:
            return Response({"detail": "Unknown action."}, status=400)
        return Response(_serialize_booking(b))
