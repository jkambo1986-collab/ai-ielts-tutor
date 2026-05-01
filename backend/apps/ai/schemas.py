"""
JSON schemas for Gemini structured-output responses.

These mirror the schemas declared in services/geminiService.ts, translated to
plain Python dicts. Both the AI Studio (google-genai) and Vertex AI SDKs
accept this dict form via the `response_schema` config field.

We use OpenAPI 3 / JSON Schema vocabulary directly: type strings instead of
SDK enums, descriptions inline, required arrays on objects.
"""

# -- Reusable building blocks -- #

FEEDBACK_CRITERION_SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string", "description": "Detailed feedback for this criterion."},
        "relevantSentences": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Sentences from the user's essay that this feedback applies to. Quote verbatim.",
        },
        "exampleSentences": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Generic example sentences if no user sentence is applicable.",
        },
    },
    "required": ["text"],
}


SPEAKING_FEEDBACK_POINT_SCHEMA = {
    "type": "object",
    "properties": {
        "feedback": {"type": "string", "description": "Detailed, constructive feedback for this criterion."},
        "example": {
            "type": "string",
            "description": "A specific, verbatim phrase quoted from the user's transcript that illustrates the feedback point. This field is mandatory.",
        },
    },
    "required": ["feedback", "example"],
}


# -- Writing -- #

WRITING_FEEDBACK_SCHEMA = {
    "type": "object",
    "properties": {
        "bandScore": {"type": "number", "description": "Overall band score 1.0-9.0 (0.5 increments)."},
        "feedback": {
            "type": "object",
            "properties": {
                "taskAchievement": FEEDBACK_CRITERION_SCHEMA,
                "coherenceAndCohesion": FEEDBACK_CRITERION_SCHEMA,
                "lexicalResource": FEEDBACK_CRITERION_SCHEMA,
                "grammaticalRangeAndAccuracy": FEEDBACK_CRITERION_SCHEMA,
            },
            "required": [
                "taskAchievement",
                "coherenceAndCohesion",
                "lexicalResource",
                "grammaticalRangeAndAccuracy",
            ],
        },
        "suggestions": {
            "type": "array",
            "items": {"type": "string"},
            "description": "3-5 concrete suggestions for improvement.",
        },
        "vocabularyEnhancements": {
            "type": "array",
            "description": "3-5 sentence rewrites with stronger vocabulary.",
            "items": {
                "type": "object",
                "properties": {
                    "originalSentence": {"type": "string"},
                    "suggestedSentence": {"type": "string"},
                },
                "required": ["originalSentence", "suggestedSentence"],
            },
        },
    },
    "required": ["bandScore", "feedback", "suggestions"],
}


ESSAY_PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "thesisStatement": {"type": "string"},
        "bodyParagraphs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "mainPoint": {"type": "string"},
                    "supportingExamples": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "2-3 specific examples or pieces of evidence.",
                    },
                },
                "required": ["mainPoint", "supportingExamples"],
            },
            "description": "2-3 body paragraphs.",
        },
    },
    "required": ["thesisStatement", "bodyParagraphs"],
}


COHESION_MAP_SCHEMA = {
    "type": "object",
    "properties": {
        "nodes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Unique id. 'thesis' for thesis, 'mp1', 'mp2' for main points, 'sp1.1', 'sp1.2' for supporting points of mp1.",
                    },
                    "type": {
                        "type": "string",
                        "description": "'thesis' | 'mainPoint' | 'supportingPoint'",
                    },
                    "text": {"type": "string"},
                    "originalSentence": {"type": "string"},
                },
                "required": ["id", "type", "text", "originalSentence"],
            },
        },
        "links": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "source": {"type": "string"},
                    "target": {"type": "string"},
                    "strength": {
                        "type": "string",
                        "description": "'strong' | 'weak' | 'missing'",
                    },
                    "explanation": {"type": "string"},
                    "linkingPhrase": {"type": "string"},
                },
                "required": ["source", "target", "strength", "explanation"],
            },
        },
    },
    "required": ["nodes", "links"],
}


# -- Reading / Listening -- #

READING_TEST_SCHEMA = {
    "type": "object",
    "properties": {
        "passageTitle": {"type": "string"},
        "passage": {"type": "string"},
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "correctAnswer": {"type": "string", "description": "Letter A, B, C, or D"},
                },
                "required": ["question", "options", "correctAnswer"],
            },
        },
    },
    "required": ["passageTitle", "passage", "questions"],
}


ANSWER_EVALUATION_SCHEMA = {
    "type": "object",
    "properties": {
        "isCorrect": {"type": "boolean"},
        "explanation": {
            "type": "string",
            "description": (
                "If correct: confirm and quote text. If incorrect: (1) explain why the user's "
                "chosen distractor is wrong, (2) explain why the correct answer is right."
            ),
        },
    },
    "required": ["isCorrect", "explanation"],
}


LISTENING_TEST_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "script": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string"},
                    "text": {"type": "string"},
                },
                "required": ["speaker", "text"],
            },
        },
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "correctAnswer": {"type": "string"},
                },
                "required": ["question", "options", "correctAnswer"],
            },
        },
    },
    "required": ["title", "script", "questions"],
}


# -- Speaking -- #

SPEAKING_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "overallBandScore": {"type": "number", "description": "1.0-9.0"},
        "fluencyAndCoherence": SPEAKING_FEEDBACK_POINT_SCHEMA,
        "lexicalResource": SPEAKING_FEEDBACK_POINT_SCHEMA,
        "grammaticalRangeAndAccuracy": SPEAKING_FEEDBACK_POINT_SCHEMA,
        "pronunciation": SPEAKING_FEEDBACK_POINT_SCHEMA,
        "pronunciationAnalysis": {
            "type": "object",
            "description": "Detailed analysis of one specific pronunciation error if clearly identifiable.",
            "properties": {
                "targetPhoneme": {"type": "string"},
                "problemWords": {"type": "array", "items": {"type": "string"}},
                "explanation": {"type": "string"},
            },
            "required": ["targetPhoneme", "problemWords", "explanation"],
        },
        "argumentativeSkills": SPEAKING_FEEDBACK_POINT_SCHEMA,
    },
    "required": [
        "overallBandScore",
        "fluencyAndCoherence",
        "lexicalResource",
        "grammaticalRangeAndAccuracy",
        "pronunciation",
    ],
}


PRONUNCIATION_PRACTICE_SCHEMA = {
    "type": "object",
    "properties": {
        "targetPhoneme": {"type": "string"},
        "minimalPairs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "wordA": {"type": "string"},
                    "wordB": {"type": "string"},
                },
                "required": ["wordA", "wordB"],
            },
            "description": "3-4 minimal pairs.",
        },
        "tongueTwisters": {"type": "array", "items": {"type": "string"}, "description": "1-2 tongue twisters."},
    },
    "required": ["targetPhoneme", "minimalPairs", "tongueTwisters"],
}


# -- Quiz -- #

QUIZ_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "correctAnswer": {"type": "string"},
                    "explanation": {"type": "string"},
                },
                "required": ["question", "options", "correctAnswer", "explanation"],
            },
            "description": "5 multiple-choice questions.",
        },
    },
    "required": ["title", "questions"],
}


# -- Weakness analysis (writing + speaking) -- #

WEAKNESS_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "recurringWeaknesses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "weakness": {"type": "string"},
                    "suggestion": {"type": "string"},
                },
                "required": ["weakness", "suggestion"],
            },
            "description": "Top 2-3 recurring weaknesses.",
        },
    },
    "required": ["recurringWeaknesses"],
}

SPEAKING_WEAKNESS_ANALYSIS_SCHEMA = WEAKNESS_ANALYSIS_SCHEMA


COMPREHENSIVE_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "analysis": {
            "type": "string",
            "description": "Single concise paragraph: one strength + one focus area + motivational tone.",
        },
    },
    "required": ["analysis"],
}


# -- Study plan -- #

STUDY_PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "plan": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "day": {"type": "number", "description": "1-7"},
                    "focus": {"type": "string"},
                    "task": {"type": "string"},
                },
                "required": ["day", "focus", "task"],
            },
        },
    },
    "required": ["plan"],
}


# -- Integrated skills -- #

LISTEN_SUMMARIZE_TASK_SCHEMA = {
    "type": "object",
    "properties": {
        "topic": {"type": "string"},
        "lectureScript": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "'Lecturer'"},
                    "text": {"type": "string"},
                },
                "required": ["speaker", "text"],
            },
            "description": "~250-300 word lecture, broken into paragraphs.",
        },
    },
    "required": ["topic", "lectureScript"],
}


READ_SPEAK_TASK_SCHEMA = {
    "type": "object",
    "properties": {
        "passageTitle": {"type": "string"},
        "passage": {"type": "string", "description": "~250-300 word academic passage."},
        "speakingPrompt": {"type": "string"},
    },
    "required": ["passageTitle", "passage", "speakingPrompt"],
}


READ_LISTEN_WRITE_TASK_SCHEMA = {
    "type": "object",
    "properties": {
        "topic": {"type": "string"},
        "passageTitle": {"type": "string"},
        "passage": {"type": "string", "description": "~200-250 word passage, one perspective."},
        "lectureScript": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string"},
                    "text": {"type": "string"},
                },
                "required": ["speaker", "text"],
            },
            "description": "~200-250 word lecture, contrasting perspective.",
        },
        "writingPrompt": {"type": "string"},
    },
    "required": ["topic", "passageTitle", "passage", "lectureScript", "writingPrompt"],
}


SUMMARY_EVALUATION_SCHEMA = {
    "type": "object",
    "properties": {
        "bandScore": {"type": "number"},
        "feedback": {
            "type": "object",
            "properties": {
                "content": FEEDBACK_CRITERION_SCHEMA,
                "conciseness": FEEDBACK_CRITERION_SCHEMA,
                "paraphrasing": FEEDBACK_CRITERION_SCHEMA,
            },
            "required": ["content", "conciseness", "paraphrasing"],
        },
        "suggestions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["bandScore", "feedback", "suggestions"],
}


SYNTHESIS_EVALUATION_SCHEMA = {
    "type": "object",
    "properties": {
        "bandScore": {"type": "number"},
        "feedback": {
            "type": "object",
            "properties": {
                "contentAccuracyReading": FEEDBACK_CRITERION_SCHEMA,
                "contentAccuracyListening": FEEDBACK_CRITERION_SCHEMA,
                "synthesisOfIdeas": FEEDBACK_CRITERION_SCHEMA,
                "paraphrasingAndLanguage": FEEDBACK_CRITERION_SCHEMA,
            },
            "required": [
                "contentAccuracyReading",
                "contentAccuracyListening",
                "synthesisOfIdeas",
                "paraphrasingAndLanguage",
            ],
        },
        "suggestions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["bandScore", "feedback", "suggestions"],
}


# -- Contextual prompts -- #

CONTEXTUAL_SPEAKING_PROMPTS_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "part": {"type": "string", "description": "'Part 2' | 'Part 3'"},
            "text": {"type": "string"},
            "reason": {"type": "string"},
        },
        "required": ["part", "text", "reason"],
    },
}


CONTEXTUAL_WRITING_PROMPTS_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "text": {"type": "string"},
            "reason": {"type": "string"},
        },
        "required": ["text", "reason"],
    },
}


# -- Listening dictation -- #

DICTATION_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "script": {
            "type": "string",
            "description": "Plain-text passage the speaker says, 60-110 words. No speaker names, no timestamps. Punctuation included.",
        },
        "blanks": {
            "type": "array",
            "description": "5-8 evenly-spaced gaps the student must transcribe. Each blank gives the index range in the script and the canonical answer.",
            "items": {
                "type": "object",
                "properties": {
                    "start": {"type": "number"},
                    "end": {"type": "number"},
                    "answer": {"type": "string"},
                    "hint": {"type": "string", "description": "One-letter or contextual hint, e.g. 'starts with /θ/'."},
                },
                "required": ["start", "end", "answer"],
            },
        },
    },
    "required": ["title", "script", "blanks"],
}


# -- Band drop diagnostic (Hard 4) -- #

BAND_DROP_DIAGNOSTIC_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string", "description": "One-sentence summary of why the band dipped."},
        "specific_changes": {
            "type": "array",
            "items": {"type": "string"},
            "description": "2-4 concrete differences vs the prior 5 sessions.",
        },
        "confidence": {
            "type": "string",
            "enum": ["high", "medium", "low"],
        },
        "next_action": {"type": "string", "description": "One concrete thing to do in the next session."},
    },
    "required": ["headline", "specific_changes", "next_action"],
}


# -- Partial-band rolling estimate (F7) -- #

PARTIAL_BAND_SCHEMA = {
    "type": "object",
    "properties": {
        "rolling_band": {
            "type": "number",
            "description": "Low-confidence band 1.0-9.0 from text-so-far.",
        },
        "confidence": {
            "type": "string",
            "enum": ["very_low", "low", "medium"],
        },
        "one_word_signal": {
            "type": "string",
            "description": "One word the FE can show under the ring, e.g. 'fluent', 'hesitant', 'concise'.",
        },
    },
    "required": ["rolling_band", "confidence"],
}


# -- F3: "Why this band?" descriptor explainability -- #

BAND_EXPLANATION_SCHEMA = {
    "type": "object",
    "description": "Decomposes a band score into the four official IELTS public band descriptors. Each descriptor cites the official descriptor language at the awarded band, lists evidence quotes from the user's text, and (when scoring < 9) names what would push it half a band higher.",
    "properties": {
        "overallBand": {"type": "number"},
        "criteria": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Criterion name, e.g. 'Task Response', 'Coherence and Cohesion', 'Lexical Resource', 'Grammatical Range and Accuracy', or for speaking 'Fluency and Coherence', 'Pronunciation', etc.",
                    },
                    "band": {"type": "number"},
                    "descriptorAtBand": {
                        "type": "string",
                        "description": "The official IELTS public band descriptor language for the awarded band on this criterion. Quote close to the published descriptor, paraphrased only minimally.",
                    },
                    "evidence": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "1-3 verbatim quotes from the user's essay/transcript that map to the descriptor language above.",
                    },
                    "toReachNextBand": {
                        "type": "string",
                        "description": "What specifically would lift this criterion half a band higher. Concrete action, not a platitude. Empty string when band is already 9.",
                    },
                },
                "required": ["name", "band", "descriptorAtBand", "evidence", "toReachNextBand"],
            },
        },
    },
    "required": ["overallBand", "criteria"],
}
