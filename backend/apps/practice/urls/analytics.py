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
    AlertsView, AlertDismissView, CalibrationView, ErrorCardsView,
    ErrorCardReviewView, MockTestsView, ShareLinkView, ShareLinkRevokeView,
    StudyPlanLatestView, VocabularyView,
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
