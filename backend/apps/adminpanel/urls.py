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

urlpatterns = [
    path("sitemap", SitemapView.as_view(), name="admin-sitemap"),
    path("users", UsersListView.as_view(), name="admin-users"),
    path("usage-stats", UsageStatsView.as_view(), name="admin-usage-stats"),
    path("audit-log", AuditLogView.as_view(), name="admin-audit-log"),
    path("invites", InvitesListCreateView.as_view(), name="admin-invites"),
    path("invites/bulk", BulkInviteView.as_view(), name="admin-invites-bulk"),
    path("invites/<uuid:invite_id>", InviteRevokeView.as_view(), name="admin-invite-revoke"),
]
