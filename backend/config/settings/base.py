"""
Base Django settings — shared across dev and prod.

Environment-specific overrides live in dev.py and prod.py.
The DJANGO_SETTINGS_MODULE env var selects which is used.
"""

from datetime import timedelta
from pathlib import Path

import dj_database_url
from decouple import Csv, config

# BASE_DIR is the backend/ root (parent of config/)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# -- Core --

SECRET_KEY = config("DJANGO_SECRET_KEY", default="dev-insecure-change-me-CHANGEME-secret")
DEBUG = config("DJANGO_DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("DJANGO_ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

AUTH_USER_MODEL = "accounts.User"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# -- Apps --

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "drf_spectacular",
]

LOCAL_APPS = [
    "apps.tenants",
    "apps.accounts",
    "apps.practice",
    "apps.ai",
    "apps.billing",
    "apps.content",
    "apps.adminpanel",
    "apps.audit",
    "apps.health",
    "apps.common",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# -- Middleware --

MIDDLEWARE = [
    "apps.common.middleware.RequestIDMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.tenants.middleware.TenantMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# -- Database --

DATABASES = {
    "default": dj_database_url.config(
        default=config(
            "DATABASE_URL",
            default="postgresql://postgres:CHANGE_ME@localhost:5432/ielts_dev",
        ),
        conn_max_age=600,
    )
}

# -- Auth / Passwords --

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# -- I18N --

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# -- Static files --

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# -- DRF --

REST_FRAMEWORK = {
    # Keep DecimalField (target_score, band_score) serialized as JSON numbers,
    # not strings — the frontend treats these as numbers.
    "COERCE_DECIMAL_TO_STRING": False,
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "config.exceptions.custom_exception_handler",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.AnonRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "user": "1000/day",
        "anon": "30/hour",
        "ai_generate": "60/hour",
        "ai_analyze": "30/hour",
        # Fallback rates for plan-aware throttles — actual rate is chosen by
        # PlanAwareGenerateThrottle / PlanAwareAnalyzeThrottle based on plan.
        "ai_generate_plan": "60/hour",
        "ai_analyze_plan": "30/hour",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "AI IELTS Tutor API",
    "DESCRIPTION": "Backend API for the AI IELTS Tutor multi-tenant platform",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# -- CORS --

CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:3000,http://127.0.0.1:3000",
    cast=Csv(),
)
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = (
    "accept",
    "authorization",
    "content-type",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-institute-slug",
)

# -- Tenant config --

TENANT_HEADER = "X-Institute-Slug"
TENANT_DEFAULT_SLUG = config("TENANT_DEFAULT_SLUG", default="default")
TENANT_RESOLVE_FROM_SUBDOMAIN = config("TENANT_RESOLVE_FROM_SUBDOMAIN", default=False, cast=bool)

# -- Gemini / Vertex AI config --

USE_VERTEX_AI = config("USE_VERTEX_AI", default=False, cast=bool)
GEMINI_API_KEY = config("GEMINI_API_KEY", default="")
GOOGLE_CLOUD_PROJECT = config("GOOGLE_CLOUD_PROJECT", default="")
GCP_REGION = config("GCP_REGION", default="us-central1")
GOOGLE_APPLICATION_CREDENTIALS_JSON = config("GOOGLE_APPLICATION_CREDENTIALS_JSON", default="")
GEMINI_MODEL = config("GEMINI_MODEL", default="gemini-2.5-flash")
GEMINI_LIVE_MODEL = config("GEMINI_LIVE_MODEL", default="gemini-2.5-flash-native-audio-preview-09-2025")
GEMINI_LIVE_FALLBACK_MODELS = config(
    "GEMINI_LIVE_FALLBACK_MODELS",
    default="gemini-2.5-flash-native-audio-preview-09-2025,gemini-2.0-flash-exp",
    cast=Csv(),
)

# -- Sentry (only enabled when SENTRY_DSN is set) --

SENTRY_DSN = config("SENTRY_DSN", default="")
SENTRY_ENVIRONMENT = config("SENTRY_ENVIRONMENT", default="dev")
SENTRY_TRACES_SAMPLE_RATE = config("SENTRY_TRACES_SAMPLE_RATE", default=0.1, cast=float)

if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=SENTRY_ENVIRONMENT,
        integrations=[DjangoIntegration()],
        traces_sample_rate=SENTRY_TRACES_SAMPLE_RATE,
        # Strip PII from error events; rely on user_id only.
        send_default_pii=False,
    )

# -- Email --
# Dev/test default: console backend (emails print to stdout). Set EMAIL_HOST*
# in prod to switch to SMTP. SendGrid recommended — set EMAIL_HOST=smtp.sendgrid.net,
# EMAIL_HOST_USER=apikey, EMAIL_HOST_PASSWORD=<key>.

EMAIL_BACKEND = config(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend",
)
EMAIL_HOST = config("EMAIL_HOST", default="")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=True, cast=bool)
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="AI IELTS Tutor <noreply@aiielts.app>")
PASSWORD_RESET_TIMEOUT_HOURS = 2
EMAIL_VERIFICATION_TIMEOUT_HOURS = 72
INVITE_TIMEOUT_DAYS = 14

# Where the FE lives — used to build action links inside emails.
FRONTEND_BASE_URL = config("FRONTEND_BASE_URL", default="http://localhost:3000")

# -- Logging --

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "simple"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django.db.backends": {"level": "WARNING"},
        "apps": {"level": "DEBUG", "propagate": True},
    },
}
