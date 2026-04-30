"""URL routes for /api/v1/admin/* — sitemap, users list, usage stats, audit log, invite management. Restricted to institute admins via the views."""

from django.urls import path

from apps.accounts.invitations import (
    BulkInviteView,
    InviteRevokeView,
    InvitesListCreateView,
)
from apps.adminpanel.views import (
    AuditLogView,
    SitemapView,
    UsageStatsView,
    UsersListView,
)
from apps.practice.views.feedback_votes import FeedbackQualityView
from apps.practice.views.instructor import (
    InstructorDigestView,
    InstructorRosterView,
    InstructorStudentDrilldownView,
)

urlpatterns = [
    path("sitemap", SitemapView.as_view(), name="admin-sitemap"),
    path("users", UsersListView.as_view(), name="admin-users"),
    path("usage-stats", UsageStatsView.as_view(), name="admin-usage-stats"),
    path("audit-log", AuditLogView.as_view(), name="admin-audit-log"),
    path("invites", InvitesListCreateView.as_view(), name="admin-invites"),
    path("invites/bulk", BulkInviteView.as_view(), name="admin-invites-bulk"),
    path("invites/<uuid:invite_id>", InviteRevokeView.as_view(), name="admin-invite-revoke"),

    # Instructor analytics workspace (Hard 1)
    path("instructor/roster", InstructorRosterView.as_view(), name="admin-instructor-roster"),
    path("instructor/students/<uuid:student_id>",
         InstructorStudentDrilldownView.as_view(), name="admin-instructor-student"),
    path("instructor/digest", InstructorDigestView.as_view(), name="admin-instructor-digest"),

    # Prompt-quality dashboard (Hard 3)
    path("feedback-quality", FeedbackQualityView.as_view(), name="admin-feedback-quality"),
]
