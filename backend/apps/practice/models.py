"""
Practice session models.

Each practice modality (writing/speaking/reading/listening) gets its own session
table. Feedback / analysis / transcripts are stored as JSON because the schemas
are nested and accessed atomically — flattening into normalized tables would
not pay off until we want SQL-level analytics over feedback content.

All session tables FK to both User and Institute. The institute FK is technically
redundant (we could derive it from user.institute) but storing it directly:
  - lets us query by institute without a join,
  - protects against cross-tenant leaks if a user is moved between institutes,
  - matches the TenantScopedModel pattern used elsewhere.
"""

import uuid

from django.db import models

from apps.tenants.managers import TenantManager


class PracticeSessionBase(models.Model):
    """Abstract base — fields shared by all four session types."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "tenants.Institute", on_delete=models.CASCADE, related_name="+", db_index=True
    )
    user = models.ForeignKey(
        "accounts.User", on_delete=models.CASCADE, related_name="+", db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Soft delete — viewsets filter `deleted_at__isnull=True` by default;
    # admin can bypass for support / GDPR exports.
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = TenantManager()

    class Meta:
        abstract = True
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["institute", "-created_at"]),
        ]


class WritingSession(PracticeSessionBase):
    TASK_TYPE_TASK1 = "task1"
    TASK_TYPE_TASK2 = "task2"
    TASK_TYPE_CHOICES = [(TASK_TYPE_TASK1, "Task 1"), (TASK_TYPE_TASK2, "Task 2")]

    prompt = models.TextField()
    essay = models.TextField()
    band_score = models.DecimalField(max_digits=3, decimal_places=1)
    feedback = models.JSONField(help_text="Full WritingFeedback object")
    # Per-task split (#14): Task 1 vs Task 2 are scored differently in IELTS.
    task_type = models.CharField(max_length=10, choices=TASK_TYPE_CHOICES, default=TASK_TYPE_TASK2, db_index=True)
    # How long the user spent on the essay (#18 quality metric).
    duration_seconds = models.PositiveIntegerField(default=0)
    # 0–100 quality score (#18). Null = not yet computed.
    quality_score = models.FloatField(null=True, blank=True)
    # User's self-predicted band before submitting (#25 calibration). Null if not asked.
    predicted_band = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    # Re-attempt link (#21): when set, this session is a retry of the original.
    parent_session = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="reattempts"
    )

    class Meta(PracticeSessionBase.Meta):
        db_table = "practice_writing_session"


class SpeakingSession(PracticeSessionBase):
    MODE_STANDARD = "Standard"
    MODE_ROLEPLAY = "RolePlay"
    MODE_MOCK = "Mock"  # B1: structured 3-part mock test
    MODE_WARMUP = "Warmup"  # F6: first 60s unmarked then rubric kicks in
    MODE_CHOICES = [
        (MODE_STANDARD, "Standard"),
        (MODE_ROLEPLAY, "Role Play"),
        (MODE_MOCK, "Mock Test"),
        (MODE_WARMUP, "Warm-up"),
    ]

    PART_PART1 = "part1"
    PART_PART2 = "part2"
    PART_PART3 = "part3"
    PART_MIXED = "mixed"
    PART_CHOICES = [
        (PART_PART1, "Part 1"),
        (PART_PART2, "Part 2"),
        (PART_PART3, "Part 3"),
        (PART_MIXED, "Mixed"),
    ]

    ACCENT_UK = "uk"
    ACCENT_US = "us"
    ACCENT_AU = "au"
    ACCENT_NZ = "nz"
    ACCENT_CA = "ca"
    ACCENT_CHOICES = [
        (ACCENT_UK, "UK"), (ACCENT_US, "US"),
        (ACCENT_AU, "Australia"), (ACCENT_NZ, "New Zealand"),
        (ACCENT_CA, "Canada"),
    ]

    PERSONA_NEUTRAL = "neutral"
    PERSONA_STRICT = "strict"
    PERSONA_FRIENDLY = "friendly"
    PERSONA_FORMAL = "formal"
    PERSONA_CHOICES = [
        (PERSONA_NEUTRAL, "Neutral"), (PERSONA_STRICT, "Strict"),
        (PERSONA_FRIENDLY, "Friendly"), (PERSONA_FORMAL, "Formal"),
    ]

    duration_seconds = models.PositiveIntegerField(default=0)
    topic = models.CharField(max_length=500, blank=True)
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default=MODE_STANDARD)
    prompt = models.JSONField(null=True, blank=True, help_text="{ part, text } if structured")
    transcript = models.JSONField(default=list, help_text="Array of Turn objects")
    analysis = models.JSONField(null=True, blank=True, help_text="SpeakingAnalysis (set after analysis)")
    # IELTS Speaking has Parts 1, 2, 3 — track which one this session covered (#14).
    part = models.CharField(max_length=10, choices=PART_CHOICES, default=PART_MIXED, db_index=True)
    # Cached fluency metrics derived from the transcript (#26 fluency meter).
    # Shape: { wpm, pause_seconds_avg, filler_count, filler_per_minute, total_words }
    fluency_metrics = models.JSONField(null=True, blank=True)
    quality_score = models.FloatField(null=True, blank=True)  # #18
    predicted_band = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)  # #25
    parent_session = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="reattempts"
    )
    # B5: examiner accent / E1: persona — informs voice + system prompt.
    accent = models.CharField(max_length=4, choices=ACCENT_CHOICES, default=ACCENT_UK)
    persona = models.CharField(max_length=12, choices=PERSONA_CHOICES, default=PERSONA_NEUTRAL)
    # B1/B3: structured mock progress — { current_part, started_at_per_part }
    mock_state = models.JSONField(null=True, blank=True)
    # B9: live examiner notes accumulated by the AI during the session.
    examiner_notes = models.JSONField(default=list, blank=True)
    # B2: cue card used (when applicable). Snapshot stored so re-prompt is stable.
    cue_card = models.JSONField(null=True, blank=True)
    # F1: live token freshness. Backend writes this when minting; FE refreshes
    # via /reconnect at TTL - 60s. Long mock tests (25+ min) outlived the
    # token's silent default and silently 401'd mid-session before this.
    live_token_expires_at = models.DateTimeField(null=True, blank=True)
    # B1.7: hint usage so the analyzer can grade honestly.
    whisper_hints_used = models.PositiveIntegerField(default=0)

    class Meta(PracticeSessionBase.Meta):
        db_table = "practice_speaking_session"


class ReadingSession(PracticeSessionBase):
    score = models.PositiveIntegerField()
    total_questions = models.PositiveIntegerField()
    passage_title = models.CharField(max_length=300, blank=True)
    passage_content = models.TextField(blank=True, help_text="Original passage text — kept for replay/review.")
    # IELTS Academic raw → band conversion, persisted so we don't recompute (#4).
    band_score = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    quality_score = models.FloatField(null=True, blank=True)
    predicted_band = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    parent_session = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="reattempts"
    )

    class Meta(PracticeSessionBase.Meta):
        db_table = "practice_reading_session"


class ListeningSession(PracticeSessionBase):
    score = models.PositiveIntegerField()
    total_questions = models.PositiveIntegerField()
    title = models.CharField(max_length=300, blank=True)
    transcript = models.TextField(blank=True, help_text="Audio script text — kept for replay/review.")
    band_score = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    quality_score = models.FloatField(null=True, blank=True)
    predicted_band = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    parent_session = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="reattempts"
    )

    class Meta(PracticeSessionBase.Meta):
        db_table = "practice_listening_session"


class WeaknessAnalysisCache(PracticeSessionBase):
    """Cached AI weakness analysis. TTL ~7 days — regenerated on demand."""

    SKILL_WRITING = "writing"
    SKILL_SPEAKING = "speaking"
    SKILL_CHOICES = [(SKILL_WRITING, "Writing"), (SKILL_SPEAKING, "Speaking")]

    skill = models.CharField(max_length=20, choices=SKILL_CHOICES, db_index=True)
    analysis = models.JSONField()
    expires_at = models.DateTimeField()

    class Meta(PracticeSessionBase.Meta):
        db_table = "practice_weakness_cache"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "skill"],
                name="unique_active_weakness_analysis_per_user_skill",
            )
        ]


class StudyPlan(PracticeSessionBase):
    """7-day personalized study plan (Pro feature)."""

    plan = models.JSONField(help_text="StudyPlan object — array of DailyGoal")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta(PracticeSessionBase.Meta):
        db_table = "practice_study_plan"


class QuizQuestion(models.Model):
    """Optional pre-seeded / cached quiz question bank.

    Quizzes are also generated live by the AI service — this table is for
    institutes that want curated banks or for caching popular AI generations.
    Not tenant-scoped: questions are shared across institutes by default. If
    an institute wants private questions, set `institute` to non-null.
    """

    CATEGORY_READING = "Reading"
    CATEGORY_LISTENING = "Listening"
    CATEGORY_GRAMMAR = "Grammar"
    CATEGORY_VOCABULARY = "Vocabulary"
    CATEGORY_CHOICES = [
        (CATEGORY_READING, "Reading"),
        (CATEGORY_LISTENING, "Listening"),
        (CATEGORY_GRAMMAR, "Grammar"),
        (CATEGORY_VOCABULARY, "Vocabulary"),
    ]

    DIFFICULTY_EASY = "Easy"
    DIFFICULTY_MEDIUM = "Medium"
    DIFFICULTY_HARD = "Hard"
    DIFFICULTY_CHOICES = [
        (DIFFICULTY_EASY, "Easy"),
        (DIFFICULTY_MEDIUM, "Medium"),
        (DIFFICULTY_HARD, "Hard"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "tenants.Institute",
        on_delete=models.CASCADE,
        related_name="+",
        null=True,
        blank=True,
        db_index=True,
        help_text="Null = global question (shared across all institutes).",
    )
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, db_index=True)
    difficulty = models.CharField(max_length=10, choices=DIFFICULTY_CHOICES, db_index=True)
    question_text = models.TextField()
    options = models.JSONField(help_text="Array of option strings, e.g. ['A...', 'B...', 'C...', 'D...']")
    correct_answer = models.CharField(max_length=10, help_text="The correct option letter, e.g. 'A'.")
    explanation = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "practice_quiz_question"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["category", "difficulty"]),
        ]

    def __str__(self) -> str:
        return f"[{self.category}/{self.difficulty}] {self.question_text[:60]}"


class QuizSession(PracticeSessionBase):
    """A user's attempt at a quiz — score-tracking parity with other modalities."""

    category = models.CharField(
        max_length=20, choices=QuizQuestion.CATEGORY_CHOICES, blank=True
    )
    difficulty = models.CharField(
        max_length=10, choices=QuizQuestion.DIFFICULTY_CHOICES, blank=True
    )
    score = models.PositiveIntegerField()
    total_questions = models.PositiveIntegerField()
    title = models.CharField(max_length=300, blank=True)
    questions_snapshot = models.JSONField(
        default=list,
        blank=True,
        help_text="Frozen copy of the questions/answers shown to the user.",
    )

    class Meta(PracticeSessionBase.Meta):
        db_table = "practice_quiz_session"


# -- Dashboard / learner-state stores -- #

SESSION_TYPE_CHOICES = [
    ("writing", "Writing"),
    ("speaking", "Speaking"),
    ("reading", "Reading"),
    ("listening", "Listening"),
]


class VocabularyObservation(models.Model):
    """One row per (user, lemma) — incremented every time the lemma appears in
    the user's writing or speaking output. Powers #19 vocabulary range tracker.

    We store both the raw word as observed and the lemma so frequency counts
    aren't fragmented across "wrote / writes / writing". CEFR + AWL flags are
    populated from a static lexicon at write time; if the lexicon doesn't
    know the word, both are left null and the row still counts towards
    "unique words used" but not towards "B2+ unique words".
    """

    CEFR_CHOICES = [
        ("A1", "A1"), ("A2", "A2"),
        ("B1", "B1"), ("B2", "B2"),
        ("C1", "C1"), ("C2", "C2"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="vocabulary")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    lemma = models.CharField(max_length=100, db_index=True)
    cefr_level = models.CharField(max_length=2, choices=CEFR_CHOICES, blank=True, default="")
    is_awl = models.BooleanField(default=False, help_text="On the Academic Word List")
    first_seen_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)
    frequency = models.PositiveIntegerField(default=1)
    last_session_type = models.CharField(max_length=10, choices=SESSION_TYPE_CHOICES, blank=True, default="")
    last_session_id = models.UUIDField(null=True, blank=True)
    # Soft delete — supports GDPR "forget my vocab history" without breaking
    # frequency counters mid-stream.
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "practice_vocabulary_observation"
        ordering = ["-last_seen_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "lemma"], name="unique_vocab_per_user_lemma"),
        ]
        indexes = [
            models.Index(fields=["user", "cefr_level"]),
            models.Index(fields=["user", "-last_seen_at"]),
        ]


class ErrorCard(models.Model):
    """SRS flashcard for a learner-specific error (#22). Uses a simplified SM-2
    algorithm: each review updates `interval_days` and `ease`, scheduling the
    next due date. Never delete — `archived_at` lets users hide mastered cards.
    """

    CATEGORY_GRAMMAR = "grammar"
    CATEGORY_LEXICAL = "lexical"
    CATEGORY_PRONUNCIATION = "pronunciation"
    CATEGORY_COHERENCE = "coherence"
    CATEGORY_TASK = "task_response"
    CATEGORY_FLUENCY = "fluency"
    CATEGORY_OTHER = "other"
    CATEGORY_CHOICES = [
        (CATEGORY_GRAMMAR, "Grammar"),
        (CATEGORY_LEXICAL, "Lexical"),
        (CATEGORY_PRONUNCIATION, "Pronunciation"),
        (CATEGORY_COHERENCE, "Coherence"),
        (CATEGORY_TASK, "Task Response"),
        (CATEGORY_FLUENCY, "Fluency"),
        (CATEGORY_OTHER, "Other"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="error_cards")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    source_session_type = models.CharField(max_length=10, choices=SESSION_TYPE_CHOICES)
    source_session_id = models.UUIDField()
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default=CATEGORY_OTHER, db_index=True)
    error_text = models.TextField(help_text="The original problem (sentence, phrase, or pattern).")
    correction_text = models.TextField(blank=True)
    explanation = models.TextField(blank=True)

    # SM-2 SRS state
    interval_days = models.PositiveIntegerField(default=0)
    ease = models.FloatField(default=2.5)
    repetitions = models.PositiveIntegerField(default=0)
    due_at = models.DateTimeField(db_index=True)
    last_reviewed_at = models.DateTimeField(null=True, blank=True)
    review_count = models.PositiveIntegerField(default=0)
    correct_count = models.PositiveIntegerField(default=0)

    archived_at = models.DateTimeField(null=True, blank=True, help_text="Mastered or dismissed.")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "practice_error_card"
        ordering = ["due_at"]
        indexes = [
            models.Index(fields=["user", "due_at"]),
            models.Index(fields=["user", "archived_at"]),
        ]


class MockTest(models.Model):
    """A timed end-to-end mock test (#20). Stores per-section results plus an
    overall band predictor and a 0-100 readiness score derived from
    accuracy + timing + cross-skill consistency.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="mock_tests")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    overall_band = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    readiness_score = models.FloatField(null=True, blank=True, help_text="0-100; higher = closer to test-day ready")
    # Shape: { writing_task1: {...}, writing_task2: {...}, reading: {...}, listening: {...}, speaking: {...} }
    sub_results = models.JSONField(default=dict)
    # Optional FKs to the underlying session rows so users can drill into each part.
    writing_session = models.ForeignKey("WritingSession", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    speaking_session = models.ForeignKey("SpeakingSession", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    reading_session = models.ForeignKey("ReadingSession", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    listening_session = models.ForeignKey("ListeningSession", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "practice_mock_test"
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["user", "-started_at"]),
        ]


class CalibrationEntry(models.Model):
    """One row per (session, prediction). Powers #25 confidence calibration.
    Delta = predicted - actual; positive means the user over-predicted.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="calibrations")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    session_type = models.CharField(max_length=10, choices=SESSION_TYPE_CHOICES)
    session_id = models.UUIDField()
    predicted_band = models.DecimalField(max_digits=3, decimal_places=1)
    actual_band = models.DecimalField(max_digits=3, decimal_places=1)
    delta = models.DecimalField(max_digits=3, decimal_places=1, help_text="predicted - actual")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "practice_calibration_entry"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["user", "session_type"]),
        ]


class ShareLink(models.Model):
    """Read-only signed URL granting access to a snapshot of the user's
    dashboard (#27). The token is the random part of the URL; expires_at
    bounds the lifetime; revoked_at lets the owner kill it early.
    """

    SCOPE_DASHBOARD = "dashboard"
    SCOPE_SESSION = "session"
    SCOPE_CHOICES = [
        (SCOPE_DASHBOARD, "Dashboard snapshot"),
        (SCOPE_SESSION, "Single session"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="share_links")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    token = models.CharField(max_length=64, unique=True, db_index=True)
    scope = models.CharField(max_length=20, choices=SCOPE_CHOICES, default=SCOPE_DASHBOARD)
    target_id = models.UUIDField(null=True, blank=True, help_text="Session id when scope=session.")
    period_days = models.PositiveIntegerField(default=30)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    view_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "practice_share_link"
        ordering = ["-created_at"]


class DashboardAlert(models.Model):
    """Generated insight surfaced on the dashboard (#28). Stored so users can
    dismiss them and we don't keep firing the same alert.
    """

    TYPE_REGRESSION = "regression"
    TYPE_STREAK_LOST = "streak_lost"
    TYPE_INACTIVE = "inactive"
    TYPE_GOAL_REACHED = "goal_reached"
    TYPE_QUICK_WIN = "quick_win"
    TYPE_CHOICES = [
        (TYPE_REGRESSION, "Regression"),
        (TYPE_STREAK_LOST, "Streak Lost"),
        (TYPE_INACTIVE, "Inactive"),
        (TYPE_GOAL_REACHED, "Goal Reached"),
        (TYPE_QUICK_WIN, "Quick Win Suggestion"),
    ]

    SEVERITY_INFO = "info"
    SEVERITY_WARNING = "warning"
    SEVERITY_SUCCESS = "success"
    SEVERITY_CHOICES = [
        (SEVERITY_INFO, "Info"),
        (SEVERITY_WARNING, "Warning"),
        (SEVERITY_SUCCESS, "Success"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="dashboard_alerts")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    alert_type = models.CharField(max_length=24, choices=TYPE_CHOICES)
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default=SEVERITY_INFO)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    payload = models.JSONField(default=dict, blank=True, help_text="Numbers/links to render the alert.")
    cta_label = models.CharField(max_length=80, blank=True)
    cta_target = models.CharField(max_length=80, blank=True, help_text="Section name / route id")
    dismissed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "practice_dashboard_alert"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "dismissed_at"]),
            models.Index(fields=["user", "-created_at"]),
        ]


# -- Speaking-specific stores -- #


class CueCard(models.Model):
    """B7: Curated Part 2 cue cards.

    Not strictly tenant-scoped — `institute` is nullable so platform-wide
    cards are visible to everyone, with institutes able to add their own.
    """

    CATEGORY_CHOICES = [
        ("personal", "Personal Experience"),
        ("place", "Places"),
        ("object", "Objects & Things"),
        ("event", "Events"),
        ("person", "People"),
        ("media", "Media & Entertainment"),
        ("technology", "Technology"),
        ("environment", "Environment"),
        ("education", "Education"),
        ("work", "Work & Career"),
        ("custom", "Custom"),
    ]

    DIFFICULTY_CHOICES = [
        ("easy", "Easy"),
        ("medium", "Medium"),
        ("hard", "Hard"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "tenants.Institute",
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name="+",
        help_text="Null = global card visible to all institutes.",
    )
    topic = models.CharField(max_length=300)
    bullets = models.JSONField(help_text="Array of 3-5 bullet prompt lines.")
    category = models.CharField(max_length=24, choices=CATEGORY_CHOICES, default="personal", db_index=True)
    difficulty = models.CharField(max_length=8, choices=DIFFICULTY_CHOICES, default="medium")
    follow_up_questions = models.JSONField(
        default=list, blank=True,
        help_text="Suggested Part 3 follow-ups linked to this Part 2 topic.",
    )
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "practice_cue_card"
        ordering = ["topic"]
        indexes = [
            models.Index(fields=["category", "difficulty", "is_active"]),
        ]

    def __str__(self) -> str:
        return f"[{self.category}] {self.topic}"


class SessionAnnotation(models.Model):
    """C5: Instructor annotation on any practice session.

    Restricted by view-layer to instructors / institute admins of the
    student's institute — the model itself is permissive so platform admins
    can also leave notes.
    """

    SESSION_TYPE_CHOICES = [
        ("writing", "Writing"),
        ("speaking", "Speaking"),
        ("reading", "Reading"),
        ("listening", "Listening"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    student = models.ForeignKey(
        "accounts.User", on_delete=models.CASCADE, related_name="received_annotations",
    )
    instructor = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, related_name="given_annotations",
    )
    session_type = models.CharField(max_length=10, choices=SESSION_TYPE_CHOICES)
    session_id = models.UUIDField(db_index=True)
    body = models.TextField()
    # Optional marker into a transcript turn (Speaking) or paragraph (Writing).
    transcript_index = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "practice_session_annotation"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["session_type", "session_id"]),
            models.Index(fields=["student", "-created_at"]),
        ]


# -- UX foundations: notifications + drafts -- #


class Notification(models.Model):
    """In-app notification (P2). Distinct from `DashboardAlert` which is
    aggregate insight; this is a discrete actionable item that lands in the
    bell + inbox.
    """

    TYPE_SRS_DUE = "srs_due"
    TYPE_STREAK_RISK = "streak_risk"
    TYPE_INSTRUCTOR_NOTE = "instructor_note"
    TYPE_WEEKLY_DIGEST = "weekly_digest"
    TYPE_GOAL_REACHED = "goal_reached"
    TYPE_EXAM_REMINDER = "exam_reminder"
    TYPE_SYSTEM = "system"
    TYPE_CHOICES = [
        (TYPE_SRS_DUE, "SRS due"),
        (TYPE_STREAK_RISK, "Streak risk"),
        (TYPE_INSTRUCTOR_NOTE, "Instructor note"),
        (TYPE_WEEKLY_DIGEST, "Weekly digest"),
        (TYPE_GOAL_REACHED, "Goal reached"),
        (TYPE_EXAM_REMINDER, "Exam reminder"),
        (TYPE_SYSTEM, "System"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="notifications")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    notification_type = models.CharField(max_length=24, choices=TYPE_CHOICES)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    cta_label = models.CharField(max_length=80, blank=True)
    cta_target = models.CharField(max_length=120, blank=True, help_text="Section name or route id")
    payload = models.JSONField(default=dict, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    dismissed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "practice_notification"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "read_at"]),
            models.Index(fields=["user", "dismissed_at"]),
        ]


class NotificationPreference(models.Model):
    """Per-user notification channel toggles (P3). One row per (user, channel)."""

    CHANNEL_IN_APP = "in_app"
    CHANNEL_BROWSER = "browser_push"
    CHANNEL_EMAIL = "email"
    CHANNEL_CHOICES = [
        (CHANNEL_IN_APP, "In-app"),
        (CHANNEL_BROWSER, "Browser push"),
        (CHANNEL_EMAIL, "Email"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="notification_prefs")
    channel = models.CharField(max_length=16, choices=CHANNEL_CHOICES)
    # Per-event toggles stored as a JSON map {type: bool}. Default = all true.
    events = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "practice_notification_pref"
        constraints = [
            models.UniqueConstraint(fields=["user", "channel"], name="unique_pref_per_user_channel"),
        ]


class WritingDraft(models.Model):
    """Server-stored writing draft (P4). Keyed by (user, prompt_hash) so the
    same prompt re-opened brings back the in-progress essay regardless of
    device. Survives refresh / browser close."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="writing_drafts")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    prompt_hash = models.CharField(max_length=64, db_index=True)
    prompt = models.TextField()
    essay = models.TextField(blank=True)
    word_count = models.PositiveIntegerField(default=0)
    task_type = models.CharField(max_length=10, default="task2")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "practice_writing_draft"
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "prompt_hash"], name="unique_draft_per_user_prompt"),
        ]
        indexes = [
            models.Index(fields=["user", "-updated_at"]),
        ]


class DailyChallenge(models.Model):
    """One short prompt per user per day across writing/speaking/reading/listening.

    Engagement loop: 5-minute commitment, completion ticks the streak. Skill
    rotates by day-of-year so the user touches all four skills weekly.
    """

    SKILL_CHOICES = [
        ("writing", "Writing"),
        ("speaking", "Speaking"),
        ("reading", "Reading"),
        ("listening", "Listening"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="daily_challenges")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    challenge_date = models.DateField(db_index=True)
    skill = models.CharField(max_length=10, choices=SKILL_CHOICES)
    prompt = models.TextField(help_text="Short challenge text shown on Today.")
    completed_at = models.DateTimeField(null=True, blank=True)
    # The session id that fulfilled this challenge — null until completion.
    session_id = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "practice_daily_challenge"
        ordering = ["-challenge_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "challenge_date"],
                name="unique_daily_challenge_per_user_per_day",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "-challenge_date"]),
        ]


class SessionBookmark(models.Model):
    """Mid-session bookmark on a speaking session (F4).

    Student taps a button mid-conversation; we mark the current transcript
    turn index. Post-session, the bookmarked turns are surfaced first in
    the review panel ("you flagged 3 moments").
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="speaking_bookmarks")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    session = models.ForeignKey(
        "SpeakingSession", on_delete=models.CASCADE, related_name="bookmarks",
    )
    transcript_index = models.IntegerField(help_text="Index into session.transcript at the time of bookmark.")
    note = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "practice_session_bookmark"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["session", "created_at"]),
            models.Index(fields=["user", "-created_at"]),
        ]


class CueCardConsumption(models.Model):
    """Per-(user, cue_card) usage stamp (F8).

    Powers the `?fresh=true` filter on cue-card endpoints — a card is
    "fresh" if the user hasn't used it in the last 30 days. Append-only;
    re-using a card creates a new row so we can show usage history.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="cue_card_uses")
    cue_card = models.ForeignKey("CueCard", on_delete=models.CASCADE, related_name="consumptions")
    speaking_session = models.ForeignKey(
        "SpeakingSession", on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    used_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "practice_cue_card_consumption"
        ordering = ["-used_at"]
        indexes = [
            models.Index(fields=["user", "-used_at"]),
            models.Index(fields=["user", "cue_card"]),
        ]


class VoiceJournalEntry(models.Model):
    """Free-talk speaking entry (Hard 8) — separate from test-format SpeakingSession.

    No rubric grading; just transcript + lexical/fluency stats. The
    captured speech feeds vocabulary tracking and accumulates as
    high-value training data over time.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="voice_journal_entries")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    prompt = models.CharField(max_length=300, blank=True, default="", help_text="Daily rotating prompt or empty for free talk.")
    duration_seconds = models.PositiveIntegerField(default=0)
    transcript = models.TextField(blank=True)
    fluency_metrics = models.JSONField(null=True, blank=True)
    # One-line lexical observation surfaced back to the student.
    lexical_note = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "practice_voice_journal_entry"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
        ]


class PartnerOptIn(models.Model):
    """Per-user consent + preferences for study-partner matching (Hard 5).

    Matching is institute-scoped by default; cross-institute requires
    explicit `cross_institute_ok=True`. Without an opt-in row, the user is
    invisible to matching.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField("accounts.User", on_delete=models.CASCADE, related_name="partner_opt_in")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    is_active = models.BooleanField(default=True, db_index=True)
    cross_institute_ok = models.BooleanField(default=False)
    # Display name to share with partner — defaults to first-name / blank.
    display_name = models.CharField(max_length=80, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "practice_partner_opt_in"


class PartnerSuggestion(models.Model):
    """A suggested pairing surfaced once per week (Hard 5).

    Append-only: every weekly evaluation can produce a new suggestion. The
    `accepted_at` and `dismissed_at` columns record the user's response.
    Mirrored row for the OTHER party — both users see the suggestion.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="partner_suggestions")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    partner = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="+")
    similarity_score = models.FloatField(help_text="0..1; higher = more lexically similar.")
    target_band_delta = models.FloatField(help_text="Absolute difference in target_score.")
    suggested_task = models.TextField(blank=True, help_text="One concrete shared task for the week.")
    accepted_at = models.DateTimeField(null=True, blank=True)
    dismissed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "practice_partner_suggestion"
        ordering = ["-created_at"]


class FeedbackVote(models.Model):
    """Student vote on a piece of AI feedback (UI 5 / Hard 3 RLHF foundation).

    Captures (agent, criterion, helpful/not) plus an optional reason code +
    free-text for "not helpful" votes. Aggregated by Hard 3 to surface
    prompt-quality regressions per agent + criterion.

    Stored append-only; the act of voting again on the same target id
    creates a new row so we keep the time series.
    """

    REASON_NONE = ""
    REASON_WRONG_BAND = "wrong_band"
    REASON_MISSED_ERRORS = "missed_errors"
    REASON_TOO_GENERIC = "too_generic"
    REASON_OTHER = "other"
    REASON_CHOICES = [
        (REASON_NONE, ""),
        (REASON_WRONG_BAND, "Wrong band"),
        (REASON_MISSED_ERRORS, "Missed errors"),
        (REASON_TOO_GENERIC, "Too generic"),
        (REASON_OTHER, "Other"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="feedback_votes")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    # Identifies which AI output this vote is about. agent ∈ writing_eval,
    # speaking_analysis, weakness_analysis, study_plan, etc. criterion is
    # optional (e.g. lexicalResource).
    agent = models.CharField(max_length=64, db_index=True)
    criterion = models.CharField(max_length=64, blank=True, default="", db_index=True)
    target_id = models.UUIDField(
        null=True, blank=True,
        help_text="Session id / row id the feedback came from. Optional.",
    )
    helpful = models.BooleanField(db_index=True)
    reason = models.CharField(max_length=32, choices=REASON_CHOICES, blank=True, default="")
    note = models.TextField(blank=True, max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "practice_feedback_vote"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["agent", "-created_at"]),
            models.Index(fields=["institute", "-created_at"]),
        ]


class TargetBandHistory(models.Model):
    """Append-only log of target_score changes per user (Hard 2).

    The auto-tuner suggests an increment when the student consistently
    exceeds their target; the user accepts/declines, and we record the
    decision either way for the future audit trail. Manual edits via the
    profile UI also write here.
    """

    SOURCE_ONBOARDING = "onboarding"
    SOURCE_MANUAL = "manual"
    SOURCE_AUTO_TUNER = "auto_tuner"
    SOURCE_CHOICES = [
        (SOURCE_ONBOARDING, "Onboarding"),
        (SOURCE_MANUAL, "Manual"),
        (SOURCE_AUTO_TUNER, "Auto-tuner"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="target_band_history")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    previous_target = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    new_target = models.DecimalField(max_digits=3, decimal_places=1)
    source = models.CharField(max_length=16, choices=SOURCE_CHOICES)
    accepted = models.BooleanField(default=True, help_text="False if the auto-tuner suggested but the user declined.")
    rationale = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "practice_target_band_history"
        ordering = ["-created_at"]


class TutorProfile(models.Model):
    """Live tutor for the marketplace (T3#13).

    Institute-managed: institute admins onboard their own tutors. Each
    tutor lists hourly rate, languages, specialities, availability JSON.
    Bookings ride on TutorBooking. Payment routing (Stripe Connect) is
    intentionally NOT modelled here — the booking row carries
    `payment_intent_id` and `marker_payout_id` placeholders for the
    eventual cutover.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="tutor_profiles")
    user = models.OneToOneField("accounts.User", on_delete=models.CASCADE, related_name="tutor_profile")
    bio = models.TextField(blank=True)
    hourly_rate_cents = models.PositiveIntegerField(default=0, help_text="Listed rate; payment is stubbed.")
    currency = models.CharField(max_length=3, default="USD")
    languages = models.JSONField(default=list, blank=True, help_text="ISO codes the tutor teaches in.")
    specialities = models.JSONField(default=list, blank=True, help_text="e.g. ['speaking-part-2','task-2-essays']")
    availability = models.JSONField(default=dict, blank=True, help_text="Day-of-week → list of [start,end] hour pairs.")
    rating_avg = models.FloatField(null=True, blank=True)
    rating_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "practice_tutor_profile"
        ordering = ["-rating_avg", "-created_at"]


class TutorBooking(models.Model):
    """One booked session between a student and a tutor (T3#13).

    Payment, payouts, refunds are stubbed: the columns exist so the live
    integration can land without a schema change, but the platform does
    NOT charge cards yet. Hooks into the existing speaking-session infra
    when status flips to LIVE.
    """

    STATUS_REQUESTED = "requested"
    STATUS_CONFIRMED = "confirmed"
    STATUS_LIVE = "live"
    STATUS_COMPLETED = "completed"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = [
        (STATUS_REQUESTED, "Requested"),
        (STATUS_CONFIRMED, "Confirmed"),
        (STATUS_LIVE, "Live"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    student = models.ForeignKey(
        "accounts.User", on_delete=models.CASCADE, related_name="tutor_bookings_made",
    )
    tutor = models.ForeignKey(
        TutorProfile, on_delete=models.CASCADE, related_name="bookings",
    )
    scheduled_for = models.DateTimeField(db_index=True)
    duration_minutes = models.PositiveIntegerField(default=30)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_REQUESTED, db_index=True)
    speaking_session = models.ForeignKey(
        "SpeakingSession", on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        help_text="Filled when the booking goes LIVE and a speaking session row is created.",
    )
    rate_cents = models.PositiveIntegerField(default=0)
    currency = models.CharField(max_length=3, default="USD")
    # Reserved for Stripe Connect cutover.
    payment_intent_id = models.CharField(max_length=120, blank=True, default="")
    marker_payout_id = models.CharField(max_length=120, blank=True, default="")
    paid_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    student_notes = models.TextField(blank=True)
    tutor_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "practice_tutor_booking"
        ordering = ["-scheduled_for"]
        indexes = [
            models.Index(fields=["tutor", "scheduled_for"]),
            models.Index(fields=["student", "-scheduled_for"]),
        ]


class MockTestBankItem(models.Model):
    """One pre-generated mock test in the AI-authored bank (T3#14).

    Lets us compete with "100 real questions" claims through scale rather
    than authority — the bank can grow indefinitely via the
    `generate_mock_test_bank` management command. Each row carries the
    full payload (passage/script/questions or writing prompt) plus the
    topic taxonomy + target band so the FE can filter.

    Rows are NOT tenant-scoped — the bank is platform-wide.
    """

    SKILL_CHOICES = [
        ("reading", "Reading"),
        ("listening", "Listening"),
        ("writing", "Writing"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    skill = models.CharField(max_length=10, choices=SKILL_CHOICES, db_index=True)
    topic = models.CharField(max_length=40, db_index=True)
    target_band = models.DecimalField(max_digits=3, decimal_places=1, default=7.0)
    payload = models.JSONField(help_text="Full test payload — same shape the FE expects from the live agent.")
    created_at = models.DateTimeField(auto_now_add=True)
    used_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "practice_mock_test_bank_item"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["skill", "topic"]),
        ]


class DebateRoom(models.Model):
    """Group speaking practice room for matched peers (T2#10).

    Two-3 students debate a Part-3-style topic with the AI as moderator.
    The room is created via the matching service when N students with
    similar target bands queue up. Real-time audio routing rides on top
    of the existing Gemini Live infra (each participant gets ephemeral
    creds); this row stores the SHARED state (topic, transcript by turn,
    moderator notes, post-debate band per participant).
    """

    STATUS_WAITING = "waiting"
    STATUS_LIVE = "live"
    STATUS_COMPLETED = "completed"
    STATUS_ABORTED = "aborted"
    STATUS_CHOICES = [
        (STATUS_WAITING, "Waiting"),
        (STATUS_LIVE, "Live"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_ABORTED, "Aborted"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    topic = models.CharField(max_length=400)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_WAITING, db_index=True)
    target_band = models.DecimalField(
        max_digits=3, decimal_places=1, default=7.0,
        help_text="Average target band of participants — used by matching.",
    )
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    transcript = models.JSONField(default=list, blank=True)
    moderator_notes = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "practice_debate_room"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["institute", "status"]),
        ]


class DebateParticipant(models.Model):
    """One row per (room, user). Holds the per-participant outcome."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.ForeignKey(DebateRoom, on_delete=models.CASCADE, related_name="participants")
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="debate_seats")
    joined_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)
    band_score = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    feedback = models.JSONField(default=dict, blank=True)
    # Compared against the participant's recent solo-speaking band so the
    # post-debate strip can show the delta.
    solo_baseline_band = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)

    class Meta:
        db_table = "practice_debate_participant"
        constraints = [
            models.UniqueConstraint(fields=["room", "user"], name="unique_debate_seat"),
        ]


class ReviewRequest(models.Model):
    """Human-grading request for a writing or speaking session.

    Pro-Plus tier add-on (T2#7). A student queues a session for human
    examiner review with an SLA (default 48h). An institute-managed
    marketplace of approved markers picks up the request, completes the
    review, and submits a grade + notes. Payment routing is intentionally
    stubbed at the model layer (`paid_at`, `payment_intent_id`) so the
    integration with Stripe Connect / similar can land later without a
    schema change.
    """

    SESSION_TYPE_CHOICES = [
        ("writing", "Writing"),
        ("speaking", "Speaking"),
    ]
    STATUS_QUEUED = "queued"
    STATUS_CLAIMED = "claimed"
    STATUS_COMPLETED = "completed"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = [
        (STATUS_QUEUED, "Queued"),
        (STATUS_CLAIMED, "Claimed"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="review_requests")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    session_type = models.CharField(max_length=10, choices=SESSION_TYPE_CHOICES)
    session_id = models.UUIDField(db_index=True)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_QUEUED, db_index=True)
    sla_due_at = models.DateTimeField()
    student_notes = models.TextField(blank=True, help_text="Optional: what the student wants the marker to focus on.")
    marker = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="claimed_reviews",
    )
    claimed_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    marker_band_score = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    marker_notes = models.TextField(blank=True)
    # Payment integration is deferred. These columns are reserved so the
    # marketplace ships without a schema change when wired.
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_intent_id = models.CharField(max_length=120, blank=True, default="")
    # Soft-cancellation audit so we keep the record.
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "practice_review_request"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["institute", "status", "sla_due_at"]),
            models.Index(fields=["user", "-created_at"]),
        ]


class Badge(models.Model):
    """Earned achievement. Append-only — earning the same badge twice is
    impossible (unique constraint), so the row IS the proof.

    Codes are namespaced strings, e.g. 'streak_7', 'streak_30',
    'calibration_within_half', 'mock_test_complete', 'b2_vocab_500'.
    Keeping them as strings (not enum) so new badges can ship without a
    migration.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="badges")
    institute = models.ForeignKey("tenants.Institute", on_delete=models.CASCADE, related_name="+")
    code = models.CharField(max_length=64, db_index=True)
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    awarded_at = models.DateTimeField(auto_now_add=True)
    payload = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "practice_badge"
        ordering = ["-awarded_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "code"], name="unique_badge_per_user"),
        ]
        indexes = [
            models.Index(fields=["user", "-awarded_at"]),
        ]


