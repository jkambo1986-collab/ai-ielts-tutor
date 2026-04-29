"""
Plan-aware DRF throttles.

Free users get a tighter quota on AI-heavy endpoints; Pro users get the higher
ceiling. Throttle backend is Django's default cache (locmem in dev — set
CACHES backend to redis for prod).

Endpoints opt in via:
    throttle_classes = [PlanAwareGenerateThrottle]
    # OR
    throttle_classes = [PlanAwareAnalyzeThrottle]

Single-process locmem buckets are good enough until per-instance scale becomes
an issue. When that happens, swap CACHES to django-redis with no other code
changes.
"""

from rest_framework.throttling import UserRateThrottle


class _PlanAwareThrottle(UserRateThrottle):
    """Picks a rate based on the requesting user's plan.

    Subclasses define `RATES = {"free": "30/hour", "pro": "300/hour"}`.
    """

    RATES: dict[str, str] = {}

    def get_rate(self):  # type: ignore[override]
        user = getattr(self, "_request_user", None)
        plan = "pro" if user and getattr(user, "is_pro", False) else "free"
        return self.RATES.get(plan, self.RATES["free"])

    def allow_request(self, request, view):
        # Stash user so get_rate (called inside allow_request) can read it
        self._request_user = getattr(request, "user", None)
        return super().allow_request(request, view)


class PlanAwareGenerateThrottle(_PlanAwareThrottle):
    """For content-generation endpoints (quiz/test/essay-plan/etc)."""

    scope = "ai_generate_plan"
    RATES = {"free": "60/hour", "pro": "300/hour"}


class PlanAwareAnalyzeThrottle(_PlanAwareThrottle):
    """For analysis endpoints (writing eval, speaking analysis, weakness)."""

    scope = "ai_analyze_plan"
    RATES = {"free": "20/hour", "pro": "200/hour"}
