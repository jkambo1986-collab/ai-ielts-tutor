"""Production settings — Vertex AI, strict security, structured logs."""

from .base import *  # noqa: F401, F403

DEBUG = False

# Security headers (HTTPS-only)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30  # 30 days; raise to 1 year after rollout
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# Vertex Live API isn't fully wired yet — honour the env var so we can keep
# AI Studio in prod until ephemeral-token minting lands.
# `USE_VERTEX_AI` is read from env in `base.py`; nothing to override here.
TENANT_RESOLVE_FROM_SUBDOMAIN = True

# Structured JSON logs — easier to parse by Railway / Datadog / etc.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "pythonjsonlogger.json.JsonFormatter",
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
        },
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "json"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django.db.backends": {"level": "WARNING"},
        "apps": {"level": "INFO", "propagate": True},
    },
}


# Refuse to boot with the dev SECRET_KEY in production
def _validate_prod_secrets():
    import os
    from django.core.exceptions import ImproperlyConfigured

    if SECRET_KEY.startswith("dev-") or "CHANGEME" in SECRET_KEY:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set to a real value in production.")
    if not os.environ.get("DJANGO_ALLOWED_HOSTS"):
        raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must be set in production.")


_validate_prod_secrets()
