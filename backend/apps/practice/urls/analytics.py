"""URL routes for /api/v1/analytics/* — dashboard payload, alerts, vocab, error cards (SRS), mock tests, calibration, share links, cohort, scorecard, reattempt-diff, notifications, drafts, public profile, calendar export, certificate, onboarding completion."""

from django.urls import path

from apps.practice.views.analytics import (
    AnalyticsOverviewView,
    ClearHistoryView,
    ComprehensiveAnalysisView,
    StudyPlanView,
    WeaknessAnalysisView,
)
from apps.practice.views.cohort import CohortBenchmarkView
from apps.practice.views.dashboard import DashboardAnalyticsView
from apps.practice.views.dashboard_state import (
    AlertsView, AlertDismissView, BadgesView, CalibrationView,
    DailyChallengeView, ErrorCardsView, ErrorCardReviewView,
    GuaranteeEligibilityView, MockTestsView,
    ShareLinkView, ShareLinkRevokeView, StreakView, StudyPlanLatestView,
    VocabularyView, WarmupView,
)
from apps.practice.views.feedback_votes import (
    FeedbackQualityView, FeedbackVoteView,
)
from apps.practice.views.partners import (
    PartnerMatchNowView, PartnerOptInView, PartnerSuggestionActionView,
    PartnerSuggestionsView,
)
from apps.practice.views.reviews import (
    ReviewClaimView, ReviewCompleteView, ReviewPayStubView,
    ReviewQueueView, StudentReviewsView,
)
from apps.practice.views.scorecard import ReattemptDiffView, ScorecardView
from apps.practice.views.ux import (
    CalendarIcsView, CertificateView, CompleteOnboardingView,
    NotificationDismissView, NotificationPrefView, NotificationReadView,
    NotificationsView, PublicProfileToggleView, ResumeView,
)

urlpatterns = [
    path("overview", AnalyticsOverviewView.as_view(), name="analytics-overview"),
    path("dashboard", DashboardAnalyticsView.as_view(), name="analytics-dashboard"),
    path("clear-history", ClearHistoryView.as_view(), name="analytics-clear-history"),
    path("weakness-analysis", WeaknessAnalysisView.as_view(), name="analytics-weakness"),
    path("comprehensive-analysis", ComprehensiveAnalysisView.as_view(), name="analytics-comprehensive"),
    path("study-plan", StudyPlanView.as_view(), name="analytics-study-plan"),
    path("study-plan/latest", StudyPlanLatestView.as_view(), name="analytics-study-plan-latest"),

    # Learner state stores
    path("vocabulary", VocabularyView.as_view(), name="analytics-vocabulary"),
    path("error-cards", ErrorCardsView.as_view(), name="analytics-error-cards"),
    path("error-cards/<uuid:card_id>/review", ErrorCardReviewView.as_view(), name="analytics-error-card-review"),
    path("mock-tests", MockTestsView.as_view(), name="analytics-mock-tests"),
    path("calibration", CalibrationView.as_view(), name="analytics-calibration"),
    path("share-links", ShareLinkView.as_view(), name="analytics-share-links"),
    path("share-links/<uuid:link_id>/revoke", ShareLinkRevokeView.as_view(), name="analytics-share-link-revoke"),
    path("streak", StreakView.as_view(), name="analytics-streak"),
    path("warmup", WarmupView.as_view(), name="analytics-warmup"),
    path("daily-challenge", DailyChallengeView.as_view(), name="analytics-daily-challenge"),
    path("badges", BadgesView.as_view(), name="analytics-badges"),
    path("guarantee", GuaranteeEligibilityView.as_view(), name="analytics-guarantee"),

    # AI feedback voting (UI 5) + admin aggregation (Hard 3)
    path("feedback-votes", FeedbackVoteView.as_view(), name="analytics-feedback-votes"),
    path("feedback-quality", FeedbackQualityView.as_view(), name="analytics-feedback-quality"),

    # Study-partner matching (Hard 5) — opt-in, anonymized, weekly suggestion.
    path("partner/opt-in", PartnerOptInView.as_view(), name="analytics-partner-optin"),
    path("partner/suggestions", PartnerSuggestionsView.as_view(), name="analytics-partner-suggestions"),
    path("partner/suggestions/<uuid:suggestion_id>/<str:action>",
         PartnerSuggestionActionView.as_view(), name="analytics-partner-suggestion-action"),
    path("partner/match-now", PartnerMatchNowView.as_view(), name="analytics-partner-match-now"),

    # Human-graded review queue (T2#7) — payment stubbed.
    path("reviews", StudentReviewsView.as_view(), name="analytics-reviews"),
    path("reviews/queue", ReviewQueueView.as_view(), name="analytics-reviews-queue"),
    path("reviews/<uuid:review_id>/claim", ReviewClaimView.as_view(), name="analytics-reviews-claim"),
    path("reviews/<uuid:review_id>/complete", ReviewCompleteView.as_view(), name="analytics-reviews-complete"),
    path("reviews/<uuid:review_id>/pay-stub", ReviewPayStubView.as_view(), name="analytics-reviews-pay-stub"),
    path("alerts", AlertsView.as_view(), name="analytics-alerts"),
    path("alerts/<uuid:alert_id>/dismiss", AlertDismissView.as_view(), name="analytics-alert-dismiss"),

    # Cross-tenant cohort + per-session scorecards (#23, #24, #21)
    path("cohort", CohortBenchmarkView.as_view(), name="analytics-cohort"),
    path("scorecard", ScorecardView.as_view(), name="analytics-scorecard"),
    path("reattempt-diff", ReattemptDiffView.as_view(), name="analytics-reattempt-diff"),

    # UX foundation (Phase 1-4)
    path("resume", ResumeView.as_view(), name="analytics-resume"),
    path("notifications", NotificationsView.as_view(), name="analytics-notifications"),
    path("notifications/<uuid:notif_id>/read",
         NotificationReadView.as_view(), name="analytics-notification-read"),
    path("notifications/<uuid:notif_id>/dismiss",
         NotificationDismissView.as_view(), name="analytics-notification-dismiss"),
    path("notification-prefs", NotificationPrefView.as_view(), name="analytics-notification-prefs"),
    path("calendar.ics", CalendarIcsView.as_view(), name="analytics-calendar-ics"),
    path("certificate", CertificateView.as_view(), name="analytics-certificate"),
    path("public-profile/toggle", PublicProfileToggleView.as_view(), name="analytics-public-profile-toggle"),
    path("complete-onboarding", CompleteOnboardingView.as_view(), name="analytics-complete-onboarding"),
]
