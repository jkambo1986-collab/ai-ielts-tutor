"""
Audit log writer — single function so callsites stay one-liners.

Don't call AuditLogEntry.objects.create directly; go through `record()` so the
shape is consistent (institute auto-derived from actor, IP/UA pulled from request).
"""

from typing import Optional

from apps.audit.models import AuditLogEntry


def _client_ip(request) -> Optional[str]:
    if not request:
        return None
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def record(
    action: str,
    *,
    actor=None,
    target_user=None,
    institute=None,
    payload: Optional[dict] = None,
    request=None,
) -> AuditLogEntry:
    """Append one entry. Failures are swallowed (audit must never break the
    primary action) — but they are logged."""
    import logging
    log = logging.getLogger(__name__)

    try:
        if institute is None and actor is not None:
            institute = getattr(actor, "institute", None)
        ip = _client_ip(request)
        ua = ""
        if request is not None:
            ua = request.META.get("HTTP_USER_AGENT", "")[:500]
        return AuditLogEntry.objects.create(
            institute=institute,
            actor=actor,
            target_user=target_user,
            action=action,
            payload=payload or {},
            ip_address=ip,
            user_agent=ua,
        )
    except Exception:  # noqa: BLE001
        log.exception("Failed to write audit log entry: %s", action)
        return None  # type: ignore[return-value]
