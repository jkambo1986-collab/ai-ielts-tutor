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
    MODE_CHOICES = [
        (MODE_STANDARD, "Standard"),
        (MODE_ROLEPLAY, "Role Play"),
        (MODE_MOCK, "Mock Test"),
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


