"""Smoke + regression tests for `apps.ai.context.StudentContext`.

These tests are the safety net for the agent-collaboration feature — they
lock down (a) that an empty user produces an empty prompt block (no token
waste), (b) that a populated user surfaces weaknesses/topics/vocab in the
right focus slices, and (c) that the WeaknessAnalysisCache.analysis shape
is read with the keys the schema actually produces (this was the bug the
re-audit caught).

No Gemini calls — these tests construct DB rows and inspect the assembled
context object directly.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.ai.context import (
    StudentContext,
    _extract_weakness_summaries,
    build_for_user,
)
from apps.practice.models import (
    ErrorCard,
    ListeningSession,
    ReadingSession,
    SpeakingSession,
    VocabularyObservation,
    WeaknessAnalysisCache,
    WritingSession,
)
from apps.tenants.models import Institute, InstituteSettings


@pytest.fixture
def institute(db):
    inst = Institute.objects.create(name="Default", slug="default")
    InstituteSettings.objects.create(institute=inst)
    return inst


@pytest.fixture
def fresh_student(institute):
    return User.objects.create_user(
        email="alice@example.com", password="x", institute=institute,
    )


@pytest.fixture
def populated_student(institute):
    user = User.objects.create_user(
        email="bob@example.com", password="x", institute=institute,
        target_score=Decimal("7.5"), native_language="hi",
        english_proficiency_level="upper_intermediate",
    )

    # Cached writing weakness analysis using the AUTHORITATIVE schema shape.
    WeaknessAnalysisCache.objects.create(
        user=user, institute=institute,
        skill=WeaknessAnalysisCache.SKILL_WRITING,
        analysis={
            "recurringWeaknesses": [
                {"weakness": "Inconsistent article use", "suggestion": "Practise definites"},
                {"weakness": "Tense agreement drift", "suggestion": "Drill past perfect"},
            ],
        },
        expires_at=timezone.now() + timedelta(days=5),
    )

    # Recent sessions across all skills.
    WritingSession.objects.create(
        user=user, institute=institute, prompt="x", essay="y" * 60,
        band_score=Decimal("6.5"), feedback={},
    )
    SpeakingSession.objects.create(
        user=user, institute=institute,
        analysis={"overallBandScore": 6.5, "fluencyAndCoherence": {}},
    )
    ReadingSession.objects.create(
        user=user, institute=institute, score=8, total_questions=10,
        passage_title="Renewable energy in Iceland", band_score=Decimal("7.0"),
    )
    ListeningSession.objects.create(
        user=user, institute=institute, score=7, total_questions=10,
        title="University library tour", band_score=Decimal("6.5"),
    )

    # Vocabulary: one B2+ word, one B1 reinforcement candidate.
    VocabularyObservation.objects.create(
        user=user, institute=institute, lemma="ubiquitous",
        cefr_level="C1", frequency=2,
    )
    VocabularyObservation.objects.create(
        user=user, institute=institute, lemma="paramount",
        cefr_level="B2", frequency=1,
    )

    # Active SRS error card.
    ErrorCard.objects.create(
        user=user, institute=institute,
        source_session_type="writing", source_session_id=user.id,
        category=ErrorCard.CATEGORY_GRAMMAR,
        error_text="he go to school every day",
        correction_text="he goes to school every day",
        due_at=timezone.now() + timedelta(days=1),
    )

    return user


# ----- Extractor regression: the bug the re-audit caught ----- #

def test_extractor_reads_authoritative_schema_keys():
    """The WEAKNESS_ANALYSIS_SCHEMA produces `recurringWeaknesses[].weakness`.
    Earlier code looked for `weaknesses[].summary` and silently returned []."""
    blob = {
        "recurringWeaknesses": [
            {"weakness": "Article use", "suggestion": "drill"},
            {"weakness": "Tenses", "suggestion": "drill"},
        ],
    }
    out = _extract_weakness_summaries(blob)
    assert out == ["Article use", "Tenses"]


def test_extractor_tolerates_legacy_shape():
    """If a stale cache row was written under an older shape we still succeed."""
    blob = {"weaknesses": [{"summary": "legacy summary text"}]}
    assert _extract_weakness_summaries(blob) == ["legacy summary text"]


def test_extractor_tolerates_garbage():
    assert _extract_weakness_summaries(None) == []
    assert _extract_weakness_summaries("not a dict") == []
    assert _extract_weakness_summaries({"recurringWeaknesses": "not a list"}) == []
    assert _extract_weakness_summaries({"recurringWeaknesses": [None, 42, {}]}) == []


# ----- Empty-context contract ----- #

def test_fresh_student_produces_empty_prompt_block(fresh_student):
    """A brand-new student with default target band + no L1 + no sessions
    must NOT add a STUDENT CONTEXT block to prompts — that would burn tokens
    while teaching the model nothing."""
    ctx = build_for_user(fresh_student)
    assert ctx.is_empty() is True
    assert ctx.prompt_block(focus="writing") == ""
    assert ctx.prompt_block(focus="general") == ""


def test_target_band_alone_renders_block(institute):
    """A student who set a non-default target band but has no other state
    should still get a context block — knowing their target is non-zero info."""
    u = User.objects.create_user(
        email="t@example.com", password="x", institute=institute,
        target_score=Decimal("8.5"),
    )
    ctx = build_for_user(u)
    block = ctx.prompt_block(focus="writing")
    assert "8.5" in block
    assert "STUDENT CONTEXT" in block


# ----- Build-for-user end-to-end ----- #

def test_populated_student_surfaces_weaknesses(populated_student):
    ctx = build_for_user(populated_student)
    assert ctx.target_band == 7.5
    assert ctx.native_language == "hi"
    assert "Inconsistent article use" in ctx.writing_weaknesses
    assert "Tense agreement drift" in ctx.writing_weaknesses


def test_populated_student_surfaces_topics_and_bands(populated_student):
    ctx = build_for_user(populated_student)
    assert "Renewable energy in Iceland" in ctx.recent_reading_topics
    assert "University library tour" in ctx.recent_listening_topics
    assert ctx.recent_reading_band == 7.0
    assert ctx.recent_listening_band == 6.5
    assert ctx.recent_writing_band == 6.5
    assert ctx.recent_speaking_band == 6.5


def test_populated_student_surfaces_vocab(populated_student):
    ctx = build_for_user(populated_student)
    # One B2+ word counted (ubiquitous=C1, paramount=B2 → 2 advanced words).
    assert ctx.advanced_vocab_count == 2
    # paramount has frequency=1 + B2 → reinforcement target. ubiquitous is
    # frequency=2 so not a reinforcement candidate.
    assert "paramount" in ctx.target_vocab_lemmas
    assert "ubiquitous" not in ctx.target_vocab_lemmas


def test_populated_student_surfaces_error_cards(populated_student):
    ctx = build_for_user(populated_student)
    assert ErrorCard.CATEGORY_GRAMMAR in ctx.active_error_categories
    assert any("he go to school" in p for p in ctx.sample_error_patterns)


# ----- prompt_block focus filtering ----- #

def test_focus_filters_emphasise_correct_signals(populated_student):
    ctx = build_for_user(populated_student)

    writing_block = ctx.prompt_block(focus="writing")
    speaking_block = ctx.prompt_block(focus="speaking")
    reading_block = ctx.prompt_block(focus="reading")
    quiz_block = ctx.prompt_block(focus="quiz")

    # Writing focus surfaces writing weaknesses and target vocab.
    assert "Recurring writing weaknesses" in writing_block
    assert "Target vocabulary to reinforce" in writing_block
    # Speaking focus does NOT surface writing weaknesses (those are not
    # relevant to a speaking analyzer's prompt).
    assert "Recurring writing weaknesses" not in speaking_block
    # Reading focus surfaces recent reading band, not advanced vocab counts.
    assert "Recent reading band" in reading_block
    assert "Advanced (B2+) unique vocabulary" not in reading_block
    # Quiz focus surfaces error categories + target vocab (its bread + butter).
    assert "Active error categories" in quiz_block
    assert "Target vocabulary to reinforce" in quiz_block


def test_l1_suppression_for_speaking_system_prompt(populated_student):
    """build_speaking_system_instruction injects its own L1 hint, so the
    ctx block must not also include one when called with suppress_l1=True."""
    ctx = build_for_user(populated_student)
    block_with_l1 = ctx.prompt_block(focus="speaking", suppress_l1=False)
    block_without_l1 = ctx.prompt_block(focus="speaking", suppress_l1=True)
    assert "L1 (first language)" in block_with_l1
    assert "L1 (first language)" not in block_without_l1
    # Other signals must still be present in the suppressed version.
    assert "Target IELTS band" in block_without_l1


# ----- Cross-tenant isolation ----- #

def test_other_users_data_does_not_leak(populated_student, institute):
    """A separate user in the same institute must not pick up populated_student's
    weaknesses, sessions, or vocab."""
    other = User.objects.create_user(
        email="other@example.com", password="x", institute=institute,
    )
    ctx = build_for_user(other)
    assert ctx.writing_weaknesses == []
    assert ctx.recent_reading_topics == []
    assert ctx.advanced_vocab_count == 0
    assert ctx.active_error_categories == []
