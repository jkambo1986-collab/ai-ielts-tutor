from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from apps.accounts.models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("email", "name", "institute", "role", "subscription_plan", "is_active", "date_joined")
    list_filter = ("role", "subscription_plan", "is_active", "institute")
    search_fields = ("email", "name")
    ordering = ("email",)
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("name", "target_score", "adaptive_learning_enabled")}),
        ("Tenant", {"fields": ("institute", "role")}),
        ("Subscription", {"fields": ("subscription_plan", "subscription_end_date")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Timestamps", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "password1", "password2", "institute", "role"),
        }),
    )
