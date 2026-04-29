"""Serializers for Institute + InstituteSettings — public shape exposed via the tenants API."""

from rest_framework import serializers

from apps.tenants.models import Institute, InstituteSettings


class InstituteSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstituteSettings
        fields = ("default_target_score", "allow_signup", "custom_branding", "feature_overrides")


class InstituteSerializer(serializers.ModelSerializer):
    settings = InstituteSettingsSerializer(read_only=True)

    class Meta:
        model = Institute
        fields = ("id", "name", "slug", "plan_tier", "is_active", "settings")
