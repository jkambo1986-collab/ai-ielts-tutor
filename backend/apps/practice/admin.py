"""
Django admin registrations for practice models.

Aim is read-mostly: admins inspect data for support tickets, but don't typically
edit session rows directly (changes flow through API endpoints + audit log).
Most fields are therefore marked readonly. Soft-deleted rows show but are
clearly tagged.
"""

from django.contrib import admin
from django.utils.html import format_html

from apps.practice.models import (
    CalibrationEntry,
    DashboardAlert,
    ErrorCard,
    ListeningSession,
    MockTest,
    QuizQuestion,
    QuizSession,
    ReadingSession,
    ShareLink,
    SpeakingSession,
    StudyPlan,
    VocabularyObservation,
    WeaknessAnalysisCache,
    WritingSession,
)


# -- Helpers -- #

class _SoftDeletedFilter(admin.SimpleListFilter):
    """Re-usable list filter for any model with deleted_at."""

    title = "Status"
    parameter_name = "soft_deleted"

    def lookups(self, request, model_admin):
        return (("active", "Active"), ("deleted", "Soft-deleted"))

    def queryset(self, request, qs):
        if self.value() == "deleted":
            return qs.filter(deleted_at__isnull=False)
        if self.value() == "active":
            return qs.filter(deleted_at__isnull=True)
        return qs


def _flag_deleted(obj):
    if getattr(obj, "deleted_at", None):
        return format_html('<span style="color:#888;">deleted</span>')
    return "active"


_flag_deleted.short_description = "Status"  # type: ignore[attr-defined]


# -- Sessions -- #

@admin.register(WritingSession)
class WritingSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "institute", "task_type", "band_score", "quality_score", "created_at", _flag_deleted)
    list_filter = ("task_type", "institute", _SoftDeletedFilter)
    search_fields = ("user__email", "prompt")
    readonly_fields = ("id", "user", "institute", "prompt", "essay", "feedback",
                       "band_score", "quality_score", "predicted_band", "duration_seconds",
                       "task_type", "parent_session", "created_at", "deleted_at")
    date_hierarchy = "created_at"


@admin.register(SpeakingSession)
class SpeakingSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "institute", "mode", "part", "duration_seconds", "created_at", _flag_deleted)
    list_filter = ("mode", "part", "institute", _SoftDeletedFilter)
    search_fields = ("user__email", "topic")
    readonly_fields = ("id", "user", "institute", "mode", "part", "topic",
                       "duration_seconds", "prompt", "transcript", "analysis",
                       "fluency_metrics", "quality_score", "predicted_band",
                       "parent_session", "created_at", "deleted_at")
    date_hierarchy = "created_at"


@admin.register(ReadingSession)
class ReadingSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "institute", "score", "total_questions", "band_score", "created_at", _flag_deleted)
    list_filter = ("institute", _SoftDeletedFilter)
    search_fields = ("user__email", "passage_title")
    readonly_fields = ("id", "user", "institute", "score", "total_questions",
                       "passage_title", "passage_content", "band_score",
                       "duration_seconds", "quality_score", "predicted_band",
                       "parent_session", "created_at", "deleted_at")
    date_hierarchy = "created_at"


@admin.register(ListeningSession)
class ListeningSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "institute", "score", "total_questions", "band_score", "created_at", _flag_deleted)
    list_filter = ("institute", _SoftDeletedFilter)
    search_fields = ("user__email", "title")
    readonly_fields = ("id", "user", "institute", "score", "total_questions",
                       "title", "transcript", "band_score", "duration_seconds",
                       "quality_score", "predicted_band", "parent_session",
                       "created_at", "deleted_at")
    date_hierarchy = "created_at"


# -- Quiz -- #

@admin.register(QuizQuestion)
class QuizQuestionAdmin(admin.ModelAdmin):
    list_display = ("question_short", "difficulty", "category")
    list_filter = ("difficulty", "category")
    search_fields = ("question_text",)

    def question_short(self, obj):
        return (obj.question_text or "")[:60]


@admin.register(QuizSession)
class QuizSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "institute", "created_at", _flag_deleted)
    list_filter = ("institute", _SoftDeletedFilter)
    search_fields = ("user__email",)
    readonly_fields = ("id", "user", "institute", "created_at", "deleted_at")
    date_hierarchy = "created_at"


# -- Analytics + cache -- #

@admin.register(WeaknessAnalysisCache)
class WeaknessAnalysisCacheAdmin(admin.ModelAdmin):
    list_display = ("user", "skill", "expires_at", "created_at")
    list_filter = ("skill", "institute")
    search_fields = ("user__email",)
    readonly_fields = ("id", "user", "institute", "skill", "analysis", "expires_at", "created_at")


@admin.register(StudyPlan)
class StudyPlanAdmin(admin.ModelAdmin):
    list_display = ("user", "institute", "is_active", "created_at", _flag_deleted)
    list_filter = ("is_active", "institute", _SoftDeletedFilter)
    search_fields = ("user__email",)
    readonly_fields = ("id", "user", "institute", "plan", "is_active", "created_at", "deleted_at")


# -- Learner state -- #

@admin.register(VocabularyObservation)
class VocabularyObservationAdmin(admin.ModelAdmin):
    list_display = ("user", "lemma", "frequency", "cefr_level", "is_awl", "last_seen_at")
    list_filter = ("cefr_level", "is_awl", "institute")
    search_fields = ("user__email", "lemma")
    readonly_fields = ("user", "institute", "lemma", "cefr_level", "is_awl",
                       "frequency", "last_session_type", "last_session_id",
                       "first_seen_at", "last_seen_at")


@admin.register(ErrorCard)
class ErrorCardAdmin(admin.ModelAdmin):
    list_display = ("user", "category", "due_at", "review_count", "ease", "archived_at")
    list_filter = ("category", "institute")
    search_fields = ("user__email", "error_text")
    readonly_fields = ("id", "user", "institute", "source_session_type", "source_session_id",
                       "created_at", "last_reviewed_at")


@admin.register(MockTest)
class MockTestAdmin(admin.ModelAdmin):
    list_display = ("user", "institute", "is_complete", "overall_band", "readiness_score", "started_at")
    list_filter = ("institute",)
    search_fields = ("user__email",)
    readonly_fields = ("id", "user", "institute", "started_at", "completed_at",
                       "duration_seconds", "overall_band", "readiness_score",
                       "sub_results", "writing_session", "speaking_session",
                       "reading_session", "listening_session")

    def is_complete(self, obj):
        return obj.completed_at is not None
    is_complete.boolean = True  # type: ignore[attr-defined]
    is_complete.short_description = "Complete"  # type: ignore[attr-defined]


@admin.register(CalibrationEntry)
class CalibrationEntryAdmin(admin.ModelAdmin):
    list_display = ("user", "session_type", "predicted_band", "actual_band", "delta", "created_at")
    list_filter = ("session_type", "institute")
    search_fields = ("user__email",)
    readonly_fields = ("user", "institute", "session_type", "session_id",
                       "predicted_band", "actual_band", "delta", "created_at")


@admin.register(ShareLink)
class ShareLinkAdmin(admin.ModelAdmin):
    list_display = ("user", "scope", "expires_at", "revoked_at", "view_count", "created_at")
    list_filter = ("scope", "institute")
    search_fields = ("user__email", "token")
    readonly_fields = ("id", "user", "institute", "token", "scope", "target_id",
                       "period_days", "expires_at", "revoked_at", "view_count", "created_at")


@admin.register(DashboardAlert)
class DashboardAlertAdmin(admin.ModelAdmin):
    list_display = ("user", "alert_type", "severity", "title", "dismissed_at", "created_at")
    list_filter = ("alert_type", "severity", "institute")
    search_fields = ("user__email", "title")
    readonly_fields = ("user", "institute", "alert_type", "severity", "title",
                       "body", "payload", "cta_label", "cta_target",
                       "dismissed_at", "created_at")
