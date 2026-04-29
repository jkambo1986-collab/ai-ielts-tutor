from django.contrib import admin

from apps.billing.models import Subscription


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "institute", "plan", "status", "current_period_end", "created_at")
    list_filter = ("plan", "status", "institute")
    search_fields = ("user__email", "stripe_customer_id")
