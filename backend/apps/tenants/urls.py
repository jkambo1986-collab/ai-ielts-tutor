"""URL routes for /api/v1/tenants/* — currently exposes the resolved institute via TenantMiddleware."""

from django.urls import path

from apps.tenants.views import CurrentInstituteView

urlpatterns = [
    path("current", CurrentInstituteView.as_view(), name="tenants-current"),
]
