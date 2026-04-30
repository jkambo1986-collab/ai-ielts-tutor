"""
Custom User model — extends AbstractUser to add institute FK, role, IELTS prefs.

Always create a custom User model on day 1 of any Django project. Swapping later
is painful (requires data migration of every FK that points at auth.User).
"""

import uuid

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    """Custom manager — uses email as the primary identifier for login."""

    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        # username is required by AbstractUser's schema; we mirror it from email
        extra_fields.setdefault("username", email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.ROLE_SUPER_ADMIN)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True")
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    """Application user. Belongs to one Institute (except super admins)."""

    ROLE_SUPER_ADMIN = "super_admin"  # Platform-level admin, not bound to an institute
    ROLE_INSTITUTE_ADMIN = "institute_admin"
    ROLE_INSTRUCTOR = "instructor"
    ROLE_STUDENT = "student"
    ROLE_CHOICES = [
        (ROLE_SUPER_ADMIN, "Super Admin"),
        (ROLE_INSTITUTE_ADMIN, "Institute Admin"),
        (ROLE_INSTRUCTOR, "Instructor"),
        (ROLE_STUDENT, "Student"),
    ]

    PLAN_FREE = "free"
    PLAN_PRO = "pro"
    PLAN_CHOICES = [
        (PLAN_FREE, "Free"),
        (PLAN_PRO, "Pro"),
    ]

    # ESL: tracking the learner's first language lets the AI tutor tailor
    # feedback to common L1-influenced errors (e.g. article use for Russian
    # speakers, /θ/ pronunciation for French speakers). Stored as ISO 639-1
    # codes so it's stable if we add UI labels in more places.
    NATIVE_LANGUAGE_CHOICES = [
        ("", "Prefer not to say"),
        ("ar", "Arabic"),
        ("bn", "Bengali"),
        ("zh", "Chinese (Mandarin)"),
        ("yue", "Chinese (Cantonese)"),
        ("nl", "Dutch"),
        ("fa", "Farsi / Persian"),
        ("fil", "Filipino / Tagalog"),
        ("fr", "French"),
        ("de", "German"),
        ("gu", "Gujarati"),
        ("hi", "Hindi"),
        ("id", "Indonesian"),
        ("it", "Italian"),
        ("ja", "Japanese"),
        ("kk", "Kazakh"),
        ("ko", "Korean"),
        ("ms", "Malay"),
        ("ne", "Nepali"),
        ("pl", "Polish"),
        ("pt", "Portuguese"),
        ("pa", "Punjabi"),
        ("ru", "Russian"),
        ("es", "Spanish"),
        ("ta", "Tamil"),
        ("te", "Telugu"),
        ("th", "Thai"),
        ("tr", "Turkish"),
        ("uk", "Ukrainian"),
        ("ur", "Urdu"),
        ("vi", "Vietnamese"),
        ("other", "Other"),
    ]

    PROFICIENCY_BEGINNER = "beginner"
    PROFICIENCY_LOWER_INTERMEDIATE = "lower_intermediate"
    PROFICIENCY_INTERMEDIATE = "intermediate"
    PROFICIENCY_UPPER_INTERMEDIATE = "upper_intermediate"
    PROFICIENCY_ADVANCED = "advanced"
    PROFICIENCY_CHOICES = [
        (PROFICIENCY_BEGINNER, "Beginner (CEFR A1–A2)"),
        (PROFICIENCY_LOWER_INTERMEDIATE, "Lower Intermediate (CEFR B1)"),
        (PROFICIENCY_INTERMEDIATE, "Intermediate (CEFR B1–B2)"),
        (PROFICIENCY_UPPER_INTERMEDIATE, "Upper Intermediate (CEFR B2–C1)"),
        (PROFICIENCY_ADVANCED, "Advanced (CEFR C1–C2)"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    institute = models.ForeignKey(
        "tenants.Institute",
        on_delete=models.CASCADE,
        related_name="users",
        null=True,
        blank=True,
        help_text="Null only for platform super-admins.",
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_STUDENT)
    name = models.CharField(max_length=200, blank=True)
    target_score = models.DecimalField(max_digits=3, decimal_places=1, default=7.0)
    # Per-criterion sub-targets (UI 8 + Hard 7). When populated, agents
    # consult these instead of the overall target_score where relevant.
    # Shape: {"writing": {"taskAchievement": 7.0, "lexicalResource": 7.5, ...},
    #         "speaking": {"fluencyAndCoherence": 7.0, ...}}
    # Optional — empty dict means "use target_score for everything".
    target_subscores = models.JSONField(default=dict, blank=True)
    adaptive_learning_enabled = models.BooleanField(default=False)
    # ESL profile — used by the AI service to tailor feedback when set.
    native_language = models.CharField(
        max_length=10, choices=NATIVE_LANGUAGE_CHOICES, blank=True, default=""
    )
    english_proficiency_level = models.CharField(
        max_length=24, choices=PROFICIENCY_CHOICES, blank=True, default=""
    )
    # Test-day countdown (D2/D3). Null = not set during onboarding.
    exam_date = models.DateField(null=True, blank=True)
    # Daily commitment captured during onboarding ("20 min/day", "weekdays").
    daily_commitment_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    # Public progress page slug (X2). Null = not opted in.
    public_progress_slug = models.SlugField(max_length=40, unique=True, null=True, blank=True)
    # Theme preference (F5). "system" honours OS; "light" / "dark" override.
    THEME_SYSTEM = "system"
    THEME_LIGHT = "light"
    THEME_DARK = "dark"
    THEME_CHOICES = [(THEME_SYSTEM, "System"), (THEME_LIGHT, "Light"), (THEME_DARK, "Dark")]
    theme_pref = models.CharField(max_length=8, choices=THEME_CHOICES, default=THEME_SYSTEM)
    # Onboarding state (D2). Once True, the wizard won't re-fire.
    onboarded_at = models.DateTimeField(null=True, blank=True)
    subscription_plan = models.CharField(max_length=10, choices=PLAN_CHOICES, default=PLAN_FREE)
    subscription_end_date = models.DateTimeField(null=True, blank=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # Soft delete — keep row for audit; default queries exclude these via the
    # TenantScopedViewSet base + admin user-list endpoint.
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list = []  # email + password is enough; username derives from email

    class Meta:
        ordering = ["email"]
        constraints = [
            # Every non-super-admin must belong to an institute
            models.CheckConstraint(
                condition=(
                    models.Q(role="super_admin")
                    | models.Q(institute__isnull=False)
                ),
                name="user_must_have_institute_unless_super_admin",
            ),
        ]

    def __str__(self) -> str:
        return self.email

    def save(self, *args, **kwargs):
        # AbstractUser still has a unique `username` column even though we use
        # email as USERNAME_FIELD. Mirror it from email so get_or_create() works.
        if not self.username:
            self.username = self.email
        super().save(*args, **kwargs)

    @property
    def is_pro(self) -> bool:
        from django.utils import timezone
        if self.subscription_plan != self.PLAN_PRO:
            return False
        if self.subscription_end_date and self.subscription_end_date < timezone.now():
            return False
        return True

    def downgrade_if_expired(self) -> bool:
        """Auto-downgrade Pro -> Free if subscription has expired. Returns True if changed."""
        from django.utils import timezone
        if (
            self.subscription_plan == self.PLAN_PRO
            and self.subscription_end_date
            and self.subscription_end_date < timezone.now()
        ):
            self.subscription_plan = self.PLAN_FREE
            self.subscription_end_date = None
            self.save(update_fields=["subscription_plan", "subscription_end_date"])
            return True
        return False
