"""Tests for the auto error-card extractor.

Locks down: correct category mapping, dedup against existing active cards,
the 2-card-per-session cap, malformed-feedback safety, vocabularyEnhancements
correction-text pre-fill, pronunciation analysis path.
"""

from __future__ import annotations

import uuid

import pytest

from apps.accounts.models import User
from apps.practice.models import ErrorCard
from apps.practice.services.error_cards import (
    MAX_CARDS_PER_SESSION,
    extract_from_speaking_analysis,
    extract_from_writing_feedback,
)
from apps.tenants.models import Institute, InstituteSettings


@pytest.fixture
def institute(db):
    inst = Institute.objects.create(name="Default", slug="default")
    InstituteSettings.objects.create(institute=inst)
    return inst


@pytest.fixture
def student(institute):
    return User.objects.create_user(
        email="alice@example.com", password="x", institute=institute,
    )


def _writing_feedback_with(*, criterion: str, sentences: list[str], text: str = "Detailed."):
    return {
        "bandScore": 6.5,
        "feedback": {
            criterion: {
                "text": text,
                "relevantSentences": sentences,
                "exampleSentences": [],
            },
        },
        "suggestions": [],
    }


# ----- Writing extraction ----- #

def test_writing_creates_card_for_grammar_relevant_sentence(student, institute):
    fb = _writing_feedback_with(
        criterion="grammaticalRangeAndAccuracy",
        sentences=["The students was happy because he go home."],
        text="Subject-verb agreement issue",
    )
    cards = extract_from_writing_feedback(
        user=student, institute=institute, session_id=uuid.uuid4(), feedback=fb,
    )
    assert len(cards) == 1
    assert cards[0].category == ErrorCard.CATEGORY_GRAMMAR
    assert "students was happy" in cards[0].error_text
    assert cards[0].explanation == "Subject-verb agreement issue"


def test_writing_maps_each_criterion_to_correct_category(student, institute):
    cases = [
        ("taskAchievement", ErrorCard.CATEGORY_TASK),
        ("coherenceAndCohesion", ErrorCard.CATEGORY_COHERENCE),
        ("lexicalResource", ErrorCard.CATEGORY_LEXICAL),
        ("grammaticalRangeAndAccuracy", ErrorCard.CATEGORY_GRAMMAR),
    ]
    for crit, expected_cat in cases:
        fb = _writing_feedback_with(
            criterion=crit,
            sentences=[f"Quote testing {crit} mapping behaviour."],
        )
        cards = extract_from_writing_feedback(
            user=student, institute=institute, session_id=uuid.uuid4(), feedback=fb,
        )
        assert len(cards) == 1, f"{crit} produced no card"
        assert cards[0].category == expected_cat, f"{crit} mapped to wrong category"


def test_writing_skips_short_sentences(student, institute):
    fb = _writing_feedback_with(
        criterion="grammaticalRangeAndAccuracy",
        sentences=["Too short."],
    )
    cards = extract_from_writing_feedback(
        user=student, institute=institute, session_id=uuid.uuid4(), feedback=fb,
    )
    assert cards == []


def test_writing_dedups_against_existing_card(student, institute):
    sid = uuid.uuid4()
    ErrorCard.objects.create(
        user=student, institute=institute,
        source_session_type="writing", source_session_id=sid,
        category=ErrorCard.CATEGORY_GRAMMAR,
        error_text="The students was happy because he go home.",
        due_at="2026-01-01T00:00:00Z",
    )
    fb = _writing_feedback_with(
        criterion="grammaticalRangeAndAccuracy",
        sentences=["The students was happy because he go home."],
    )
    cards = extract_from_writing_feedback(
        user=student, institute=institute, session_id=uuid.uuid4(), feedback=fb,
    )
    assert cards == []  # already exists


def test_writing_caps_at_max_per_session(student, institute):
    fb = {
        "bandScore": 5.0,
        "feedback": {
            "taskAchievement": {
                "text": "TA",
                "relevantSentences": ["Sentence one with enough characters."],
            },
            "coherenceAndCohesion": {
                "text": "CC",
                "relevantSentences": ["Sentence two with enough characters."],
            },
            "lexicalResource": {
                "text": "LR",
                "relevantSentences": ["Sentence three with enough characters."],
            },
            "grammaticalRangeAndAccuracy": {
                "text": "GR",
                "relevantSentences": ["Sentence four with enough characters."],
            },
        },
        "suggestions": [],
    }
    cards = extract_from_writing_feedback(
        user=student, institute=institute, session_id=uuid.uuid4(), feedback=fb,
    )
    assert len(cards) == MAX_CARDS_PER_SESSION


def test_writing_prefills_correction_from_vocab_enhancement(student, institute):
    sentence = "He utilises rudimentary language patterns frequently."
    fb = {
        "bandScore": 6.0,
        "feedback": {
            "lexicalResource": {
                "text": "Could elevate vocabulary",
                "relevantSentences": [sentence],
            },
        },
        "suggestions": [],
        "vocabularyEnhancements": [
            {
                "originalSentence": sentence,
                "suggestedSentence": "He routinely employs basic linguistic patterns.",
            },
        ],
    }
    cards = extract_from_writing_feedback(
        user=student, institute=institute, session_id=uuid.uuid4(), feedback=fb,
    )
    assert len(cards) == 1
    assert "routinely employs" in cards[0].correction_text


def test_writing_handles_garbage_feedback(student, institute):
    """Malformed feedback must NEVER raise — it would block the writing-eval
    response that already returned successfully."""
    for bad in [None, "string", 42, [], {"wrong": "shape"}, {"feedback": "not a dict"}]:
        cards = extract_from_writing_feedback(
            user=student, institute=institute, session_id=uuid.uuid4(), feedback=bad,
        )
        assert cards == []


# ----- Speaking extraction ----- #

def test_speaking_creates_card_per_criterion_example(student, institute):
    analysis = {
        "overallBandScore": 6.5,
        "fluencyAndCoherence": {
            "feedback": "Hesitations break the flow.",
            "example": "I uh think that umm probably yes.",
        },
        "lexicalResource": {
            "feedback": "Limited range.",
            "example": "It is good and it is nice and it is fun.",
        },
        "grammaticalRangeAndAccuracy": {"feedback": "ok", "example": "short"},  # < 12 chars: skipped
        "pronunciation": {"feedback": "ok", "example": "skipped too"},  # < 12 chars: skipped
    }
    cards = extract_from_speaking_analysis(
        user=student, institute=institute, session_id=uuid.uuid4(), analysis=analysis,
    )
    cats = {c.category for c in cards}
    assert ErrorCard.CATEGORY_FLUENCY in cats
    assert ErrorCard.CATEGORY_LEXICAL in cats


def test_speaking_extracts_pronunciation_analysis(student, institute):
    analysis = {
        "overallBandScore": 6.0,
        "fluencyAndCoherence": {"feedback": "ok", "example": ""},
        "lexicalResource": {"feedback": "ok", "example": ""},
        "grammaticalRangeAndAccuracy": {"feedback": "ok", "example": ""},
        "pronunciation": {"feedback": "ok", "example": ""},
        "pronunciationAnalysis": {
            "targetPhoneme": "θ",
            "problemWords": ["think", "three", "throat"],
            "explanation": "Substituting /s/ for /θ/",
        },
    }
    cards = extract_from_speaking_analysis(
        user=student, institute=institute, session_id=uuid.uuid4(), analysis=analysis,
    )
    assert len(cards) == 1
    assert cards[0].category == ErrorCard.CATEGORY_PRONUNCIATION
    assert "/θ/" in cards[0].error_text
    assert "think" in cards[0].error_text


def test_speaking_caps_at_max_per_session(student, institute):
    analysis = {
        "fluencyAndCoherence": {"feedback": "x", "example": "Fluency example sentence one."},
        "lexicalResource": {"feedback": "x", "example": "Lexical example sentence two."},
        "grammaticalRangeAndAccuracy": {"feedback": "x", "example": "Grammar example sentence three."},
        "pronunciation": {"feedback": "x", "example": "Pronunciation example sentence four."},
    }
    cards = extract_from_speaking_analysis(
        user=student, institute=institute, session_id=uuid.uuid4(), analysis=analysis,
    )
    assert len(cards) == MAX_CARDS_PER_SESSION


def test_speaking_handles_garbage_analysis(student, institute):
    for bad in [None, "string", 42, [], {"wrong": "shape"}]:
        cards = extract_from_speaking_analysis(
            user=student, institute=institute, session_id=uuid.uuid4(), analysis=bad,
        )
        assert cards == []


# ----- Closes-the-loop integration with StudentContext ----- #

def test_extracted_cards_feed_student_context(student, institute):
    """The whole point: extracted cards must surface in StudentContext so the
    next AI agent call sees the student's actual recurring patterns."""
    from apps.ai.context import build_for_user

    fb = _writing_feedback_with(
        criterion="grammaticalRangeAndAccuracy",
        sentences=["The students was happy because he go home."],
    )
    extract_from_writing_feedback(
        user=student, institute=institute, session_id=uuid.uuid4(), feedback=fb,
    )
    ctx = build_for_user(student)
    assert ErrorCard.CATEGORY_GRAMMAR in ctx.active_error_categories
    assert any("students was happy" in p for p in ctx.sample_error_patterns)
