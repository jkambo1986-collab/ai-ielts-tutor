"""
Custom DRF exception handler.

Two jobs:
  1. Map AIError -> 502 Bad Gateway (or 503 if fatal config error) with a
     user-facing JSON message. Without this, AI failures bubble up as 500s
     and leak stack traces in DEBUG mode.
  2. Make sure every error response is JSON, never HTML — the FE only knows
     how to parse JSON, and Django's debug HTML pages are useless to it.
"""

import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from apps.ai.exceptions import AIError

log = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    if isinstance(exc, AIError):
        log.warning("AIError raised: %s (fatal=%s)", exc, exc.is_fatal)
        return Response(
            {"detail": str(exc), "code": "ai_error", "fatal": exc.is_fatal},
            status=status.HTTP_503_SERVICE_UNAVAILABLE if exc.is_fatal else status.HTTP_502_BAD_GATEWAY,
        )
    return drf_exception_handler(exc, context)
