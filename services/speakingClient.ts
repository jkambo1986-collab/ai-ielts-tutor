/**
 * @file Frontend client for the new Phase 1-5 Speaking endpoints.
 *
 * The legacy `geminiService.startSpeakingSession` etc. still exist for
 * backward compatibility; this module is for the new persistent-state ops
 * (live config, cue cards, checkpoint, reconnect, examiner notes, instructor
 * review, exports, shadow analyze, whisper, band-7 rephrase).
 */

import { apiClient } from './apiClient';

export interface CueCard {
    id: string;
    topic: string;
    bullets: string[];
    category: string;
    difficulty: 'easy' | 'medium' | 'hard';
    follow_up_questions: string[];
}

export interface LiveConfig {
    primary_model: string;
    fallback_models: string[];
    voices: Record<'uk' | 'us' | 'au' | 'nz' | 'ca', string>;
}

export interface ExaminerNote {
    note: string;
    timestamp: string;
    category: string;
    at: string;
}

export interface ShadowAnalysis {
    overallBandScore: number;
    fluencyAndCoherence: { score?: number; feedback?: string; example?: string };
    lexicalResource: { score?: number; feedback?: string; example?: string };
    grammaticalRangeAndAccuracy: { score?: number; feedback?: string; example?: string };
    pronunciation: { score?: number; feedback?: string; example?: string };
}

export const speakingClient = {
    fetchLiveConfig: () => apiClient.get<LiveConfig>('/speaking/live-config'),

    fetchCueCards: (opts?: { category?: string; difficulty?: string }) => {
        const qs = new URLSearchParams();
        if (opts?.category) qs.set('category', opts.category);
        if (opts?.difficulty) qs.set('difficulty', opts.difficulty);
        return apiClient.get<{ cards: CueCard[]; count: number }>(`/speaking/cue-cards?${qs}`);
    },

    fetchRandomCueCard: (difficulty?: string) => {
        const qs = new URLSearchParams();
        if (difficulty) qs.set('difficulty', difficulty);
        return apiClient.get<{ card: CueCard | null }>(`/speaking/cue-cards/random?${qs}`);
    },

    checkpoint: (
        sessionId: string,
        transcript: { speaker: string; text: string; timestamp: string }[],
        durationSeconds: number,
        mockState?: Record<string, unknown> | null,
    ) =>
        apiClient.post(`/speaking/sessions/${sessionId}/checkpoint`, {
            transcript,
            duration_seconds: durationSeconds,
            mock_state: mockState ?? null,
        }),

    reconnect: (sessionId: string) =>
        apiClient.post<{
            session_id: string;
            live: { mode: string; api_key?: string; model: string };
            transcript: { speaker: string; text: string; timestamp: string }[];
            mock_state: Record<string, unknown> | null;
            duration_seconds: number;
        }>(`/speaking/sessions/${sessionId}/reconnect`),

    repeatQuestion: (sessionId: string, part?: 'part1' | 'part2' | 'part3') =>
        apiClient.post<{ phrase: string; repeats_used_this_part: number }>(
            `/speaking/sessions/${sessionId}/repeat-question`,
            { part },
        ),

    addExaminerNote: (sessionId: string, note: string, timestamp = '', category = '') =>
        apiClient.post<{ notes: ExaminerNote[] }>(
            `/speaking/sessions/${sessionId}/notes`,
            { note, timestamp, category },
        ),
    fetchExaminerNotes: (sessionId: string) =>
        apiClient.get<{ notes: ExaminerNote[] }>(`/speaking/sessions/${sessionId}/notes`),

    whisperHint: (sessionId: string, lastQuestion: string, userSoFar = '') =>
        apiClient.post<{ hint: string; uses: number }>(
            `/speaking/sessions/${sessionId}/whisper-hint`,
            { last_question: lastQuestion, user_so_far: userSoFar },
        ),

    annotate: (sessionId: string, body: string, transcriptIndex?: number) =>
        apiClient.post(
            `/speaking/sessions/${sessionId}/annotations`,
            { body, transcript_index: transcriptIndex ?? null },
        ),

    instructorReview: (sessionId: string) =>
        apiClient.get<{
            session: Record<string, unknown>;
            student: { id: string; name: string; email: string };
            annotations: { id: string; body: string; transcript_index: number | null; created_at: string }[];
        }>(`/speaking/instructor/sessions/${sessionId}`),

    exportUrl: (sessionId: string, fmt: 'pdf' | 'docx' | 'txt') =>
        `${(import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8000/api/v1'}/speaking/sessions/${sessionId}/export?fmt=${fmt}`,

    shadowAnalyze: (question: string, userAnswer: string, targetBand?: number) =>
        apiClient.post<{ analysis: ShadowAnalysis }>(
            '/speaking/shadow-analyze',
            { question, user_answer: userAnswer, target_band: targetBand ?? 7.0 },
        ),

    band7Rephrase: (userText: string, question?: string) =>
        apiClient.post<{ original: string; rephrased: string }>(
            '/speaking/band7-rephrase',
            { user_text: userText, question: question ?? '' },
        ),
};
