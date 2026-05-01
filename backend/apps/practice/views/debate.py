"""
Group debate room endpoints (T2#10).

A waiting-room style matching service: students POST to /debate/queue,
the server pairs them up by target_band into rooms of 2 or 3, and the
client polls /debate/queue/<id>/status until matched. Once matched, the
participants get the room id and use the existing Gemini Live infra for
real-time audio (this layer just owns the matching + transcript + post-
session band).

Real-time WebRTC routing isn't implemented here — the room model holds
the shared state and the live audio piggybacks on existing speaking
infrastructure. The matching algorithm is intentionally simple: same
institute + ±0.5 target band + first-come queue.
"""

from __future__ import annotations

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.practice.models import DebateParticipant, DebateRoom


def _serialize_room(r: DebateRoom) -> dict:
    return {
        "id": str(r.id),
        "topic": r.topic,
        "status": r.status,
        "target_band": float(r.target_band),
        "participants": [
            {
                "id": str(p.id),
                "user_id": str(p.user_id),
                "joined_at": p.joined_at.isoformat(),
                "band_score": float(p.band_score) if p.band_score is not None else None,
            }
            for p in r.participants.all()
        ],
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "ended_at": r.ended_at.isoformat() if r.ended_at else None,
        "created_at": r.created_at.isoformat(),
    }


# Pool of debate topics — Part-3 style, abstract, debatable. Real product would
# pull these from the institute's curated `Prompt` library.
_TOPICS = [
    "Should governments fund the arts more than professional sports?",
    "Is remote work better for employees or for employers?",
    "Should social media platforms be regulated like newspapers?",
    "Are city governments responsible for solving housing affordability?",
    "Does standardised testing measure intelligence?",
]


class _QueueInput(serializers.Serializer):
    target_band = serializers.FloatField(min_value=4.0, max_value=9.0)


class DebateQueueView(APIView):
    """POST /debate/queue — join the matching queue. If a compatible room
    is waiting, you're added to it. Otherwise a new room is created in
    `waiting` status and you're its first participant.

    Compatibility rule: same institute, room target_band within ±0.5 of
    the request, and room has fewer than 3 participants.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List currently-waiting rooms for the user's institute. Used by the
        Debate Rooms tab to give the user a sense of what's open before they
        opt into the queue."""
        rooms = (
            DebateRoom.objects
            .filter(institute=request.user.institute, status=DebateRoom.STATUS_WAITING)
            .order_by("created_at")[:20]
        )
        results = []
        for r in rooms:
            results.append({
                "id": str(r.id),
                "topic": r.topic,
                "status": r.status,
                "participants_count": r.participants.count(),
                "created_at": r.created_at.isoformat(),
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "completed_at": r.ended_at.isoformat() if r.ended_at else None,
            })
        return Response({"results": results})

    def post(self, request):
        s = _QueueInput(data=request.data)
        s.is_valid(raise_exception=True)
        target = float(s.validated_data["target_band"])
        # Look for a waiting room with seats and a compatible target band.
        # Manual loop because Django's annotate-count over a subquery + filter
        # for "< 3 participants" is messy; the candidate set is tiny in practice.
        room = None
        for r in DebateRoom.objects.filter(
            institute=request.user.institute,
            status=DebateRoom.STATUS_WAITING,
            target_band__gte=target - 0.5,
            target_band__lte=target + 0.5,
        ).order_by("created_at"):
            count = r.participants.count()
            if count >= 3:
                continue
            if r.participants.filter(user=request.user).exists():
                room = r
                break
            room = r
            break
        created = False
        if room is None:
            from random import choice
            room = DebateRoom.objects.create(
                institute=request.user.institute,
                topic=choice(_TOPICS),
                status=DebateRoom.STATUS_WAITING,
                target_band=target,
            )
            created = True
        if not room.participants.filter(user=request.user).exists():
            DebateParticipant.objects.create(room=room, user=request.user)

        # Promote to LIVE when 2 participants are seated (we don't strictly
        # need 3; pairs work too).
        if room.participants.count() >= 2 and room.status == DebateRoom.STATUS_WAITING:
            room.status = DebateRoom.STATUS_LIVE
            room.started_at = timezone.now()
            room.save(update_fields=["status", "started_at"])

        room.refresh_from_db()
        return Response(_serialize_room(room), status=201 if created else 200)


class DebateRoomView(APIView):
    """GET /debate/rooms/<id> — current room state."""

    permission_classes = [IsAuthenticated]

    def get(self, request, room_id):
        r = get_object_or_404(
            DebateRoom, id=room_id, institute=request.user.institute,
        )
        return Response(_serialize_room(r))


class _LeaveInput(serializers.Serializer):
    band_score = serializers.FloatField(required=False, min_value=1.0, max_value=9.0, allow_null=True)


class DebateLeaveView(APIView):
    """POST /debate/rooms/<id>/leave — participant leaves. When the last
    participant leaves the room is marked completed."""

    permission_classes = [IsAuthenticated]

    def post(self, request, room_id):
        r = get_object_or_404(
            DebateRoom, id=room_id, institute=request.user.institute,
        )
        seat = r.participants.filter(user=request.user).first()
        if not seat:
            return Response({"detail": "Not in this room."}, status=403)
        s = _LeaveInput(data=request.data)
        s.is_valid(raise_exception=True)
        seat.left_at = timezone.now()
        if s.validated_data.get("band_score") is not None:
            seat.band_score = s.validated_data["band_score"]
        seat.save()
        # Close the room if everyone has left.
        if not r.participants.filter(left_at__isnull=True).exists():
            r.status = DebateRoom.STATUS_COMPLETED
            r.ended_at = timezone.now()
            r.save(update_fields=["status", "ended_at"])
        return Response(_serialize_room(r))
