from django.contrib import admin

from apps.tenants.models import Institute, InstituteSettings


@admin.register(Institute)
class InstituteAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "plan_tier", "max_users", "is_active", "created_at")
    list_filter = ("plan_tier", "is_active")
    search_fields = ("name", "slug", "billing_email")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(InstituteSettings)
class InstituteSettingsAdmin(admin.ModelAdmin):
    list_display = ("institute", "default_target_score", "allow_signup", "updated_at")
