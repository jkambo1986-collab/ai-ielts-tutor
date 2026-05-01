"""
TenantMiddleware — resolves the current institute from request and attaches it.

Resolution order:
  1. X-Institute-Slug header (always supported, used in dev and for testing)
  2. Subdomain (when settings.TENANT_RESOLVE_FROM_SUBDOMAIN is True)

If a slug is provided but doesn't match an active institute, returns 404.
If no slug is provided, falls back to TENANT_DEFAULT_SLUG.

Healthz, admin, and OpenAPI schema paths are exempt — they don't carry tenancy.
"""

from django.conf import settings
from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin

EXEMPT_PATH_PREFIXES = (
    "/admin",
    "/api/healthz", "/api/v1/healthz",
    "/api/readyz", "/api/v1/readyz",
    "/api/version", "/api/v1/version",  # diagnostic — no tenant context needed
    "/api/schema", "/api/v1/schema",
    "/api/share", "/api/v1/share",  # public share — token is the auth
    "/api/predict", "/api/v1/predict",  # public score-predictor lead-gen tool
    "/api/public", "/api/v1/public",  # public read-only routes (guardian, profile)
    "/static",
)


class TenantMiddleware(MiddlewareMixin):
    def process_request(self, request):
        if any(request.path.startswith(p) for p in EXEMPT_PATH_PREFIXES):
            request.institute = None
            return None

        # Lazy import — avoids AppRegistryNotReady at import time
        from apps.tenants.models import Institute

        slug = request.headers.get(settings.TENANT_HEADER)

        if not slug and settings.TENANT_RESOLVE_FROM_SUBDOMAIN:
            host = request.get_host().split(":")[0]
            parts = host.split(".")
            # acme.aiielts.app -> "acme"; localhost or aiielts.app -> none
            if len(parts) >= 3:
                slug = parts[0]

        if not slug:
            slug = settings.TENANT_DEFAULT_SLUG

        try:
            institute = Institute.objects.get(slug=slug, is_active=True)
        except Institute.DoesNotExist:
            return JsonResponse(
                {"detail": f"Institute '{slug}' not found or inactive."},
                status=404,
            )

        request.institute = institute
        return None
