"""
Feature flags + plan→features mapping.

Pro-only features get a server-side gate. Even if the FE forgets to hide a
button, the API returns 402 Payment Required for Free users.
"""

from functools import wraps

from rest_framework import status
from rest_framework.exceptions import APIException

# -- Feature catalog -- #

FEATURE_COHESION_MAPPER = "cohesion_mapper"
FEATURE_PRONUNCIATION_STUDIO = "pronunciation_studio"
FEATURE_ROLEPLAY_MODE = "roleplay_mode"
FEATURE_INTEGRATED_SKILLS = "integrated_skills"
FEATURE_WEAKNESS_ANALYSIS = "weakness_analysis"
FEATURE_STUDY_PLAN = "study_plan"
FEATURE_COMPREHENSIVE_ANALYSIS = "comprehensive_analysis"
FEATURE_CONTEXTUAL_PROMPTS = "contextual_prompts"

# Plan tier → set of allowed features
PLAN_FEATURES: dict[str, set[str]] = {
    "free": set(),  # Everything not Pro-only is allowed implicitly; Pro features below are blocked.
    "pro": {
        FEATURE_COHESION_MAPPER,
        FEATURE_PRONUNCIATION_STUDIO,
        FEATURE_ROLEPLAY_MODE,
        FEATURE_INTEGRATED_SKILLS,
        FEATURE_WEAKNESS_ANALYSIS,
        FEATURE_STUDY_PLAN,
        FEATURE_COMPREHENSIVE_ANALYSIS,
        FEATURE_CONTEXTUAL_PROMPTS,
    },
}


class PaymentRequired(APIException):
    """402 Payment Required — feature is Pro-only and user is on Free."""

    status_code = status.HTTP_402_PAYMENT_REQUIRED
    default_detail = "This feature requires a Pro subscription."
    default_code = "payment_required"


def user_has_feature(user, feature: str) -> bool:
    """Paywall removed: every authenticated user gets every feature.

    Kept as a function (not deleted) so call sites — including the
    `requires_feature` decorator and `/api/billing/features` — keep working
    without touching every endpoint. Re-enable plan gating by restoring the
    institute-override + plan check below.
    """
    return True
    # --- previous paywall logic, kept for reference ---
    # settings_obj = getattr(user.institute, "settings", None)
    # if settings_obj and feature in settings_obj.feature_overrides:
    #     return bool(settings_obj.feature_overrides[feature])
    # plan = "pro" if user.is_pro else "free"
    # return feature in PLAN_FEATURES.get(plan, set())


def requires_feature(feature: str):
    """Decorator for DRF view methods that require a Pro feature."""

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped(self, request, *args, **kwargs):
            if not user_has_feature(request.user, feature):
                raise PaymentRequired(detail=f"This feature ('{feature}') requires a Pro subscription.")
            return view_func(self, request, *args, **kwargs)

        return _wrapped

    return decorator
