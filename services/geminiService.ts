/**
 * @file Frontend-side IELTS AI service — now a thin HTTP layer over the
 * Django backend. Exports keep the same signatures so React components don't
 * need any changes.
 *
 * Comparison to the old direct-Gemini version:
 *   - All Gemini API keys live on the server. The browser never sees them.
 *   - Tenant scoping, rate limiting, and Pro-feature gates are enforced on
 *     the server. A free user can no longer just edit JS to unlock features.
 *   - Sessions are persisted server-side. The localStorage history is now
 *     a cache, not the source of truth.
 *
 * The Speaking Tutor still talks to Gemini Live directly from the browser,
 * but only AFTER the backend has minted credentials via /speaking/start-session.
 * In dev that means the API key is returned to the FE; in prod we'll switch to
 * an ephemeral token.
 */

import {
    AnswerEvaluation,
    CohesionMap,
    ComprehensiveAnalysis,
    ContextualSpeakingPrompt,
    ContextualWritingPrompt,
    EssayPlan,
    ListenSummarizeTask,
    ListeningScriptPart,
    ListeningTest,
    ListeningTestType,
    PronunciationDetail,
    PronunciationPractice,
    Quiz,
    QuizDifficulty,
    ReadListenWriteTask,
    ReadingTest,
    ReadingTestType,
    ReadSpeakTask,
    SpeakingAnalysis,
    SpeakingWeaknessAnalysis,
    StudyPlan,
    SummaryEvaluation,
    SynthesisEvaluation,
    WeaknessAnalysis,
    WritingFeedback,
    WritingSessionSummary,
} from '../types';
import { apiClient, ApiError } from './apiClient';

/**
 * Wrap any apiClient call so the React error boundaries see a regular
 * JS Error with the server's user-facing message — preserving how the
 * original AIError-throwing code behaved.
 */
/** Custom Error subclass that carries discriminator flags so callers can
 * distinguish "you need to upgrade" from "the AI is degraded right now"
 * without inspecting status codes. */
class AIServiceError extends Error {
    isPaymentRequired = false;
    isAiError = false;
    isAiFatal = false;
    constructor(message: string, flags: Partial<Pick<AIServiceError, 'isPaymentRequired' | 'isAiError' | 'isAiFatal'>>) {
        super(message);
        Object.assign(this, flags);
    }
}

async function callApi<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (e) {
        if (e instanceof ApiError) {
            throw new AIServiceError(e.message, {
                isPaymentRequired: e.isPaymentRequired,
                isAiError: e.isAiError,
                isAiFatal: e.isAiFatal,
            });
        }
        throw e;
    }
}

// -- Writing -- //

export interface EvaluateWritingExtras {
    taskType?: 'task1' | 'task2';
    durationSeconds?: number;
    predictedBand?: number | null;
    parentSessionId?: string | null;
}

export const evaluateWriting = async (
    prompt: string,
    essay: string,
    targetScore: number | null,
    extras: EvaluateWritingExtras = {},
): Promise<{ feedback: WritingFeedback; sessionId: string }> =>
    callApi(async () => {
        const data = await apiClient.post<{ session_id: string; feedback: WritingFeedback }>(
            '/writing/evaluate',
            {
                prompt,
                essay,
                target_score: targetScore,
                task_type: extras.taskType ?? 'task2',
                duration_seconds: extras.durationSeconds ?? 0,
                predicted_band: extras.predictedBand ?? null,
                parent_session_id: extras.parentSessionId ?? null,
            },
        );
        return { feedback: data.feedback, sessionId: data.session_id };
    });

export const generateEssayPlan = async (prompt: string, userIdeas: string): Promise<EssayPlan> =>
    callApi(async () => {
        const data = await apiClient.post<{ plan: EssayPlan }>('/writing/essay-plan', {
            prompt,
            user_ideas: userIdeas,
        });
        return data.plan;
    });

export const analyzeCohesion = async (prompt: string, essay: string): Promise<CohesionMap> =>
    callApi(async () => {
        const data = await apiClient.post<{ map: CohesionMap }>('/writing/cohesion-analysis', {
            prompt,
            essay,
        });
        return data.map;
    });

export const generateContextualWritingPrompts = async (
    _readingHistory: unknown,
    _listeningHistory: unknown,
): Promise<ContextualWritingPrompt[]> =>
    callApi(async () => {
        // Server reads history directly from the DB — params no longer needed
        const data = await apiClient.get<{ prompts: ContextualWritingPrompt[] }>(
            '/writing/contextual-prompts',
        );
        return data.prompts;
    });

// -- Reading -- //

export const generateReadingTest = async (
    targetScore: number | null,
    testType: ReadingTestType,
): Promise<ReadingTest> =>
    callApi(async () => {
        const data = await apiClient.post<{ test: ReadingTest }>('/reading/test', {
            test_type: testType,
            target_score: targetScore,
        });
        return data.test;
    });

export const evaluateReadingAnswer = async (
    passage: string,
    question: string,
    options: string[],
    userAnswer: string,
    correctAnswer: string,
): Promise<AnswerEvaluation> =>
    callApi(async () => {
        const data = await apiClient.post<{ evaluation: AnswerEvaluation }>(
            '/reading/evaluate-answer',
            { passage, question, options, user_answer: userAnswer, correct_answer: correctAnswer },
        );
        return data.evaluation;
    });

export interface SubmitRLExtras {
    durationSeconds?: number;
    predictedBand?: number | null;
}

export const submitReadingSession = async (
    score: number,
    totalQuestions: number,
    passageTitle?: string,
    extras: SubmitRLExtras = {},
): Promise<{ session_id: string; band_score: number }> =>
    callApi(() =>
        apiClient.post<{ session_id: string; band_score: number }>('/reading/submit-session', {
            score,
            total_questions: totalQuestions,
            passage_title: passageTitle ?? '',
            duration_seconds: extras.durationSeconds ?? 0,
            predicted_band: extras.predictedBand ?? null,
        }),
    );

// -- Listening -- //

export const generateListeningTest = async (
    targetScore: number | null,
    testType: ListeningTestType,
): Promise<ListeningTest> =>
    callApi(async () => {
        const data = await apiClient.post<{ test: ListeningTest }>('/listening/test', {
            test_type: testType,
            target_score: targetScore,
        });
        return data.test;
    });

export const evaluateListeningAnswer = async (
    script: ListeningScriptPart[],
    question: string,
    options: string[],
    userAnswer: string,
    correctAnswer: string,
): Promise<AnswerEvaluation> =>
    callApi(async () => {
        const data = await apiClient.post<{ evaluation: AnswerEvaluation }>(
            '/listening/evaluate-answer',
            { script, question, options, user_answer: userAnswer, correct_answer: correctAnswer },
        );
        return data.evaluation;
    });

export const submitListeningSession = async (
    score: number,
    totalQuestions: number,
    title?: string,
    extras: SubmitRLExtras = {},
): Promise<{ session_id: string; band_score: number }> =>
    callApi(() =>
        apiClient.post<{ session_id: string; band_score: number }>('/listening/submit-session', {
            score,
            total_questions: totalQuestions,
            title: title ?? '',
            duration_seconds: extras.durationSeconds ?? 0,
            predicted_band: extras.predictedBand ?? null,
        }),
    );

// -- Speaking -- //

export const analyzeSpeakingPerformance = async (
    transcript: string,
    mode: 'Standard' | 'RolePlay' = 'Standard',
    sessionId?: string,
): Promise<SpeakingAnalysis> =>
    callApi(async () => {
        const body: Record<string, unknown> = { transcript, mode };
        if (sessionId) body.session_id = sessionId;
        const data = await apiClient.post<{ analysis: SpeakingAnalysis }>(
            '/speaking/analyze-transcript',
            body,
        );
        return data.analysis;
    });

export const generateContextualSpeakingPrompts = async (
    _readingHistory: unknown,
    _listeningHistory: unknown,
): Promise<ContextualSpeakingPrompt[]> =>
    callApi(async () => {
        const data = await apiClient.get<{ prompts: ContextualSpeakingPrompt[] }>(
            '/speaking/contextual-prompts',
        );
        return data.prompts;
    });

export const generatePronunciationPractice = async (
    analysis: PronunciationDetail,
): Promise<PronunciationPractice> =>
    callApi(async () => {
        const data = await apiClient.post<{ practice: PronunciationPractice }>(
            '/speaking/pronunciation-practice',
            {
                targetPhoneme: analysis.targetPhoneme,
                problemWords: analysis.problemWords,
                explanation: analysis.explanation,
            },
        );
        return data.practice;
    });

/**
 * NEW: Mint live session credentials. The Speaking Tutor calls this before
 * connecting to Gemini Live. In dev mode the response includes the API key;
 * in prod it will be a short-lived ephemeral token.
 */
export interface StartSpeakingExtras {
    part?: 'part1' | 'part2' | 'part3' | 'mixed';
    predictedBand?: number | null;
    parentSessionId?: string | null;
}

export const startSpeakingSession = async (
    mode: 'Standard' | 'RolePlay',
    topic?: string,
    prompt?: { part: string; text: string },
    extras: StartSpeakingExtras = {},
): Promise<{
    session_id: string;
    live: { mode: 'ai_studio' | 'vertex'; api_key?: string; model: string };
}> =>
    callApi(() =>
        apiClient.post('/speaking/start-session', {
            mode,
            topic,
            prompt,
            part: extras.part ?? 'mixed',
            predicted_band: extras.predictedBand ?? null,
            parent_session_id: extras.parentSessionId ?? null,
        }),
    );

/**
 * NEW: Tells the backend the live session has ended; saves transcript and
 * (optionally) generates analysis server-side.
 */
export const endSpeakingSession = async (
    sessionId: string,
    transcript: { speaker: string; text: string; timestamp: string }[],
    durationSeconds: number,
    skipAnalysis = false,
): Promise<{ session_id: string; analysis: SpeakingAnalysis | null; duration_seconds: number }> =>
    callApi(() =>
        apiClient.post('/speaking/end-session', {
            session_id: sessionId,
            transcript,
            duration_seconds: durationSeconds,
            skip_analysis: skipAnalysis,
        }),
    );

// -- Quiz -- //

export const generateQuiz = async (difficulty: QuizDifficulty): Promise<Quiz> =>
    callApi(async () => {
        const data = await apiClient.post<{ quiz: Quiz }>('/quiz/generate', { difficulty });
        return data.quiz;
    });

export const rephraseExplanation = async (
    question: string,
    originalExplanation: string,
): Promise<string> =>
    callApi(async () => {
        const data = await apiClient.post<{ explanation: string }>('/quiz/rephrase-explanation', {
            question,
            original_explanation: originalExplanation,
        });
        return data.explanation;
    });

// -- Analytics / weakness / study plan -- //

export const analyzeWeaknesses = async (
    _history: WritingSessionSummary[],
): Promise<WeaknessAnalysis> =>
    callApi(async () => {
        const data = await apiClient.post<{ analysis: WeaknessAnalysis }>(
            '/analytics/weakness-analysis?skill=writing',
        );
        return data.analysis;
    });

export const analyzeSpeakingWeaknesses = async (
    _analyses: SpeakingAnalysis[],
): Promise<SpeakingWeaknessAnalysis> =>
    callApi(async () => {
        const data = await apiClient.post<{ analysis: SpeakingWeaknessAnalysis }>(
            '/analytics/weakness-analysis?skill=speaking',
        );
        return data.analysis;
    });

export const getComprehensiveAnalysis = async (
    performanceSummary: object,
): Promise<ComprehensiveAnalysis> =>
    callApi(async () => {
        const data = await apiClient.post<{ analysis: ComprehensiveAnalysis }>(
            '/analytics/comprehensive-analysis',
            performanceSummary,
        );
        return data.analysis;
    });

export const generateStudyPlan = async (performanceData: object): Promise<StudyPlan> =>
    callApi(async () => {
        const data = await apiClient.post<{ plan: StudyPlan }>(
            '/analytics/study-plan',
            performanceData,
        );
        return data.plan;
    });

// -- Integrated Skills -- //

export const generateIntegratedTask = async (
    taskType: 'ListenSummarize' | 'ReadSpeak' | 'ReadListenWrite',
    targetScore: number | null,
): Promise<ListenSummarizeTask | ReadSpeakTask | ReadListenWriteTask> =>
    callApi(async () => {
        const data = await apiClient.post<{
            task: ListenSummarizeTask | ReadSpeakTask | ReadListenWriteTask;
        }>('/integrated-skills/task', { task_type: taskType, target_score: targetScore });
        return data.task;
    });

export const evaluateSummary = async (
    lectureScript: string,
    summary: string,
): Promise<SummaryEvaluation> =>
    callApi(async () => {
        const data = await apiClient.post<{ evaluation: SummaryEvaluation }>(
            '/integrated-skills/evaluate-summary',
            { lecture_script: lectureScript, summary },
        );
        return data.evaluation;
    });

export const evaluateSynthesis = async (
    passage: string,
    lectureScript: string,
    writingResponse: string,
): Promise<SynthesisEvaluation> =>
    callApi(async () => {
        const data = await apiClient.post<{ evaluation: SynthesisEvaluation }>(
            '/integrated-skills/evaluate-synthesis',
            { passage, lecture_script: lectureScript, writing_response: writingResponse },
        );
        return data.evaluation;
    });

// -- Vocabulary practice (function-calling) -- //

/**
 * Backwards-compat shim: the old version returned the raw GenerateContentResponse
 * with function_calls embedded. The backend now returns the extracted args
 * directly. We expose a minimal compatible shape so any callers using
 * .functionCalls work.
 */
export const generatePracticeForVocabulary = async (
    _vocabulary: string[],
): Promise<{ functionCalls: Array<{ name: string; args: Record<string, unknown> }> }> => {
    // No backend endpoint wired for this in the initial migration — vocabulary
    // reinforcement is a future feature; surface a no-op shape if called.
    return { functionCalls: [] };
};
