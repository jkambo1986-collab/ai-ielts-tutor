/**
 * @file Pulls the user's session history from the backend.
 *
 * Maps the backend snake_case payloads to the frontend camelCase types so the
 * existing components (which expect WritingSessionSummary etc.) work unchanged.
 */

import {
    ListeningSessionSummary,
    ReadingSessionSummary,
    SpeakingSessionSummary,
    WritingSessionSummary,
} from '../types';
import { apiClient } from './apiClient';

interface BackendWriting {
    id: string;
    /** DRF serializes DecimalField as string (e.g. "4.5"); we coerce to number client-side. */
    band_score: number | string;
    feedback: WritingSessionSummary['feedback'];
    created_at: string;
}

interface BackendSpeaking {
    id: string;
    duration_seconds: number;
    topic: string;
    mode: 'Standard' | 'RolePlay';
    analysis: SpeakingSessionSummary['speakingAnalysis'] | null;
    created_at: string;
    transcript?: SpeakingSessionSummary['transcript'];
    prompt?: SpeakingSessionSummary['prompt'];
}

interface BackendReading {
    id: string;
    score: number;
    total_questions: number;
    passage_title: string;
    created_at: string;
}

interface BackendListening {
    id: string;
    score: number;
    total_questions: number;
    title: string;
    created_at: string;
}

interface Paginated<T> {
    results?: T[];
    count?: number;
}

/** DRF pagination wraps results in `{count, results}`. Older endpoints return a bare array. */
const unwrap = <T,>(data: Paginated<T> | T[]): T[] =>
    Array.isArray(data) ? data : data.results ?? [];

const writingFromBackend = (s: BackendWriting): WritingSessionSummary => ({
    id: s.id,
    date: s.created_at,
    bandScore: typeof s.band_score === 'string' ? parseFloat(s.band_score) : s.band_score,
    feedback: s.feedback,
});

const speakingFromBackend = (s: BackendSpeaking): SpeakingSessionSummary => ({
    id: s.id,
    date: s.created_at,
    durationInSeconds: s.duration_seconds,
    topic: s.topic || 'General Conversation',
    mode: s.mode,
    transcript: s.transcript ?? [],
    speakingAnalysis: s.analysis ?? undefined,
    prompt: s.prompt,
});

const readingFromBackend = (s: BackendReading): ReadingSessionSummary => ({
    id: s.id,
    date: s.created_at,
    score: s.score,
    totalQuestions: s.total_questions,
    passageTitle: s.passage_title || undefined,
});

const listeningFromBackend = (s: BackendListening): ListeningSessionSummary => ({
    id: s.id,
    date: s.created_at,
    score: s.score,
    totalQuestions: s.total_questions,
    title: s.title || undefined,
});

export interface HistoryBundle {
    writing: WritingSessionSummary[];
    speaking: SpeakingSessionSummary[];
    reading: ReadingSessionSummary[];
    listening: ListeningSessionSummary[];
}

export const historyService = {
    /** Fetch all 4 history lists in parallel. */
    fetchAll: async (): Promise<HistoryBundle> => {
        const [writing, speaking, reading, listening] = await Promise.all([
            apiClient.get<Paginated<BackendWriting> | BackendWriting[]>('/writing/sessions/'),
            apiClient.get<Paginated<BackendSpeaking> | BackendSpeaking[]>('/speaking/sessions/'),
            apiClient.get<Paginated<BackendReading> | BackendReading[]>('/reading/sessions/'),
            apiClient.get<Paginated<BackendListening> | BackendListening[]>('/listening/sessions/'),
        ]);
        return {
            writing: unwrap(writing).map(writingFromBackend),
            speaking: unwrap(speaking).map(speakingFromBackend),
            reading: unwrap(reading).map(readingFromBackend),
            listening: unwrap(listening).map(listeningFromBackend),
        };
    },
};
