"""URL routes for /api/v1/billing/* — current subscription, grant Pro (admin-only), bulk-grant, revoke."""

from django.urls import path

from apps.billing.views import (
    BulkGrantProView,
    CurrentSubscriptionView,
    FeaturesView,
    GrantProView,
    RevokeProView,
)

urlpatterns = [
    path("features", FeaturesView.as_view(), name="billing-features"),
    path("current", CurrentSubscriptionView.as_view(), name="billing-current"),
    # Institute-admin-only — students cannot self-upgrade
    path("grant-pro", GrantProView.as_view(), name="billing-grant-pro"),
    path("bulk-grant-pro", BulkGrantProView.as_view(), name="billing-bulk-grant-pro"),
    path("revoke-pro", RevokeProView.as_view(), name="billing-revoke-pro"),
]
