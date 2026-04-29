"""
Tenant-scoped viewset base.

Every viewset filters strictly by request.user — and by request.institute as a
safety net so that even a misconfigured custom queryset can't leak across
tenants. perform_create wires institute + user automatically.
"""

from datetime import timedelta

from django.utils import timezone
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated


class TenantScopedViewSet(viewsets.GenericViewSet):
    """Base for any tenant-scoped viewset. Concrete subclasses pick which DRF
    mixins to add (ListModelMixin, RetrieveModelMixin, etc.).

    Common query params on list endpoints:
      - ?days=N           — only sessions from the last N days
      - ?search=...       — case-insensitive substring filter on
                            search_fields if defined on the subclass
      - DRF pagination via ?page=N&page_size=K
    """

    permission_classes = [IsAuthenticated]
    list_serializer_class = None  # Optional: lightweight serializer for list endpoint
    search_fields: list[str] = []  # Subclasses set this to enable ?search=...

    def get_queryset(self):
        qs = self.queryset.model.objects.filter(
            institute=self.request.user.institute,
            user=self.request.user,
            deleted_at__isnull=True,
        )
        days = self.request.query_params.get("days")
        if days and days != "all":
            try:
                d = int(days)
                if d > 0:
                    qs = qs.filter(created_at__gte=timezone.now() - timedelta(days=d))
            except ValueError:
                pass

        search = self.request.query_params.get("search", "").strip()
        if search and self.search_fields:
            from django.db.models import Q
            q = Q()
            for f in self.search_fields:
                q |= Q(**{f"{f}__icontains": search})
            qs = qs.filter(q)

        return qs

    def get_serializer_class(self):
        if self.action == "list" and self.list_serializer_class is not None:
            return self.list_serializer_class
        return self.serializer_class

    def perform_create(self, serializer):
        serializer.save(
            institute=self.request.user.institute,
            user=self.request.user,
        )

    def perform_destroy(self, instance):
        """DELETE = soft-delete. The row stays for audit/recovery; subsequent
        list/retrieve calls won't see it because `get_queryset` filters
        `deleted_at__isnull=True`."""
        from django.utils import timezone
        instance.deleted_at = timezone.now()
        instance.save(update_fields=["deleted_at"])
