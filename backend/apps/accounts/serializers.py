"""
Serializers for auth + user-profile endpoints.

The signup flow scopes the new user to the institute resolved from the request
(by TenantMiddleware), so a public signup form on `acme.aiielts.app` produces
a user belonging to the `acme` institute. No cross-tenant signups possible.
"""

from django.contrib.auth import authenticate, password_validation
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.accounts.models import User


class UserSerializer(serializers.ModelSerializer):
    """Public-facing user shape — never includes the password hash."""

    institute_slug = serializers.CharField(source="institute.slug", read_only=True)
    is_pro = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "name",
            "role",
            "target_score",
            "target_subscores",
            "adaptive_learning_enabled",
            "native_language",
            "english_proficiency_level",
            "exam_date",
            "daily_commitment_minutes",
            "public_progress_slug",
            "theme_pref",
            "onboarded_at",
            "subscription_plan",
            "subscription_end_date",
            "is_pro",
            "institute_slug",
            "created_at",
        )
        read_only_fields = (
            "id",
            "email",
            "role",
            "public_progress_slug",
            "onboarded_at",
            "subscription_plan",
            "subscription_end_date",
            "is_pro",
            "institute_slug",
            "created_at",
        )


class SignupSerializer(serializers.Serializer):
    """Public signup — caller must hit the endpoint with a valid X-Institute-Slug."""

    name = serializers.CharField(max_length=200)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=10)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value.lower()

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def create(self, validated_data):
        institute = self.context["institute"]
        if not institute:
            raise serializers.ValidationError("Institute context required.")
        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            name=validated_data["name"],
            institute=institute,
            role=User.ROLE_STUDENT,
        )
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["email"].lower(),
            password=attrs["password"],
        )
        if not user:
            raise serializers.ValidationError("Invalid email or password.")
        if not user.is_active:
            raise serializers.ValidationError("Account is disabled.")

        # Cross-tenant login guard: user's institute must match the request's institute
        institute = self.context.get("institute")
        if institute and user.institute_id != institute.id and user.role != User.ROLE_SUPER_ADMIN:
            # Don't reveal whether the email exists in another tenant
            raise serializers.ValidationError("Invalid email or password.")

        # Auto-downgrade expired Pro subscriptions on login
        user.downgrade_if_expired()

        attrs["user"] = user
        return attrs


class TokenObtainSerializer(TokenObtainPairSerializer):
    """Adds extra claims to the JWT (institute slug + role) for client-side gating."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["institute_slug"] = user.institute.slug if user.institute else None
        token["role"] = user.role
        token["plan"] = user.subscription_plan
        return token


class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "name",
            "target_score",
            "target_subscores",
            "adaptive_learning_enabled",
            "native_language",
            "english_proficiency_level",
            "exam_date",
            "daily_commitment_minutes",
            "theme_pref",
        )

    def validate_target_score(self, value):
        if not (1.0 <= value <= 9.0):
            raise serializers.ValidationError("Target score must be between 1.0 and 9.0.")
        return value

    def validate_target_subscores(self, value):
        """Sub-targets must be a dict-of-dicts with band values 1.0-9.0.

        Shape: {"writing": {"taskAchievement": 7.0, ...},
                "speaking": {"fluencyAndCoherence": 7.0, ...}}
        Empty dict is valid (means "use target_score for everything").
        """
        if not isinstance(value, dict):
            raise serializers.ValidationError("target_subscores must be an object.")
        for skill, criteria in value.items():
            if skill not in ("writing", "speaking"):
                raise serializers.ValidationError(f"Unknown skill key: {skill}")
            if not isinstance(criteria, dict):
                raise serializers.ValidationError(f"{skill} must map to an object of criterion → band.")
            for crit, band in criteria.items():
                try:
                    b = float(band)
                except (TypeError, ValueError):
                    raise serializers.ValidationError(f"{skill}.{crit} must be a number.")
                if not (1.0 <= b <= 9.0):
                    raise serializers.ValidationError(f"{skill}.{crit} must be between 1.0 and 9.0.")
        return value


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=10, write_only=True)

    def validate_new_password(self, value):
        password_validation.validate_password(value)
        return value
