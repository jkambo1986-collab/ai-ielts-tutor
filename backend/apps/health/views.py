"""
Liveness + readiness probes.

Two endpoints:
  - /api/healthz       — liveness. 200 unless the process itself is broken.
  - /api/readyz        — readiness. Verifies DB; optionally verifies Gemini.

Why split them: liveness is what the platform polls every few seconds and
must NOT do expensive checks (otherwise transient slow Gemini calls cause
restarts). Readiness can do real dependency checks; pollers hit it at a
slower cadence or only on deploy.
"""

import logging
import time

from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse

log = logging.getLogger(__name__)

GEMINI_HEALTH_CACHE_KEY = "health:gemini"
GEMINI_HEALTH_TTL = 60  # seconds — don't hammer Gemini on every probe


def healthz(_request):
    """Liveness — process responds. No external deps."""
    return JsonResponse({"status": "ok"})


def readyz(request):
    """Readiness — DB connectivity (always) + Gemini availability (cached).

    Returns 200 with details when all checks pass; 503 with the failing
    component listed when any check fails.
    """
    checks = {}
    overall_ok = True

    # 1. Postgres
    t0 = time.perf_counter()
    try:
        with connection.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
        checks["database"] = {"ok": True, "latency_ms": round((time.perf_counter() - t0) * 1000, 1)}
    except Exception as exc:  # noqa: BLE001
        log.exception("DB readiness check failed")
        checks["database"] = {"ok": False, "error": str(exc)[:200]}
        overall_ok = False

    # 2. Gemini (cached — we don't burn a real call on every probe)
    if request.GET.get("gemini") == "1":
        cached = cache.get(GEMINI_HEALTH_CACHE_KEY)
        if cached is None:
            cached = _probe_gemini()
            cache.set(GEMINI_HEALTH_CACHE_KEY, cached, GEMINI_HEALTH_TTL)
        checks["gemini"] = cached
        if not cached["ok"]:
            overall_ok = False

    return JsonResponse(
        {"status": "ok" if overall_ok else "degraded", "checks": checks},
        status=200 if overall_ok else 503,
    )


def _probe_gemini() -> dict:
    """One-call Gemini smoke test. Cached for GEMINI_HEALTH_TTL seconds."""
    from apps.ai.client import get_client
    t0 = time.perf_counter()
    try:
        client = get_client()
        # Use a tiny text generation as the smoke probe; cheaper than a JSON call
        client.generate_text("Reply with just: ok")
        return {"ok": True, "latency_ms": round((time.perf_counter() - t0) * 1000, 1)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:200]}
