"""Admin-only endpoints — sitemap, user listing, institute usage stats."""

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.adminpanel.permissions import IsInstituteAdmin
from apps.adminpanel.sitemap import filter_for_user
from apps.audit.models import AuditLogEntry
from apps.practice.models import (
    ListeningSession,
    ReadingSession,
    SpeakingSession,
    WritingSession,
)


class SitemapView(APIView):
    """GET /api/admin/sitemap — hierarchical map of platform sections + live counts.

    Visible to institute_admin and super_admin only.

    The structural part is static (defined in sitemap.py); the counts are
    computed live so the admin sees current usage. We deliberately don't
    cache because admins are infrequent users and stale data would be worse
    than the small query cost.
    """

    permission_classes = [IsAuthenticated, IsInstituteAdmin]

    def get(self, request):
        institute = request.user.institute
        nodes = filter_for_user(request.user)

        # Live counts scoped to the admin's institute
        counts = {
            "users": User.objects.filter(institute=institute).count(),
            "users_pro": User.objects.filter(
                institute=institute, subscription_plan=User.PLAN_PRO,
            ).count(),
            "sessions": {
                "writing": WritingSession.objects.filter(institute=institute).count(),
                "speaking": SpeakingSession.objects.filter(institute=institute).count(),
                "reading": ReadingSession.objects.filter(institute=institute).count(),
                "listening": ListeningSession.objects.filter(institute=institute).count(),
            },
        }

        return Response(
            {
                "institute": {
                    "id": str(institute.id),
                    "name": institute.name,
                    "slug": institute.slug,
                    "plan_tier": institute.plan_tier,
                },
                "counts": counts,
                "sections": nodes,
                "viewer": {
                    "id": str(request.user.id),
                    "email": request.user.email,
                    "role": request.user.role,
                },
            }
        )


class UsersListView(APIView):
    """GET /api/admin/users — paginated list of users in this institute.

    Query params:
      - search: case-insensitive match against email or name
      - role: filter by role (student | instructor | institute_admin)
      - plan: filter by subscription_plan (free | pro)
      - limit (default 50, max 200)
      - offset (default 0)
    """

    permission_classes = [IsAuthenticated, IsInstituteAdmin]

    def get(self, request):
        qs = User.objects.filter(institute=request.user.institute).order_by("email")

        search = request.query_params.get("search", "").strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(Q(email__icontains=search) | Q(name__icontains=search))

        role = request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)

        plan = request.query_params.get("plan")
        if plan:
            qs = qs.filter(subscription_plan=plan)

        try:
            limit = min(int(request.query_params.get("limit", 50)), 200)
            offset = max(int(request.query_params.get("offset", 0)), 0)
        except ValueError:
            return Response({"detail": "Invalid limit/offset."}, status=400)

        total = qs.count()
        users = qs[offset:offset + limit].values(
            "id", "email", "name", "role",
            "subscription_plan", "subscription_end_date",
            "is_active", "date_joined", "last_login",
        )

        return Response(
            {
                "total": total,
                "limit": limit,
                "offset": offset,
                "users": list(users),
            }
        )


class AuditLogView(APIView):
    """GET /api/v1/admin/audit-log — recent audit entries scoped to institute.

    Query params:
      - action: filter by action prefix (e.g. ?action=billing.)
      - actor_email: filter by actor
      - limit (default 100, max 500)
      - offset (default 0)
    """

    permission_classes = [IsAuthenticated, IsInstituteAdmin]

    def get(self, request):
        qs = AuditLogEntry.objects.filter(institute=request.user.institute)

        action_prefix = request.query_params.get("action")
        if action_prefix:
            qs = qs.filter(action__startswith=action_prefix)

        actor_email = request.query_params.get("actor_email")
        if actor_email:
            qs = qs.filter(actor__email__iexact=actor_email)

        try:
            limit = min(int(request.query_params.get("limit", 100)), 500)
            offset = max(int(request.query_params.get("offset", 0)), 0)
        except ValueError:
            return Response({"detail": "Invalid limit/offset."}, status=400)

        total = qs.count()
        rows = qs[offset:offset + limit].values(
            "id", "action", "payload", "ip_address", "created_at",
            "actor__email", "target_user__email",
        )
        return Response(
            {
                "total": total,
                "limit": limit,
                "offset": offset,
                "entries": [
                    {
                        "id": str(r["id"]),
                        "action": r["action"],
                        "actor_email": r["actor__email"],
                        "target_email": r["target_user__email"],
                        "payload": r["payload"],
                        "ip_address": r["ip_address"],
                        "created_at": r["created_at"],
                    }
                    for r in rows
                ],
            }
        )


class UsageStatsView(APIView):
    """GET /api/admin/usage-stats — institute-wide usage + score averages."""

    permission_classes = [IsAuthenticated, IsInstituteAdmin]

    def get(self, request):
        institute = request.user.institute

        writing_stats = WritingSession.objects.filter(institute=institute).aggregate(
            count=Count("id"), avg_band=Avg("band_score"),
        )
        speaking_stats = SpeakingSession.objects.filter(
            institute=institute, analysis__isnull=False,
        ).aggregate(count=Count("id"))
        reading_stats = ReadingSession.objects.filter(institute=institute).aggregate(
            count=Count("id"),
        )
        listening_stats = ListeningSession.objects.filter(institute=institute).aggregate(
            count=Count("id"),
        )

        # User breakdown
        users_qs = User.objects.filter(institute=institute)
        user_breakdown = {
            "total": users_qs.count(),
            "active": users_qs.filter(is_active=True).count(),
            "pro": users_qs.filter(subscription_plan=User.PLAN_PRO).count(),
            "by_role": {
                row["role"]: row["c"]
                for row in users_qs.values("role").annotate(c=Count("id"))
            },
        }

        return Response(
            {
                "institute": {
                    "name": institute.name,
                    "slug": institute.slug,
                    "plan_tier": institute.plan_tier,
                    "max_users": institute.max_users,
                },
                "users": user_breakdown,
                "sessions": {
                    "writing": {
                        "count": writing_stats["count"] or 0,
                        "avg_band": round(writing_stats["avg_band"] or 0, 2),
                    },
                    "speaking_analyzed": speaking_stats["count"] or 0,
                    "reading": reading_stats["count"] or 0,
                    "listening": listening_stats["count"] or 0,
                },
            }
        )
