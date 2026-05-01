"""Root URL configuration."""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.accounts.guardians import GuardianPublicView
from apps.health.views import healthz, readyz, version
from apps.practice.views.predict import PredictView
from apps.practice.views.share import PublicShareView
from apps.practice.views.ux import PublicProfileView


api_v1 = [
    path("healthz", healthz),
    path("readyz", readyz),
    path("version", version),
    # Public anonymous score predictor — lead-gen tool, no tenant + no auth.
    # See apps/tenants/middleware.py EXEMPT_PATH_PREFIXES.
    path("predict", PredictView.as_view(), name="public-predict"),
    # Public read-only snapshot served via signed token. No auth required —
    # the token IS the auth. Lives at /api/v1/share/<token>.
    path("share/<str:token>", PublicShareView.as_view(), name="public-share"),
    # Public progress profile (X2) — opt-in via Profile settings.
    path("public/u/<slug:slug>", PublicProfileView.as_view(), name="public-progress-profile"),
    # F2 Guardian / sponsor read-only progress — token IS the auth.
    path("public/guardian/<str:token>", GuardianPublicView.as_view(), name="public-guardian"),
    path("auth/", include("apps.accounts.urls")),
    path("tenants/", include("apps.tenants.urls")),
    path("writing/", include(("apps.practice.urls.writing", "writing"))),
    path("speaking/", include(("apps.practice.urls.speaking", "speaking"))),
    path("reading/", include(("apps.practice.urls.reading", "reading"))),
    path("listening/", include(("apps.practice.urls.listening", "listening"))),
    path("integrated-skills/", include(("apps.practice.urls.integrated", "integrated"))),
    path("quiz/", include(("apps.practice.urls.quiz", "quiz"))),
    path("analytics/", include(("apps.practice.urls.analytics", "analytics"))),
    path("billing/", include("apps.billing.urls")),
    path("content/", include("apps.content.urls")),
    path("admin/", include("apps.adminpanel.urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("schema/swagger/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger"),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
]
