"""
Python ports of every exported function in services/geminiService.ts.

Naming: snake_case, otherwise 1:1 with the TS export. Same prompt content,
same JSON schema, same response shape. The frontend will receive identical
JSON payloads to those it gets today, so the React components don't need
any change beyond swapping the HTTP layer.

The Live API (real-time speaking) is NOT included here — it's handled by
mint_live_session_token() and the client connects directly to Gemini.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from apps.ai import schemas
from apps.ai.client import get_client
from apps.ai.context import StudentContext
from apps.ai.exceptions import AIError

log = logging.getLogger(__name__)


# -- Helpers -- #

def _ctx_block(ctx: Optional[StudentContext], focus: str = "general") -> str:
    """Render a `StudentContext` slice as a prompt fragment (or empty string).

    Agents call this once and splice the result into their prompt — usually
    right after the system directive, before the task-specific input. When
    `ctx` is None or empty, returns "" so the prompt is unchanged.
    """
    if ctx is None:
        return ""
    block = ctx.prompt_block(focus=focus)
    return f"\n\n{block}\n" if block else ""


def _target_score_clause(target_score: Optional[float], variant: str = "writing") -> str:
    if not target_score:
        return ""
    if variant == "writing":
        return (
            f"The user's target band score is {target_score}. Please adjust the strictness "
            f"of your feedback and the complexity of vocabulary suggestions to be appropriate "
            f"for a student aiming for this score. For a high target (7.5+), be more critical "
            f"and focus on nuanced errors and advanced language. For a lower target (<6.5), "
            f"focus on more fundamental errors in grammar and structure."
        )
    return (
        f"The user is aiming for a band score of {target_score}. Please generate content of "
        f"a difficulty level appropriate for a student at this level."
    )


# -- Writing -- #

def evaluate_writing(
    prompt: str,
    essay: str,
    target_score: Optional[float],
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    target_clause = _target_score_clause(target_score, variant="writing")
    context_block = _ctx_block(ctx, focus="writing")
    full_prompt = f"""You are an expert IELTS examiner and language coach. Evaluate the following essay based on the provided prompt. {target_clause}{context_block}
1.  Provide a detailed, constructive analysis for each of the four official IELTS assessment criteria. For each criterion, identify and quote specific sentences from the user's essay that your feedback is based on (as 'relevantSentences'). If a piece of feedback is about something missing or cannot be tied to a specific sentence, provide a generic example sentence to illustrate your point (as 'exampleSentences'). Prioritize using 'relevantSentences' wherever possible. When the student has recurring weaknesses listed in the STUDENT CONTEXT, prioritise feedback that addresses those patterns.
2.  Assign an overall band score.
3.  Offer specific, actionable suggestions for improvement.
4.  As a language coach, identify 3-5 sentences that are grammatically correct but could be rephrased with more advanced, topic-specific, or idiomatic vocabulary to achieve a higher band score. If target vocabulary is listed in the STUDENT CONTEXT, prefer suggestions that reinforce those lemmas.
5.  Respond ONLY in the requested JSON format.

IELTS Writing Task 2 Prompt: "{prompt}"

User's Essay:
"{essay}\""""
    return get_client().generate_json(full_prompt, schemas.WRITING_FEEDBACK_SCHEMA)


def generate_essay_plan(
    prompt: str,
    user_ideas: str,
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    context_block = _ctx_block(ctx, focus="writing")
    full_prompt = f"""You are an expert IELTS writing coach. A student needs help planning their Task 2 essay. Based on the prompt and their initial ideas, generate a clear, logical essay plan. The plan should include a strong thesis statement and 2-3 body paragraphs, each with a clear main point and supporting examples. If the STUDENT CONTEXT lists recurring weaknesses or target vocabulary, weave the plan so that the eventual essay naturally exercises them.{context_block}

Respond ONLY in the requested JSON format.

IELTS Prompt: "{prompt}"

Student's Initial Ideas: "{user_ideas}\""""
    return get_client().generate_json(full_prompt, schemas.ESSAY_PLAN_SCHEMA)


def analyze_cohesion(
    prompt: str,
    essay: str,
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    context_block = _ctx_block(ctx, focus="writing")
    full_prompt = f"""You are an expert in academic writing structure and logic. Your task is to analyze the following essay and deconstruct it into a logical map of ideas. Identify the core thesis, the main point of each body paragraph, and the key supporting points for each main idea. Then, evaluate the cohesive links between these ideas.{context_block}

1.  **Nodes Identification**:
    *   Identify the single main **thesis statement**.
    *   For each body paragraph, identify the single **mainPoint** (topic sentence).
    *   For each mainPoint, identify 1-2 key **supportingPoints**.
    *   Represent each of these ideas as a 'node' object. Quote the original sentence exactly.

2.  **Links Evaluation**:
    *   Analyze the transitions between the thesis and each main point, and between each main point and its supporting points.
    *   Create 'link' objects for these connections.
    *   Assess the 'strength' of each link:
        *   **strong**: Clear, logical transition with effective language (e.g., "Consequently," "In contrast").
        *   **weak**: Abrupt transition, basic conjunction (e.g., "And," "Also"), or unclear connection.
        *   **missing**: No transition where one is needed.
    *   Provide a concise, helpful 'explanation' offering specific suggestions for improvement if weak or missing.
    *   Identify the 'linkingPhrase' if one is used.

Respond ONLY in the requested JSON format.

IELTS Prompt: "{prompt}"

User's Essay:
"{essay}\""""
    return get_client().generate_json(full_prompt, schemas.COHESION_MAP_SCHEMA)


# -- Reading / Listening -- #

_READING_TYPE_INSTRUCTIONS = {
    "Short Passage": "Generate an academic reading passage of about 200-250 words and 2-3 multiple-choice questions. This is for a quick practice session.",
    "Vocabulary Focus": "Generate an academic reading passage of about 300 words. Then, create 3-4 multiple-choice questions that specifically test the understanding of advanced vocabulary (e.g., synonyms, word meaning in context) found within the passage.",
    "Full Passage": "Generate a full-length academic reading passage of about 350-450 words and 4-5 multiple-choice questions based on it. The style should be very similar to an official IELTS test.",
}

_LISTENING_TYPE_INSTRUCTIONS = {
    "Monologue": "The test should consist of a monologue from a single speaker on a topic like a personal experience, a guided tour, or a description of an event. The total script should be around 250-350 words.",
    "Lecture": "The test should consist of a short academic lecture from a single speaker on a topic like science, history, or art. The total script should be around 350-450 words and have a more formal, academic tone, similar to IELTS Part 4.",
    "Dialogue": "The test should consist of a short dialogue between two speakers on a common topic like university life, travel, or hobbies. The total script should be around 250-350 words.",
}


def generate_reading_test(
    target_score: Optional[float],
    test_type: str,
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    type_instr = _READING_TYPE_INSTRUCTIONS.get(test_type, _READING_TYPE_INSTRUCTIONS["Full Passage"])
    target_clause = _target_score_clause(target_score, variant="reading")
    context_block = _ctx_block(ctx, focus="reading")
    full_prompt = (
        f"You are an expert IELTS content creator. {type_instr} {target_clause} "
        f"The topic should be academic and engaging, related to science, technology, or the environment. "
        f"If the STUDENT CONTEXT lists recently read topics, AVOID overlapping with them — choose a fresh adjacent topic. "
        f"If target vocabulary is listed, naturally include 3-5 of those lemmas in the passage so the student gets repeat exposure. "
        f"Ensure the questions test a range of reading skills. Respond in the requested JSON format."
        f"{context_block}"
    )
    return get_client().generate_json(full_prompt, schemas.READING_TEST_SCHEMA)


def generate_listening_test(
    target_score: Optional[float],
    test_type: str,
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    type_instr = _LISTENING_TYPE_INSTRUCTIONS.get(test_type, _LISTENING_TYPE_INSTRUCTIONS["Dialogue"])
    target_clause = _target_score_clause(target_score, variant="reading")
    context_block = _ctx_block(ctx, focus="listening")
    full_prompt = (
        f"You are an expert IELTS content creator. Generate a complete listening test. "
        f"{target_clause} {type_instr} After the script, create 3-4 multiple-choice questions "
        f"that test the listener's comprehension. If the STUDENT CONTEXT lists recently heard topics, "
        f"AVOID them — choose a different domain. If target vocabulary is listed, weave 2-4 of those lemmas into the script naturally. "
        f"Respond ONLY in the requested JSON format."
        f"{context_block}"
    )
    return get_client().generate_json(full_prompt, schemas.LISTENING_TEST_SCHEMA)


def _evaluate_mcq(
    context_text: str,
    context_type: str,
    question: str,
    options: list,
    user_answer: str,
    correct_answer: str,
    *,
    ctx: Optional[StudentContext] = None,
    focus: str = "general",
) -> dict:
    user_answer_text = next((o for o in options if o.startswith(user_answer)), f"Option {user_answer}")
    correct_answer_text = next((o for o in options if o.startswith(correct_answer)), f"Option {correct_answer}")
    options_block = "\n".join(options)
    context_block = _ctx_block(ctx, focus=focus)
    full_prompt = f"""You are an expert IELTS tutor. A student has answered a multiple-choice question. Your task is to evaluate their answer and provide a detailed, pedagogical explanation. Respond in the requested JSON format.{context_block}

{context_type}: \"\"\"{context_text}\"\"\"

Question: "{question}"

Options:
{options_block}

Correct Answer: "{correct_answer_text}"
User's Chosen Answer: "{user_answer_text}"

Evaluation Guidance:
1. Determine if the user's answer is correct.
2. Generate an explanation:
   - If CORRECT: Briefly explain why the answer is correct, quoting the relevant part of the {context_type.lower()}.
   - If INCORRECT: This is a teaching opportunity. Provide a two-part explanation:
     a) First, explain exactly why the user's chosen answer is a tempting but incorrect "distractor". Refer to specific parts of the text that might mislead them.
     b) Second, explain why the correct answer is the right one, again quoting the supporting evidence from the {context_type.lower()}.
3. If the STUDENT CONTEXT lists recurring weaknesses or active error categories that line up with the mistake, briefly tie the lesson back to that pattern."""
    return get_client().generate_json(full_prompt, schemas.ANSWER_EVALUATION_SCHEMA)


def evaluate_reading_answer(
    passage: str,
    question: str,
    options: list,
    user_answer: str,
    correct_answer: str,
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    return _evaluate_mcq(
        passage, "Passage", question, options, user_answer, correct_answer,
        ctx=ctx, focus="reading",
    )


def evaluate_listening_answer(
    script: list,
    question: str,
    options: list,
    user_answer: str,
    correct_answer: str,
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    """`script` is a list of {speaker, text} dicts."""
    full_script = "\n".join(f"{p['speaker']}: {p['text']}" for p in script)
    return _evaluate_mcq(
        full_script, "Audio Script", question, options, user_answer, correct_answer,
        ctx=ctx, focus="listening",
    )


# -- Speaking -- #

def analyze_speaking_performance(
    transcript: str,
    mode: str = "Standard",
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    role_play_clause = ""
    if mode == "RolePlay":
        role_play_clause = """
// ADDITIONAL TASK: ANALYZE_ARGUMENTATIVE_SKILLS
Because this was a role-play debate session, you MUST also provide specific feedback on the user's argumentative skills in the 'argumentativeSkills' field. Evaluate their ability to:
- Clearly state and support their position.
- Respond to counter-arguments.
- Agree or disagree politely and effectively.
- Use persuasive language.
Quote a specific example from the transcript that illustrates your feedback."""
    context_block = _ctx_block(ctx, focus="speaking")
    full_prompt = f"""// SYSTEM DIRECTIVE: ACTIVATE IELTS TUTOR PROTOCOL
Persona: `Δ-IELTS_MASTER v8.0`
Core Directive: You are a world-class IELTS speaking examiner. Your purpose is to deliver a precise, rubric-based evaluation of a user's speaking performance based on a provided transcript.{context_block}

// TASK: ANALYZE_AND_GRADE_SPEAKING
Analyze the following transcript based on the four official IELTS speaking assessment criteria. For each criterion, you MUST provide:
1.  **Detailed, constructive feedback**: Explain the user's strengths and weaknesses for that criterion. When the STUDENT CONTEXT lists recurring weaknesses or active error patterns, prioritise feedback that ties back to those patterns.
2.  **A specific, verbatim example**: Quote a phrase directly from the user's transcript that illustrates your feedback point. This is mandatory.
You must also estimate an overall band score. Maintain rubric neutrality and filter out sensitive topics.

// ADDITIONAL TASK: DETAILED PRONUNCIATION ANALYSIS
If you identify a clear and recurring pronunciation error (e.g., confusing 'v' and 'w', incorrect 'th' sound, vowel length issues), you MUST provide a detailed analysis in the 'pronunciationAnalysis' field.
- Identify the specific 'targetPhoneme'.
- Quote 1-3 'problemWords' from the transcript.
- Provide a simple 'explanation' of the error.
If no single, clear error stands out, omit the 'pronunciationAnalysis' field entirely.
{role_play_clause}

Respond ONLY in the requested JSON format.

// User's Transcript:
"{transcript}\""""
    return get_client().generate_json(full_prompt, schemas.SPEAKING_ANALYSIS_SCHEMA)


def generate_pronunciation_practice(
    analysis: dict,
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    """analysis: { targetPhoneme, problemWords, explanation }"""
    problem_words = ", ".join(analysis.get("problemWords", []))
    context_block = _ctx_block(ctx, focus="speaking")
    full_prompt = f"""You are an expert IELTS pronunciation coach. A student needs targeted practice for a specific sound they struggle with. Based on the analysis provided, generate a set of practice exercises. The exercises should be simple, clear, and effective for a non-native English speaker.{context_block}

Analysis of Student's Error:
- Target Sound: {analysis['targetPhoneme']}
- Common Mistake: {analysis['explanation']}
- Example Problem Words: {problem_words}

Your task is to generate:
1.  3-4 'minimalPairs' that contrast the target sound with the sound the student typically uses incorrectly.
2.  1-2 simple 'tongueTwisters' that feature the target sound multiple times.

Respond ONLY in the requested JSON format."""
    return get_client().generate_json(full_prompt, schemas.PRONUNCIATION_PRACTICE_SCHEMA)


# -- Quiz -- #

def generate_quiz(
    difficulty: str,
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    context_block = _ctx_block(ctx, focus="quiz")
    full_prompt = f"""You are an expert IELTS content creator. Generate a 5-question multiple-choice quiz on IELTS vocabulary and grammar. The difficulty level should be '{difficulty}'.
- For 'Easy', focus on common vocabulary and fundamental grammar (e.g., tenses, prepositions). This is suitable for band scores 4.0-5.5.
- For 'Medium', use more advanced vocabulary (e.g., phrasal verbs, idioms) and complex sentence structures. This is suitable for band scores 6.0-7.0.
- For 'Hard', use sophisticated, topic-specific vocabulary and advanced grammatical concepts (e.g., conditionals, inversions). This is suitable for band scores 7.5-9.0.
If the STUDENT CONTEXT lists active error categories, recurring weaknesses, or target vocabulary, bias at least 2-3 of the 5 questions to drill those areas — this is the primary lever for personalisation.
Each question should have a clear explanation. Respond ONLY in the requested JSON format.{context_block}"""
    return get_client().generate_json(full_prompt, schemas.QUIZ_SCHEMA)


def rephrase_explanation(
    question: str,
    original_explanation: str,
    *,
    ctx: Optional[StudentContext] = None,
) -> str:
    context_block = _ctx_block(ctx, focus="quiz")
    full_prompt = f"""You are an expert IELTS tutor. A student needs a simpler explanation for a quiz question. Rephrase the following explanation in simpler, clearer terms. Focus on the core concept and avoid jargon where possible. Tune the simplification to the student's proficiency level if listed in the STUDENT CONTEXT.{context_block}

Question: "{question}"

Original Explanation: "{original_explanation}"

Simplified Explanation:"""
    return get_client().generate_text(full_prompt)


# -- Weakness analysis + comprehensive analysis -- #

_L1_HINT_TEMPLATE = (
    "The student's first language is {label} (ISO code '{code}'). "
    "When relevant, prioritise weaknesses that are typical L1-influenced "
    "transfer errors for {label} speakers (e.g. article use, tense "
    "agreement, /θ/ vs /s/ confusion, word order, definiteness)."
)

_L1_LABELS = {
    "ar": "Arabic", "bn": "Bengali", "zh": "Mandarin Chinese",
    "yue": "Cantonese", "nl": "Dutch", "fa": "Farsi", "fil": "Filipino",
    "fr": "French", "de": "German", "gu": "Gujarati", "hi": "Hindi",
    "id": "Indonesian", "it": "Italian", "ja": "Japanese", "kk": "Kazakh",
    "ko": "Korean", "ms": "Malay", "ne": "Nepali", "pl": "Polish",
    "pt": "Portuguese", "pa": "Punjabi", "ru": "Russian", "es": "Spanish",
    "ta": "Tamil", "te": "Telugu", "th": "Thai", "tr": "Turkish",
    "uk": "Ukrainian", "ur": "Urdu", "vi": "Vietnamese",
}


def _l1_hint(native_language: str | None) -> str:
    if not native_language or native_language in ("", "other"):
        return ""
    label = _L1_LABELS.get(native_language)
    if not label:
        return ""
    return _L1_HINT_TEMPLATE.format(label=label, code=native_language)


def analyze_weaknesses(
    history: list[dict],
    *,
    native_language: str | None = None,
    ctx: Optional[StudentContext] = None,
) -> dict:
    """history: list of feedback objects (writing). The TS code only sends the
    .feedback field, not the whole session — we mirror that to keep tokens down.

    `native_language` (#17): when provided, the prompt is augmented to bias
    the analyzer toward L1-typical errors for this learner.
    """
    feedback_only = [s.get("feedback", s) for s in history]
    l1 = _l1_hint(native_language)
    context_block = _ctx_block(ctx, focus="writing")
    full_prompt = f"""You are an expert IELTS writing coach. I have provided you with the JSON feedback from a student's past {len(feedback_only)} writing sessions.

{l1}{context_block}

Analyze the feedback across all sessions to identify the top 2-3 most significant and recurring weaknesses. For each weakness, provide a concise summary and one concrete, actionable suggestion for improvement. Do not comment on their strengths, only their weaknesses. If the STUDENT CONTEXT shows existing speaking weaknesses or active SRS error categories, prefer summaries that connect across skills (a coherent cross-skill pattern is more valuable than isolated micro-errors).

Respond ONLY in the requested JSON format.

Past Feedback Data:
{json.dumps(feedback_only, indent=2)}"""
    return get_client().generate_json(full_prompt, schemas.WEAKNESS_ANALYSIS_SCHEMA)


def analyze_speaking_weaknesses(
    analyses: list[dict],
    *,
    native_language: str | None = None,
    ctx: Optional[StudentContext] = None,
) -> dict:
    l1 = _l1_hint(native_language)
    context_block = _ctx_block(ctx, focus="speaking")
    full_prompt = f"""You are an expert IELTS speaking coach. I have provided JSON feedback from a student's past {len(analyses)} speaking sessions.

{l1}{context_block}

Analyze the feedback to identify the top 2-3 most significant recurring weaknesses in their performance across all criteria (Fluency, Lexical Resource, Grammar, Pronunciation). For each weakness, provide a concise summary and one concrete, actionable suggestion for improvement. If the STUDENT CONTEXT lists existing writing weaknesses, prefer surfacing cross-skill patterns (e.g. the same grammar gap showing in both writing and speaking).

Respond ONLY in the requested JSON format.

Past Speaking Feedback Data:
{json.dumps(analyses, indent=2)}"""
    return get_client().generate_json(full_prompt, schemas.SPEAKING_WEAKNESS_ANALYSIS_SCHEMA)


def get_comprehensive_analysis(
    performance_summary: dict,
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    context_block = _ctx_block(ctx, focus="general")
    full_prompt = f"""You are an expert IELTS coach providing a high-level summary for a student. Based on the following performance data, provide a single, concise, and encouraging paragraph of analysis. In this paragraph, you must:
1.  Highlight the student's single greatest strength based on the data.
2.  Identify the single most important area they should focus on next for the biggest improvement. Use the STUDENT CONTEXT to make this concrete — name the actual recurring pattern (writing/speaking weakness, error category) rather than a generic suggestion.
3.  Maintain a positive and motivational tone.{context_block}

Respond ONLY in the requested JSON format with a single 'analysis' key.

Performance Data:
{json.dumps(performance_summary, indent=2)}"""
    return get_client().generate_json(full_prompt, schemas.COMPREHENSIVE_ANALYSIS_SCHEMA)


# -- Study plan -- #

def generate_study_plan(
    performance_data: dict,
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    context_block = _ctx_block(ctx, focus="general")
    full_prompt = f"""You are an expert IELTS coach. A student needs a personalized 7-day study plan. Analyze their performance data below to identify their biggest areas for improvement and create a balanced, actionable plan.{context_block}

The plan should be encouraging and focus on making steady progress. For each day, provide a clear 'focus' area and a specific 'task' the user should complete using their practice application's features (like 'Writing Tutor', 'Speaking Tutor', 'Cohesion Mapper', 'Role-play mode', etc.). Ensure a mix of skills throughout the week. When the STUDENT CONTEXT lists recurring weaknesses, active error categories, or target vocabulary, schedule at least 3 of the 7 days to specifically drill those — that is the highest-leverage use of the student's time. If days_until_exam is set and short, weight the plan towards mock-exam practice.

Respond ONLY in the requested JSON format.

---
**Student Performance Data:**
\"\"\"
{json.dumps(performance_data, indent=2)}
\"\"\"
---"""
    return get_client().generate_json(full_prompt, schemas.STUDY_PLAN_SCHEMA)


# -- Integrated skills -- #

_INTEGRATED_TASK_CONFIG = {
    "ListenSummarize": {
        "instruction": "Generate a 'Listen & Summarize' task. It should be a short academic lecture script (250-300 words) on a common IELTS topic.",
        "schema": schemas.LISTEN_SUMMARIZE_TASK_SCHEMA,
    },
    "ReadSpeak": {
        "instruction": "Generate a 'Read & Speak' task. It should include an academic reading passage (250-300 words) and a related speaking prompt to guide the AI conversation.",
        "schema": schemas.READ_SPEAK_TASK_SCHEMA,
    },
    "ReadListenWrite": {
        "instruction": "Generate a 'Read, Listen & Write' synthesis task. It should contain a short reading passage and a related short lecture script on the same topic but from different perspectives, followed by a writing prompt that requires synthesizing information from both.",
        "schema": schemas.READ_LISTEN_WRITE_TASK_SCHEMA,
    },
}


def generate_integrated_task(
    task_type: str,
    target_score: Optional[float],
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    if task_type not in _INTEGRATED_TASK_CONFIG:
        raise AIError(f"Unknown integrated task type: {task_type}", is_fatal=True)
    cfg = _INTEGRATED_TASK_CONFIG[task_type]
    target_clause = _target_score_clause(target_score, variant="reading")
    context_block = _ctx_block(ctx, focus="integrated")
    full_prompt = (
        f"You are an expert IELTS content creator. {cfg['instruction']} {target_clause} "
        f"If the STUDENT CONTEXT lists recently read or heard topics, AVOID them — choose a fresh adjacent domain. "
        f"If target vocabulary is listed, weave 3-5 of those lemmas into the source materials naturally. "
        f"Respond ONLY in the requested JSON format."
        f"{context_block}"
    )
    return get_client().generate_json(full_prompt, cfg["schema"])


def evaluate_summary(
    lecture_script: str,
    summary: str,
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    context_block = _ctx_block(ctx, focus="integrated")
    full_prompt = f"""You are an expert IELTS examiner. Evaluate the student's summary of the provided lecture script. Assess them on three key criteria:{context_block}
1.  **Content**: Did they accurately capture the main ideas and key supporting points?
2.  **Conciseness**: Is the summary brief and to the point, avoiding unnecessary details?
3.  **Paraphrasing**: Did they use their own words and sentence structures effectively?

Provide an estimated band score, detailed feedback for each criterion, and 2-3 actionable suggestions for improvement.

Respond ONLY in the requested JSON format.

---
**Original Lecture Script:**
\"\"\"
{lecture_script}
\"\"\"
---
**Student's Summary:**
\"\"\"
{summary}
\"\"\"
---"""
    return get_client().generate_json(full_prompt, schemas.SUMMARY_EVALUATION_SCHEMA)


def evaluate_synthesis(
    passage: str,
    lecture_script: str,
    writing_response: str,
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    context_block = _ctx_block(ctx, focus="integrated")
    full_prompt = f"""You are an expert IELTS examiner evaluating an integrated skills task. The student was required to read a passage, listen to a lecture, and then write a response synthesizing information from both.{context_block}

Your task is to evaluate their written response based on the following criteria:
1.  **Content Accuracy (Reading)**: Did they accurately identify and represent the key points from the reading passage?
2.  **Content Accuracy (Listening)**: Did they accurately identify and represent the key points from the lecture script?
3.  **Synthesis of Ideas**: This is the most important criterion. Did they effectively connect, compare, contrast, or integrate the information from both sources? Or did they just summarize each source separately?
4.  **Paraphrasing and Language**: Did they use their own words effectively, and is their language (vocabulary, grammar) accurate and appropriate?

Provide an estimated band score, detailed feedback for each criterion, and 2-3 actionable suggestions for improvement.

Respond ONLY in the requested JSON format.

---
**Original Reading Passage:**
\"\"\"
{passage}
\"\"\"
---
**Original Lecture Script:**
\"\"\"
{lecture_script}
\"\"\"
---
**Student's Written Response:**
\"\"\"
{writing_response}
\"\"\"
---"""
    return get_client().generate_json(full_prompt, schemas.SYNTHESIS_EVALUATION_SCHEMA)


# -- Contextual prompts -- #

def _topics_from_history(reading_history: list[dict], listening_history: list[dict]) -> list[str]:
    topics: list[str] = []
    for s in reading_history or []:
        title = s.get("passage_title") or s.get("passageTitle")
        if title:
            topics.append(title)
    for s in listening_history or []:
        title = s.get("title")
        if title:
            topics.append(title)
    return topics[:5]


def generate_contextual_speaking_prompts(
    reading_history: list[dict],
    listening_history: list[dict],
    *,
    ctx: Optional[StudentContext] = None,
) -> list[dict]:
    topics = _topics_from_history(reading_history, listening_history)
    if not topics:
        return []
    topic_lines = "\n- ".join(topics)
    context_block = _ctx_block(ctx, focus="speaking")
    full_prompt = f"""You are an expert IELTS tutor. Based on the topics from a user's recent practice history, generate 2-3 new, thematically related IELTS Speaking prompts (Part 2 or Part 3). The goal is to encourage the user to synthesize ideas and reuse vocabulary they've recently encountered. For each prompt, provide a short, user-facing 'reason' explaining why it's suggested. If the STUDENT CONTEXT lists target vocabulary or speaking weaknesses, prefer prompts that naturally exercise them.{context_block}

Respond ONLY in the requested JSON format.

Recent Practice Topics:
- {topic_lines}"""
    return get_client().generate_json(full_prompt, schemas.CONTEXTUAL_SPEAKING_PROMPTS_SCHEMA)


def generate_contextual_writing_prompts(
    reading_history: list[dict],
    listening_history: list[dict],
    *,
    ctx: Optional[StudentContext] = None,
) -> list[dict]:
    topics = _topics_from_history(reading_history, listening_history)
    if not topics:
        return []
    topic_lines = "\n- ".join(topics)
    context_block = _ctx_block(ctx, focus="writing")
    full_prompt = f"""You are an expert IELTS tutor. Based on the topics from a user's recent practice history, generate 2-3 new, thematically related IELTS Writing Task 2 prompts. The prompts should encourage debate and require the user to synthesize ideas related to the topics they've encountered. For each prompt, provide a short, user-facing 'reason' explaining why it's suggested. If the STUDENT CONTEXT lists writing weaknesses, prefer prompts whose natural argument structure forces practice of those areas (e.g. cause/effect for a student weak on linking).{context_block}

Respond ONLY in the requested JSON format.

Recent Practice Topics:
- {topic_lines}"""
    return get_client().generate_json(full_prompt, schemas.CONTEXTUAL_WRITING_PROMPTS_SCHEMA)


# -- Function-calling: vocabulary practice -- #

_CREATE_SPEAKING_PROMPT_DECLARATION = {
    "name": "createSpeakingPrompt",
    "description": "Creates a new IELTS speaking prompt for a user to practice with.",
    "parameters": {
        "type": "object",
        "properties": {
            "part": {"type": "string", "description": "Part 2 or Part 3"},
            "topic": {"type": "string"},
            "text": {"type": "string", "description": "The full prompt incorporating the keywords."},
        },
        "required": ["part", "topic", "text"],
    },
}


def generate_practice_for_vocabulary(
    vocabulary: list[str],
    *,
    ctx: Optional[StudentContext] = None,
) -> dict:
    """Returns the function-call args as a dict, or None if the model didn't call the function."""
    context_block = _ctx_block(ctx, focus="speaking")
    full_prompt = f"""You are an expert IELTS coach. Your goal is to create a targeted practice session for a student to reinforce their learning of new, advanced vocabulary words.{context_block}

1.  Analyze the provided list of words.
2.  Decide on the most effective practice method. A speaking prompt is generally preferred as it encourages active use.
3.  Create a high-quality, relevant IELTS-style prompt (Part 2 or 3) that naturally encourages the use of these words. If the STUDENT CONTEXT lists recently practised topics, AVOID them so the student gets fresh exposure.
4.  Call the `createSpeakingPrompt` function with the generated prompt details.

Vocabulary to practice: {", ".join(vocabulary)}"""
    response = get_client().generate_with_tools(
        full_prompt,
        function_declarations=[_CREATE_SPEAKING_PROMPT_DECLARATION],
    )
    # Extract the first function call's args
    try:
        for cand in response.candidates or []:
            for part in (cand.content.parts or []):
                fn = getattr(part, "function_call", None)
                if fn and fn.name == "createSpeakingPrompt":
                    return dict(fn.args)
    except Exception as exc:  # noqa: BLE001
        log.warning("Failed to extract function call: %s", exc)
    return {}


# -- Live API ephemeral token (for Speaking Tutor) -- #

def mint_live_session_token(user_id: str) -> dict:
    """Returns the credentials the FE needs to connect to Gemini Live directly.

    Bridge mode:
      - Non-Live calls (writing eval, listening test gen, weakness analysis,
        etc.) go through `GeminiClient` and respect `USE_VERTEX_AI=True`,
        which draws Vertex credits.
      - The Live API does NOT yet have its Vertex ephemeral-token flow wired
        (`auth_tokens.create`). Until that lands, Live falls back to AI Studio
        using `GEMINI_LIVE_API_KEY` (preferred) or `GEMINI_API_KEY` (legacy).
        Note: Live calls in this fallback mode do NOT draw Vertex credits —
        only the non-Live calls do. That's a known temporary trade-off.

    Set `GEMINI_LIVE_API_KEY` to an AI Studio key dedicated to Live so that
    `GEMINI_API_KEY` can be omitted entirely once Vertex is in use.
    """
    from django.conf import settings

    # Prefer a dedicated live key so `GEMINI_API_KEY` is optional in Vertex mode.
    live_key = getattr(settings, "GEMINI_LIVE_API_KEY", "") or settings.GEMINI_API_KEY
    if not live_key:
        raise AIError(
            "Live speaking sessions need an AI Studio key. "
            "Set GEMINI_LIVE_API_KEY (recommended) or GEMINI_API_KEY. "
            "Vertex Live ephemeral tokens are a TODO.",
        )
    return {
        "mode": "ai_studio",
        "api_key": live_key,
        "model": settings.GEMINI_LIVE_MODEL,
    }


# ----- D1 / E1: live-session system instruction builder ----- #

_PERSONA_CLAUSE = {
    "neutral": "Maintain a professional but encouraging tone, balanced between formal and friendly.",
    "strict": "Adopt a disciplined, no-nonsense examiner tone. Push the student with rigorous follow-ups but stay polite.",
    "friendly": "Adopt a warm, encouraging tone — like a supportive tutor. Smile in your voice and reassure the student.",
    "formal": "Adopt a highly formal, exam-room tone. Speak in measured, neutral sentences. No small talk.",
}

_ACCENT_CLAUSE = {
    "uk": "Speak with a clear British (Received Pronunciation) accent.",
    "us": "Speak with a clear General American accent.",
    "au": "Speak with a clear standard Australian accent.",
    "nz": "Speak with a clear standard New Zealand accent.",
    "ca": "Speak with a clear Standard Canadian English accent.",
}

_PROFICIENCY_HINT = {
    "beginner": "Keep your vocabulary at A2 level. Speak slowly. Avoid idioms.",
    "lower_intermediate": "Use B1-level vocabulary. Define unusual words if you use them.",
    "intermediate": "Use natural B1-B2 vocabulary. Mild slowing is fine.",
    "upper_intermediate": "Use natural conversational pace. Push lexical variety.",
    "advanced": "Use natural pace with sophisticated lexis and challenging follow-ups.",
}


def build_speaking_system_instruction(
    *,
    mode: str,
    persona: str = "neutral",
    accent: str = "uk",
    target_band: float = 7.0,
    native_language: str | None = None,
    proficiency: str | None = None,
    prompt: dict | None = None,
    cue_card: dict | None = None,
    ctx: Optional[StudentContext] = None,
) -> str:
    """Compose the system instruction for the Gemini Live session.

    The frontend used to build this string itself, but we centralise here so
    that L1, proficiency, persona, and accent are reliably injected on every
    session and can't be tampered with client-side.
    """
    persona_clause = _PERSONA_CLAUSE.get(persona, _PERSONA_CLAUSE["neutral"])
    accent_clause = _ACCENT_CLAUSE.get(accent, _ACCENT_CLAUSE["uk"])
    proficiency_clause = _PROFICIENCY_HINT.get(proficiency or "", "")
    l1_clause = _l1_hint(native_language)
    context_block = _ctx_block(ctx, focus="speaking")

    language_directive = (
        "// LANGUAGE INSTRUCTION:\n"
        "- The user is practicing for IELTS, an English exam.\n"
        "- You MUST speak, listen, and transcribe strictly in ENGLISH.\n"
        "- Ignore non-English speech and background noise.\n"
        "- If the user's input is unclear, interpret it as the closest English words.\n"
        "- NEVER respond in any language other than English."
    )

    # B1 mock test branch: structured 3-part exam.
    if mode == "Mock":
        cue_block = ""
        if cue_card:
            cue_block = (
                f"\n// PART 2 CUE CARD\nTopic: {cue_card.get('topic', '')}\n"
                + "Bullets:\n"
                + "\n".join(f"- {b}" for b in (cue_card.get("bullets") or []))
            )
        return f"""// SYSTEM DIRECTIVE: ACTIVATE IELTS MOCK TEST PROTOCOL
You are Alex, a world-class IELTS speaking examiner conducting a full mock test.
{accent_clause}
{persona_clause}
{proficiency_clause}
{l1_clause}{context_block}

{language_directive}

// MOCK TEST PROTOCOL
The test has three strictly structured parts. Follow them in order — do not skip ahead.

Part 1 (4–5 min): Begin with a brief greeting and ID-style intro. Then ask 8–12 short questions on familiar topics (hometown, work/study, hobbies). Keep each question short.

Part 2 (cue card, 3–4 min total): When Part 1 ends, announce: "Now we move to Part 2." Read the cue card to the student verbatim, then say "You have one minute to prepare." Stay silent during prep. After prep, say "Now please speak for one to two minutes." Let the student speak; do not interrupt unless they exceed two minutes.{cue_block}

Part 3 (4–5 min): Announce: "Thank you. Now we move to Part 3." Ask 4–6 abstract follow-up questions linked to the Part 2 topic. Probe for justification, comparison, and prediction.

// USER DATA
Target Band Score: {target_band:.1f}"""

    # RolePlay branch
    if mode == "RolePlay":
        return f"""// SYSTEM DIRECTIVE: ACTIVATE IELTS ROLE-PLAY PROTOCOL
You are Alex, an IELTS speaking examiner conducting a Part 3 role-play debate.
{accent_clause}
{persona_clause}
{proficiency_clause}
{l1_clause}{context_block}

{language_directive}

// PROTOCOL
1. Initiate the conversation by setting up a scenario and stating a controversial opinion on an abstract topic.
2. Do NOT just ask a list of questions. Actively listen, challenge politely, provide counter-arguments.

// USER DATA
Target Band Score: {target_band:.1f}"""

    # Standard branch (free-form Q&A)
    if prompt:
        prompt_clause = (
            f'1. Begin by asking the user this IELTS {prompt.get("part", "")} '
            f'question verbatim: "{prompt.get("text", "")}"'
        )
    else:
        prompt_clause = "1. Greet the user briefly and start with Part 1 questions about their hometown or a familiar topic."

    return f"""// SYSTEM DIRECTIVE: ACTIVATE IELTS TUTOR PROTOCOL
You are Alex, a world-class IELTS speaking examiner conducting a realistic mock conversation.
{accent_clause}
{persona_clause}
{proficiency_clause}
{l1_clause}{context_block}

{language_directive}

// PROTOCOL
{prompt_clause}
2. Ask follow-up questions naturally; let the conversation flow.
3. Maintain rubric neutrality — never tell the user their band score during the live session.

// USER DATA
Target Band Score: {target_band:.1f}"""


# ----- D2 / D5 / E3: per-answer helpers ----- #

def shadow_analyze_answer(
    *,
    question: str,
    answer: str,
    target_band: float = 7.0,
    native_language: str | None = None,
    ctx: Optional[StudentContext] = None,
) -> dict:
    """Analyze a single Q+A pair for #21/#D2 shadow-mode practice. Returns
    the same `SpeakingAnalysis` shape as the full-session analyzer so the
    frontend can reuse rendering logic.
    """
    l1 = _l1_hint(native_language)
    context_block = _ctx_block(ctx, focus="speaking")
    full_prompt = f"""You are an expert IELTS speaking examiner reviewing ONE answer to ONE question.

{l1}{context_block}

// QUESTION
"{question}"

// USER'S ANSWER
"{answer}"

// TASK
Provide a focused IELTS-style rubric review of this single answer ONLY.
Score conservatively against an IELTS rubric: target band {target_band:.1f}.
For each of fluencyAndCoherence, lexicalResource, grammaticalRangeAndAccuracy, pronunciation,
provide a sub-score (number) and one-line feedback with a verbatim example from the user's answer.

Respond ONLY in the requested JSON format."""
    return get_client().generate_json(full_prompt, schemas.SPEAKING_ANALYSIS_SCHEMA)


def whisper_hint(
    *,
    question: str,
    so_far: str,
    native_language: str | None = None,
    target_band: float = 7.0,
    ctx: Optional[StudentContext] = None,
) -> str:
    """Short text-only redirect when the user is stuck during a live session.
    Goal: ~1 sentence pointing toward an angle they could take, NOT a model
    answer. Don't break the flow."""
    l1_label = _L1_LABELS.get(native_language or "", "")
    l1_clause = f" The student is a {l1_label} speaker." if l1_label else ""
    vocab_clause = ""
    if ctx and ctx.target_vocab_lemmas:
        vocab_clause = (
            f" If natural, your hint can prime one of these target words: "
            f"{', '.join(ctx.target_vocab_lemmas[:3])}."
        )
    full_prompt = f"""You are an IELTS speaking coach giving a quiet whisper-cue to a stuck student.

The student is being asked: "{question}"
What they have said so far (may be empty): "{so_far}"
Their target band is {target_band:.1f}.{l1_clause}{vocab_clause}

Reply with ONE short sentence (≤ 20 words) that gives them an angle to continue.
Do NOT give them a full sentence to copy. Do NOT mention the rubric.
Output: just the sentence, nothing else."""
    text = get_client().generate_text(full_prompt)
    return text.strip().split("\n")[0][:200]


def band7_rephrase(
    *,
    user_text: str,
    question: str = "",
    ctx: Optional[StudentContext] = None,
) -> dict:
    """E3: rephrase the user's answer to a band-7-equivalent version.
    Returns plain text only; client-side TTS plays it."""
    q_clause = f'\nFor context, the question was: "{question}"' if question else ""
    vocab_clause = ""
    if ctx and ctx.target_vocab_lemmas:
        vocab_clause = (
            f"\nWhere it fits naturally, prefer these target lemmas the student is reinforcing: "
            f"{', '.join(ctx.target_vocab_lemmas[:5])}."
        )
    full_prompt = f"""You are an IELTS speaking coach. The user is asking what a band-7 version of their answer could sound like.

User's original answer:
"{user_text}"{q_clause}

Rewrite the answer at IELTS band 7 level — natural, fluent, with a couple of less-common collocations and clear discourse markers, but still authentically sounding like a real student (not perfect band 9).
Keep the meaning + the user's perspective. Length must stay close to the original (within 30%).{vocab_clause}

Respond with the rewritten answer ONLY — no explanation, no preamble."""
    rephrased = get_client().generate_text(full_prompt).strip()
    return {
        "original": user_text,
        "rephrased": rephrased,
    }
