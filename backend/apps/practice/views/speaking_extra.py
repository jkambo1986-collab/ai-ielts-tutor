"""
Phase 1-5 Speaking endpoints (consolidated):

  - LiveModelConfigView (A3)            GET  /speaking/live-config
  - SpeakingCheckpointView (A4)         POST /speaking/sessions/<id>/checkpoint
  - SpeakingReconnectView (A7)          POST /speaking/sessions/<id>/reconnect
  - CueCardListView (B7)                GET  /speaking/cue-cards
  - RandomCueCardView (B7)              GET  /speaking/cue-cards/random
  - RepeatQuestionView (B6)             POST /speaking/sessions/<id>/repeat-question
  - ExaminerNotesView (B9)              POST /speaking/sessions/<id>/notes
  - InstructorReviewView (C5)           GET  /speaking/instructor/sessions/<id>
  - SessionAnnotationView (C5)          POST /speaking/sessions/<id>/annotations
  - ExportTranscriptView (C6)           GET  /speaking/sessions/<id>/export?fmt=pdf|docx|txt
  - ShadowAnalyzeView (D2)              POST /speaking/shadow-analyze
  - WhisperHintView (D5)                POST /speaking/sessions/<id>/whisper-hint
  - Band7RephraseView (E3)              POST /speaking/band7-rephrase
"""

from __future__ import annotations

import io
import json
import random
from datetime import datetime

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.ai import service as ai_service
from apps.ai.context import build_for_user
from apps.practice.models import (
    CueCard, SessionAnnotation, SpeakingSession,
)
from apps.practice.serializers import SpeakingSessionSerializer


# ----- A3: model config ----- #

class LiveModelConfigView(APIView):
    """Frontend asks here for the live-audio model + voice mappings.
    Centralising avoids hardcoded model strings in the FE."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        primary = getattr(settings, "GEMINI_LIVE_MODEL", "gemini-2.5-flash-native-audio-preview-09-2025")
        fallback = getattr(settings, "GEMINI_LIVE_FALLBACK_MODELS", [primary])
        if primary not in fallback:
            fallback = [primary, *[m for m in fallback if m != primary]]
        # B5: voice → accent map. Frontend passes voice into Gemini live config.
        return Response({
            "primary_model": primary,
            "fallback_models": fallback,
            "voices": {
                "uk": "Charon",       # neutral British-style names per Gemini voice catalog
                "us": "Aoede",
                "au": "Fenrir",
                "nz": "Kore",
                "ca": "Puck",
            },
        })


# ----- A4 / A7: checkpoint + reconnect ----- #

def _user_session(request, session_id):
    return get_object_or_404(
        SpeakingSession,
        id=session_id, user=request.user, institute=request.user.institute,
        deleted_at__isnull=True,
    )


class _CheckpointInput(serializers.Serializer):
    transcript = serializers.ListField(child=serializers.DictField(), allow_empty=True)
    duration_seconds = serializers.IntegerField(min_value=0)
    mock_state = serializers.JSONField(required=False, allow_null=True)


class SpeakingCheckpointView(APIView):
    """A4 transcript autosave. Idempotent — last write wins."""

    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        session = _user_session(request, session_id)
        s = _CheckpointInput(data=request.data)
        s.is_valid(raise_exception=True)
        session.transcript = s.validated_data["transcript"]
        session.duration_seconds = s.validated_data["duration_seconds"]
        if s.validated_data.get("mock_state") is not None:
            session.mock_state = s.validated_data["mock_state"]
        session.save(update_fields=["transcript", "duration_seconds", "mock_state"])
        return Response({"ok": True})


class SpeakingReconnectView(APIView):
    """A7 reconnect — mints fresh live credentials for the *same* session row,
    so the user resumes without losing transcript / mock state."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_generate"

    def post(self, request, session_id):
        session = _user_session(request, session_id)
        live_credentials = ai_service.mint_live_session_token(str(request.user.id))
        return Response({
            "session_id": str(session.id),
            "live": live_credentials,
            "transcript": session.transcript or [],
            "mock_state": session.mock_state,
            "duration_seconds": session.duration_seconds,
        })


# ----- B7: cue cards ----- #

class CueCardListView(APIView):
    """GET /speaking/cue-cards — global cards + own institute's, filterable."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Q
        qs = CueCard.objects.filter(is_active=True).filter(
            Q(institute__isnull=True) | Q(institute=request.user.institute)
        ).order_by("category", "topic")
        category = request.query_params.get("category")
        difficulty = request.query_params.get("difficulty")
        if category:
            qs = qs.filter(category=category)
        if difficulty:
            qs = qs.filter(difficulty=difficulty)
        cards = [
            {
                "id": str(c.id),
                "topic": c.topic, "bullets": c.bullets,
                "category": c.category, "difficulty": c.difficulty,
                "follow_up_questions": c.follow_up_questions,
            }
            for c in qs[:200]
        ]
        return Response({"cards": cards, "count": len(cards)})


class RandomCueCardView(APIView):
    """GET /speaking/cue-cards/random?difficulty=medium — pick one card."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Q
        qs = CueCard.objects.filter(is_active=True).filter(
            Q(institute__isnull=True) | Q(institute=request.user.institute)
        )
        difficulty = request.query_params.get("difficulty")
        if difficulty:
            qs = qs.filter(difficulty=difficulty)
        ids = list(qs.values_list("id", flat=True))
        if not ids:
            return Response({"card": None})
        chosen = random.choice(ids)
        c = qs.get(id=chosen)
        return Response({"card": {
            "id": str(c.id),
            "topic": c.topic, "bullets": c.bullets,
            "category": c.category, "difficulty": c.difficulty,
            "follow_up_questions": c.follow_up_questions,
        }})


# ----- B6: repeat-question instruction ----- #

class _RepeatInput(serializers.Serializer):
    part = serializers.ChoiceField(choices=["part1", "part2", "part3"], required=False)


class RepeatQuestionView(APIView):
    """B6: when the user clicks "Could you repeat that?" the FE calls this so
    the server-side request rate is throttled (one repeat per part), and the
    backend returns a polite phrase the FE can play / inject into the live
    session via text streaming.
    """

    permission_classes = [IsAuthenticated]

    REPEAT_PHRASES = {
        "part1": "Of course — let me ask the question again.",
        "part2": "Certainly. Let me read your cue card once more.",
        "part3": "Sure — I'll repeat the question.",
        "default": "Of course — let me ask that again.",
    }

    def post(self, request, session_id):
        session = _user_session(request, session_id)
        s = _RepeatInput(data=request.data)
        s.is_valid(raise_exception=True)
        part = s.validated_data.get("part") or "default"

        # Track repeats in mock_state so the FE can rate-limit per part.
        state = session.mock_state or {}
        repeats = state.setdefault("repeats", {})
        repeats[part] = repeats.get(part, 0) + 1
        session.mock_state = state
        session.save(update_fields=["mock_state"])

        return Response({
            "phrase": self.REPEAT_PHRASES.get(part, self.REPEAT_PHRASES["default"]),
            "repeats_used_this_part": repeats[part],
        })


# ----- B9: examiner notes ----- #

class _NotesInput(serializers.Serializer):
    note = serializers.CharField(max_length=500)
    timestamp = serializers.CharField(max_length=20, required=False, allow_blank=True)
    category = serializers.CharField(max_length=40, required=False, allow_blank=True)


class ExaminerNotesView(APIView):
    """Append a note onto SpeakingSession.examiner_notes. Notes are produced
    by the AI client (via the live session) but persisted server-side so
    they survive reload / are visible to instructors."""

    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        session = _user_session(request, session_id)
        s = _NotesInput(data=request.data)
        s.is_valid(raise_exception=True)
        notes = list(session.examiner_notes or [])
        notes.append({
            "note": s.validated_data["note"],
            "timestamp": s.validated_data.get("timestamp", ""),
            "category": s.validated_data.get("category", ""),
            "at": timezone.now().isoformat(),
        })
        session.examiner_notes = notes[-100:]  # cap to last 100 to keep payloads small
        session.save(update_fields=["examiner_notes"])
        return Response({"notes": session.examiner_notes})

    def get(self, request, session_id):
        session = _user_session(request, session_id)
        return Response({"notes": session.examiner_notes or []})


# ----- C5: instructor review ----- #

def _is_instructor_for(user, student) -> bool:
    if user.role == User.ROLE_SUPER_ADMIN:
        return True
    if user.institute_id and student.institute_id == user.institute_id:
        return user.role in (User.ROLE_INSTITUTE_ADMIN, User.ROLE_INSTRUCTOR)
    return False


class InstructorReviewView(APIView):
    """GET /speaking/instructor/sessions/<id> — read-only access for
    instructors of the student's institute."""

    permission_classes = [IsAuthenticated]

    def get(self, request, session_id):
        try:
            session = SpeakingSession.objects.select_related("user").get(
                id=session_id, deleted_at__isnull=True,
            )
        except SpeakingSession.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)
        if not _is_instructor_for(request.user, session.user):
            return Response({"detail": "Forbidden."}, status=403)

        annotations = SessionAnnotation.objects.filter(
            session_type="speaking", session_id=session.id,
        ).order_by("-created_at")
        return Response({
            "session": SpeakingSessionSerializer(session).data,
            "student": {
                "id": str(session.user.id),
                "name": session.user.name,
                "email": session.user.email,
            },
            "annotations": [
                {
                    "id": str(a.id),
                    "body": a.body,
                    "instructor_id": str(a.instructor_id) if a.instructor_id else None,
                    "transcript_index": a.transcript_index,
                    "created_at": a.created_at.isoformat(),
                }
                for a in annotations
            ],
        })


class _AnnotationInput(serializers.Serializer):
    body = serializers.CharField(max_length=4000)
    transcript_index = serializers.IntegerField(required=False, allow_null=True)


class SessionAnnotationView(APIView):
    """POST /speaking/sessions/<id>/annotations — instructors leave a note."""

    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        try:
            session = SpeakingSession.objects.select_related("user").get(
                id=session_id, deleted_at__isnull=True,
            )
        except SpeakingSession.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)
        if not _is_instructor_for(request.user, session.user):
            return Response({"detail": "Forbidden."}, status=403)
        s = _AnnotationInput(data=request.data)
        s.is_valid(raise_exception=True)
        annotation = SessionAnnotation.objects.create(
            institute=session.institute,
            student=session.user,
            instructor=request.user,
            session_type="speaking",
            session_id=session.id,
            body=s.validated_data["body"],
            transcript_index=s.validated_data.get("transcript_index"),
        )
        return Response({
            "id": str(annotation.id),
            "body": annotation.body,
            "transcript_index": annotation.transcript_index,
            "created_at": annotation.created_at.isoformat(),
        }, status=201)


# ----- C6: transcript export ----- #

class ExportTranscriptView(APIView):
    """GET /speaking/sessions/<id>/export?fmt=pdf|docx|txt"""

    permission_classes = [IsAuthenticated]

    def get(self, request, session_id):
        session = _user_session(request, session_id)
        fmt = (request.query_params.get("fmt") or "txt").lower()
        if fmt == "txt":
            return self._txt(session)
        if fmt == "pdf":
            return self._pdf(session)
        if fmt == "docx":
            return self._docx(session)
        return Response({"detail": "fmt must be pdf, docx, or txt."}, status=400)

    @staticmethod
    def _format_transcript_lines(session) -> list[str]:
        lines = [
            f"AI IELTS Tutor — Speaking Session",
            f"Date: {session.created_at.strftime('%Y-%m-%d %H:%M %Z')}",
            f"Mode: {session.mode}    Part: {session.part}",
            f"Topic: {session.topic or '(none)'}",
            "",
            "TRANSCRIPT",
            "----------",
        ]
        for turn in session.transcript or []:
            speaker = turn.get("speaker", "?").capitalize()
            ts = turn.get("timestamp", "")
            lines.append(f"[{ts}] {speaker}: {turn.get('text', '')}")
        if session.analysis:
            lines.extend(["", "EXAMINER ANALYSIS", "-----------------",
                          f"Overall band: {session.analysis.get('overallBandScore', '—')}"])
        if session.examiner_notes:
            lines.append("")
            lines.append("EXAMINER NOTES")
            lines.append("--------------")
            for n in session.examiner_notes:
                lines.append(f"- ({n.get('timestamp', '')}) {n.get('note', '')}")
        return lines

    def _txt(self, session):
        body = "\n".join(self._format_transcript_lines(session))
        resp = HttpResponse(body, content_type="text/plain; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="speaking_{session.id}.txt"'
        return resp

    def _pdf(self, session):
        try:
            from reportlab.lib.pagesizes import LETTER
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        except ImportError:
            # Fall back to plain text if reportlab isn't available.
            return self._txt(session)
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=LETTER)
        styles = getSampleStyleSheet()
        flow = []
        for line in self._format_transcript_lines(session):
            if line.strip() == "":
                flow.append(Spacer(1, 8))
            else:
                flow.append(Paragraph(line.replace("&", "&amp;").replace("<", "&lt;"), styles["BodyText"]))
        doc.build(flow)
        resp = HttpResponse(buf.getvalue(), content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="speaking_{session.id}.pdf"'
        return resp

    def _docx(self, session):
        try:
            from docx import Document
        except ImportError:
            return self._txt(session)
        document = Document()
        for line in self._format_transcript_lines(session):
            document.add_paragraph(line)
        buf = io.BytesIO()
        document.save(buf)
        resp = HttpResponse(buf.getvalue(),
                            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        resp["Content-Disposition"] = f'attachment; filename="speaking_{session.id}.docx"'
        return resp


# ----- D2: shadow-mode single-answer analysis ----- #

class _ShadowInput(serializers.Serializer):
    question = serializers.CharField(max_length=2000)
    user_answer = serializers.CharField(min_length=10, max_length=8000)
    target_band = serializers.FloatField(required=False, default=7.0, min_value=1.0, max_value=9.0)


class ShadowAnalyzeView(APIView):
    """POST /speaking/shadow-analyze — analyze a single Q+A pair without
    creating a full SpeakingSession. Returns rubric feedback specific to
    this answer."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_analyze"

    def post(self, request):
        s = _ShadowInput(data=request.data)
        s.is_valid(raise_exception=True)
        l1 = request.user.native_language or None
        analysis = ai_service.shadow_analyze_answer(
            question=s.validated_data["question"],
            answer=s.validated_data["user_answer"],
            target_band=s.validated_data.get("target_band", 7.0),
            native_language=l1,
            ctx=build_for_user(request.user),
        )
        return Response({"analysis": analysis})


# ----- D5: whisper hint ----- #

class _WhisperInput(serializers.Serializer):
    last_question = serializers.CharField(max_length=2000)
    user_so_far = serializers.CharField(max_length=4000, required=False, allow_blank=True)


class WhisperHintView(APIView):
    """POST /speaking/sessions/<id>/whisper-hint — covert text-only nudge
    when the user is stuck. No audio. Used during live sessions."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_generate"

    def post(self, request, session_id):
        session = _user_session(request, session_id)
        s = _WhisperInput(data=request.data)
        s.is_valid(raise_exception=True)
        hint = ai_service.whisper_hint(
            question=s.validated_data["last_question"],
            so_far=s.validated_data.get("user_so_far", ""),
            native_language=request.user.native_language,
            target_band=float(request.user.target_score or 7.0),
            ctx=build_for_user(request.user),
        )
        # Track usage on session.mock_state for transparency.
        state = session.mock_state or {}
        state["whisper_hints_used"] = state.get("whisper_hints_used", 0) + 1
        session.mock_state = state
        session.save(update_fields=["mock_state"])
        return Response({"hint": hint, "uses": state["whisper_hints_used"]})


# ----- E3: band-7 rephrase ----- #

class _RephraseInput(serializers.Serializer):
    user_text = serializers.CharField(min_length=10, max_length=4000)
    question = serializers.CharField(max_length=2000, required=False, allow_blank=True)


class Band7RephraseView(APIView):
    """POST /speaking/band7-rephrase — returns a band-7 rephrasing of the
    user's answer. Optionally returns TTS audio (base64)."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_generate"

    def post(self, request):
        s = _RephraseInput(data=request.data)
        s.is_valid(raise_exception=True)
        result = ai_service.band7_rephrase(
            user_text=s.validated_data["user_text"],
            question=s.validated_data.get("question") or "",
            ctx=build_for_user(request.user),
        )
        return Response(result)
