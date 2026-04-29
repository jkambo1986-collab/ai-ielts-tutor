from django.contrib import admin

from apps.audit.models import AuditLogEntry


@admin.register(AuditLogEntry)
class AuditLogEntryAdmin(admin.ModelAdmin):
    list_display = ("created_at", "action", "actor", "target_user", "institute", "ip_address")
    list_filter = ("action", "institute")
    search_fields = ("actor__email", "target_user__email", "action", "ip_address")
    readonly_fields = ("id", "created_at", "actor", "target_user", "institute",
                       "action", "payload", "ip_address", "user_agent")
    ordering = ("-created_at",)

    def has_add_permission(self, request):
        return False  # Audit log is append-only

    def has_change_permission(self, request, obj=None):
        return False
