"""
Liveness + readiness probes.

Three endpoints:
  - /api/healthz       — liveness. 200 unless the process itself is broken.
  - /api/readyz        — readiness. Verifies DB; optionally verifies Gemini.
  - /api/version       — diagnostic. Returns git SHA + URL count so we can
                          tell which deploy is actually running.

Why split healthz/readyz: liveness is what the platform polls every few
seconds and must NOT do expensive checks (otherwise transient slow Gemini
calls cause restarts). Readiness can do real dependency checks.

Why /version exists: Railway, like most managed runtimes, can serve a
stale container when a build silently fails or queues. /version exposes
RAILWAY_GIT_COMMIT_SHA so we can confirm what's running without guessing
from response shape.
"""

import logging
import os
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


def version(_request):
    """Diagnostic — what commit is currently serving requests.

    Railway sets RAILWAY_GIT_COMMIT_SHA at deploy time. We also expose a
    count of registered URL patterns so a quick check tells us whether a
    URL change actually shipped, even when the SHA is missing."""
    sha = (
        os.environ.get("RAILWAY_GIT_COMMIT_SHA")
        or os.environ.get("GIT_COMMIT")
        or os.environ.get("SOURCE_COMMIT")
        or "unknown"
    )
    branch = os.environ.get("RAILWAY_GIT_BRANCH", "unknown")
    deployed_at = os.environ.get("RAILWAY_DEPLOYMENT_CREATED_AT", "unknown")

    # Count URL patterns under /api/v1/analytics/* so deploys that drop a
    # route are visible without needing a real authenticated request.
    analytics_routes: list[str] = []
    try:
        from django.urls import get_resolver
        resolver = get_resolver()
        for pattern in resolver.url_patterns:
            if hasattr(pattern, "url_patterns") and "api/v1" in str(pattern.pattern):
                # Walk into /api/v1/
                for sub in pattern.url_patterns:
                    if hasattr(sub, "url_patterns") and "analytics" in str(sub.pattern):
                        for r in sub.url_patterns:
                            analytics_routes.append(str(r.pattern))
    except Exception:
        log.warning("version: failed to enumerate analytics routes", exc_info=True)

    return JsonResponse({
        "sha": sha[:12] if sha != "unknown" else sha,
        "branch": branch,
        "deployed_at": deployed_at,
        "analytics_route_count": len(analytics_routes),
        "has_streak_route": any("streak" in r for r in analytics_routes),
        "has_warmup_route": any("warmup" in r for r in analytics_routes),
    })


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
