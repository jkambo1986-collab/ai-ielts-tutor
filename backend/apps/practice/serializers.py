"""
DRF serializers for the practice domain.

Two patterns:
  - `_BaseSessionSerializer` enforces that `institute` and `user` are set
    server-side in `perform_create`, never accepted from the client.
  - List endpoints get a slimmer serializer (omits transcripts/essays) so
    history pages don't ship hundreds of KB to the browser.

Plus serializers for the dashboard / learner-state stores: vocabulary,
error cards, mock tests, calibration, share links, alerts.
"""

from rest_framework import serializers

from apps.practice.models import (
    CalibrationEntry,
    DashboardAlert,
    ErrorCard,
    ListeningSession,
    MockTest,
    ReadingSession,
    ShareLink,
    SpeakingSession,
    StudyPlan,
    VocabularyObservation,
    WeaknessAnalysisCache,
    WritingSession,
)


class _BaseSessionSerializer(serializers.ModelSerializer):
    """Common defaults — institute and user are set in perform_create, never accepted from input."""

    class Meta:
        abstract = True
        read_only_fields = ("id", "institute", "user", "created_at")


class WritingSessionSerializer(_BaseSessionSerializer):
    class Meta(_BaseSessionSerializer.Meta):
        model = WritingSession
        fields = (
            "id", "institute", "user",
            "prompt", "essay", "band_score", "feedback",
            "task_type", "duration_seconds", "quality_score",
            "predicted_band", "parent_session",
            "created_at",
        )


class WritingSessionListSerializer(serializers.ModelSerializer):
    """Lightweight version for list endpoints — omits the full essay text."""

    class Meta:
        model = WritingSession
        fields = ("id", "band_score", "feedback", "created_at")


class SpeakingSessionSerializer(_BaseSessionSerializer):
    class Meta(_BaseSessionSerializer.Meta):
        model = SpeakingSession
        fields = (
            "id", "institute", "user",
            "duration_seconds", "topic", "mode", "prompt", "transcript", "analysis",
            "part", "fluency_metrics", "quality_score",
            "predicted_band", "parent_session",
            "created_at",
        )


class SpeakingSessionListSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpeakingSession
        fields = ("id", "duration_seconds", "topic", "mode", "analysis", "created_at")


class ReadingSessionSerializer(_BaseSessionSerializer):
    class Meta(_BaseSessionSerializer.Meta):
        model = ReadingSession
        fields = (
            "id", "institute", "user",
            "score", "total_questions", "passage_title", "passage_content",
            "band_score", "duration_seconds", "quality_score",
            "predicted_band", "parent_session",
            "created_at",
        )


class ListeningSessionSerializer(_BaseSessionSerializer):
    class Meta(_BaseSessionSerializer.Meta):
        model = ListeningSession
        fields = (
            "id", "institute", "user",
            "score", "total_questions", "title", "transcript",
            "band_score", "duration_seconds", "quality_score",
            "predicted_band", "parent_session",
            "created_at",
        )


class WeaknessAnalysisCacheSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeaknessAnalysisCache
        fields = ("id", "skill", "analysis", "expires_at", "created_at")


class StudyPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudyPlan
        fields = ("id", "plan", "is_active", "created_at")


# -- Dashboard / learner-state serializers -- #


class VocabularyObservationSerializer(serializers.ModelSerializer):
    class Meta:
        model = VocabularyObservation
        fields = (
            "id", "lemma", "cefr_level", "is_awl",
            "frequency", "first_seen_at", "last_seen_at",
            "last_session_type", "last_session_id",
        )


class ErrorCardSerializer(serializers.ModelSerializer):
    class Meta:
        model = ErrorCard
        fields = (
            "id", "category", "error_text", "correction_text", "explanation",
            "source_session_type", "source_session_id",
            "interval_days", "ease", "repetitions", "due_at",
            "last_reviewed_at", "review_count", "correct_count",
            "archived_at", "created_at",
        )
        read_only_fields = (
            "id", "interval_days", "ease", "repetitions",
            "last_reviewed_at", "review_count", "correct_count", "created_at",
        )


class MockTestSerializer(serializers.ModelSerializer):
    class Meta:
        model = MockTest
        fields = (
            "id", "started_at", "completed_at", "duration_seconds",
            "overall_band", "readiness_score", "sub_results",
            "writing_session", "speaking_session", "reading_session", "listening_session",
        )


class CalibrationEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = CalibrationEntry
        fields = (
            "id", "session_type", "session_id",
            "predicted_band", "actual_band", "delta", "created_at",
        )
        read_only_fields = ("id", "delta", "created_at")


class ShareLinkSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = ShareLink
        fields = (
            "id", "token", "url", "scope", "target_id",
            "period_days", "expires_at", "revoked_at",
            "created_at", "view_count",
        )
        read_only_fields = ("id", "token", "url", "created_at", "view_count")

    def get_url(self, obj):
        request = self.context.get("request")
        path = f"/api/v1/share/{obj.token}"
        return request.build_absolute_uri(path) if request else path


class DashboardAlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = DashboardAlert
        fields = (
            "id", "alert_type", "severity", "title", "body",
            "payload", "cta_label", "cta_target",
            "dismissed_at", "created_at",
        )
