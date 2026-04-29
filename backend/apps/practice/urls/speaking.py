"""URL routes for /api/v1/speaking/* — Live session start/end, transcript analysis, contextual prompts, pronunciation, cue cards, mock checkpoint/reconnect, examiner notes, instructor review, exports, shadow analyze, whisper hint, band-7 rephrase."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.practice.views.sessions import SpeakingSessionViewSet
from apps.practice.views.speaking_ai import (
    AnalyzeTranscriptView,
    ContextualSpeakingPromptsView,
    EndSessionView,
    PronunciationPracticeView,
    StartSessionView,
)
from apps.practice.views.speaking_extra import (
    Band7RephraseView,
    CueCardListView,
    ExaminerNotesView,
    ExportTranscriptView,
    InstructorReviewView,
    LiveModelConfigView,
    RandomCueCardView,
    RepeatQuestionView,
    SessionAnnotationView,
    ShadowAnalyzeView,
    SpeakingCheckpointView,
    SpeakingReconnectView,
    WhisperHintView,
)

router = DefaultRouter()
router.register(r"sessions", SpeakingSessionViewSet, basename="speaking-session")

urlpatterns = [
    path("start-session", StartSessionView.as_view(), name="speaking-start"),
    path("end-session", EndSessionView.as_view(), name="speaking-end"),
    path("analyze-transcript", AnalyzeTranscriptView.as_view(), name="speaking-analyze"),
    path("contextual-prompts", ContextualSpeakingPromptsView.as_view(), name="speaking-contextual-prompts"),
    path("pronunciation-practice", PronunciationPracticeView.as_view(), name="speaking-pronunciation"),

    # Phase 1-5 endpoints
    path("live-config", LiveModelConfigView.as_view(), name="speaking-live-config"),
    path("cue-cards", CueCardListView.as_view(), name="speaking-cue-cards"),
    path("cue-cards/random", RandomCueCardView.as_view(), name="speaking-cue-cards-random"),
    path("shadow-analyze", ShadowAnalyzeView.as_view(), name="speaking-shadow-analyze"),
    path("band7-rephrase", Band7RephraseView.as_view(), name="speaking-band7-rephrase"),

    # Per-session ops
    path("sessions/<uuid:session_id>/checkpoint",
         SpeakingCheckpointView.as_view(), name="speaking-checkpoint"),
    path("sessions/<uuid:session_id>/reconnect",
         SpeakingReconnectView.as_view(), name="speaking-reconnect"),
    path("sessions/<uuid:session_id>/repeat-question",
         RepeatQuestionView.as_view(), name="speaking-repeat-question"),
    path("sessions/<uuid:session_id>/notes",
         ExaminerNotesView.as_view(), name="speaking-notes"),
    path("sessions/<uuid:session_id>/whisper-hint",
         WhisperHintView.as_view(), name="speaking-whisper-hint"),
    path("sessions/<uuid:session_id>/annotations",
         SessionAnnotationView.as_view(), name="speaking-annotation"),
    path("sessions/<uuid:session_id>/export",
         ExportTranscriptView.as_view(), name="speaking-export"),

    # Instructor review (cross-user within institute)
    path("instructor/sessions/<uuid:session_id>",
         InstructorReviewView.as_view(), name="speaking-instructor-review"),
] + router.urls
