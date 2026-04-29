/**
 * @file Frontend client for the persistent dashboard analytics endpoints.
 *
 * Each function maps directly to one Django view; types match the JSON shape
 * the views return. Keep these tight — the dashboard fans out a lot of
 * concurrent fetches, so failures must be local (one card error ≠ whole page).
 */

import { apiClient } from './apiClient';

export interface DashboardPayload {
    period_days: number | null;
    target: number;

    counts: Record<'writing' | 'speaking' | 'reading' | 'listening' | 'writing_raw' | 'speaking_raw' | 'reading_raw' | 'listening_raw', number>;

    averages: { writing: number | null; speaking: number | null; reading: number | null; listening: number | null };
    latest:   { writing: number | null; speaking: number | null; reading: number | null; listening: number | null };
    trends:   { writing: number | null; speaking: number | null; reading: number | null; listening: number | null };
    eta_to_target: { writing: string | null; speaking: string | null; reading: string | null; listening: string | null };

    streak_days: number;
    heatmap_12w: number[][]; // weeks × 7
    by_weekday: number[];    // length 7 (Mon..Sun)
    by_hour: number[];       // length 24

    writing_subskills: { task_achievement: number | null; coherence_cohesion: number | null; lexical_resource: number | null; grammar_accuracy: number | null };
    speaking_subskills: { fluency_coherence: number | null; lexical_resource: number | null; grammar_accuracy: number | null; pronunciation: number | null };

    writing_task_split: { task1_avg: number | null; task1_count: number; task2_avg: number | null; task2_count: number };
    speaking_part_split: Record<string, number | null>;

    speaking_analysis_state: { total: number; analyzed: number; pending: number };

    quality: { writing: number | null; speaking: number | null; reading: number | null; listening: number | null };
    effective_practice_minutes: number;

    vocabulary: { unique_total: number; unique_b2_plus: number; awl_total: number; added_this_period: number | null };

    calibration: { samples: number; avg_delta: number | null };

    error_cards: { total: number; due_now: number };

    mock_tests: { count: number; latest_overall_band: number | null; latest_readiness_score: number | null; latest_at: string | null };

    alerts: DashboardAlert[];
}

export interface DashboardAlert {
    id: string;
    type: 'regression' | 'streak_lost' | 'inactive' | 'goal_reached' | 'quick_win';
    severity: 'info' | 'warning' | 'success';
    title: string;
    body: string;
    payload: Record<string, unknown>;
    cta_label: string;
    cta_target: string;
    created_at: string;
}

export interface VocabularyObservation {
    id: string;
    lemma: string;
    cefr_level: '' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
    is_awl: boolean;
    frequency: number;
    first_seen_at: string;
    last_seen_at: string;
}

export interface ErrorCard {
    id: string;
    category: string;
    error_text: string;
    correction_text: string;
    explanation: string;
    source_session_type: string;
    source_session_id: string;
    interval_days: number;
    ease: number;
    repetitions: number;
    due_at: string;
    last_reviewed_at: string | null;
    review_count: number;
    correct_count: number;
    archived_at: string | null;
    created_at: string;
}

export interface MockTest {
    id: string;
    started_at: string;
    completed_at: string | null;
    duration_seconds: number;
    overall_band: number | null;
    readiness_score: number | null;
    sub_results: Record<string, unknown>;
}

export interface CalibrationEntry {
    id: string;
    session_type: string;
    session_id: string;
    predicted_band: number;
    actual_band: number;
    delta: number;
    created_at: string;
}

export interface ShareLink {
    id: string;
    token: string;
    url: string;
    scope: string;
    target_id: string | null;
    period_days: number;
    expires_at: string;
    revoked_at: string | null;
    created_at: string;
    view_count: number;
}

export interface ScorecardCriterion {
    key: string;
    label: string;
    score: number | null;
    comment: string;
}

export interface Scorecard {
    session_id: string;
    kind: 'writing' | 'speaking';
    overall_band: number | null;
    criteria: ScorecardCriterion[];
    created_at: string;
    task_type?: string;
    part?: string;
}

export interface ReattemptDiff {
    kind: 'writing' | 'speaking';
    original: { id: string; created_at: string; overall_band: number | null };
    reattempt: { id: string; created_at: string; overall_band: number | null };
    overall_delta: number | null;
    criteria: { key: string; label: string; before: number | null; after: number | null; delta: number | null; before_comment: string; after_comment: string }[];
}

export interface CohortBenchmark {
    you: { writing: { avg: number | null; n: number }; speaking: { avg: number | null; n: number } };
    institute: { slug: string | null; writing: { avg: number | null; n: number }; speaking: { avg: number | null; n: number } };
    platform: { writing: { avg: number | null; n: number }; speaking: { avg: number | null; n: number } };
    same_l1_cohort: { language: string; cohort_size: number; writing: { avg: number | null; n: number }; speaking: { avg: number | null; n: number } } | null;
    lookback_days: number;
    min_cohort_size: number;
}

type Days = 7 | 30 | 'all';

export const dashboardService = {
    fetchDashboard: (days: Days = 'all') =>
        apiClient.get<DashboardPayload>(`/analytics/dashboard?days=${days}`),

    fetchAlerts: () => apiClient.get<DashboardAlert[]>('/analytics/alerts'),
    dismissAlert: (id: string) => apiClient.post(`/analytics/alerts/${id}/dismiss`),

    fetchVocabulary: (opts?: { cefr?: string; awl?: boolean; limit?: number }) => {
        const qs = new URLSearchParams();
        if (opts?.cefr) qs.set('cefr', opts.cefr);
        if (opts?.awl) qs.set('awl', 'true');
        if (opts?.limit) qs.set('limit', String(opts.limit));
        return apiClient.get<VocabularyObservation[]>(`/analytics/vocabulary?${qs}`);
    },
    ingestVocabulary: (
        items: { lemma: string; cefr_level?: string; is_awl?: boolean }[],
        sourceSessionType?: 'writing' | 'speaking',
        sourceSessionId?: string,
    ) =>
        apiClient.post('/analytics/vocabulary', {
            items,
            source_session_type: sourceSessionType,
            source_session_id: sourceSessionId,
        }),

    fetchErrorCards: (dueOnly = false) =>
        apiClient.get<ErrorCard[]>(`/analytics/error-cards${dueOnly ? '?due=now' : ''}`),
    createErrorCard: (card: {
        source_session_type: string;
        source_session_id: string;
        category: string;
        error_text: string;
        correction_text?: string;
        explanation?: string;
    }) => apiClient.post<ErrorCard>('/analytics/error-cards', card),
    reviewErrorCard: (id: string, quality: number) =>
        apiClient.post<ErrorCard>(`/analytics/error-cards/${id}/review`, { quality }),

    fetchMockTests: () => apiClient.get<MockTest[]>('/analytics/mock-tests'),
    createMockTest: (mt: {
        sub_results: Record<string, unknown>;
        overall_band: number;
        readiness_score: number;
        duration_seconds: number;
    }) => apiClient.post<MockTest>('/analytics/mock-tests', mt),

    fetchCalibration: () => apiClient.get<CalibrationEntry[]>('/analytics/calibration'),
    addCalibration: (e: {
        session_type: string;
        session_id: string;
        predicted_band: number;
        actual_band: number;
    }) => apiClient.post<CalibrationEntry>('/analytics/calibration', e),

    fetchShareLinks: () => apiClient.get<ShareLink[]>('/analytics/share-links'),
    createShareLink: (body?: { scope?: string; period_days?: number; ttl_days?: number }) =>
        apiClient.post<ShareLink>('/analytics/share-links', body ?? {}),
    revokeShareLink: (id: string) => apiClient.post(`/analytics/share-links/${id}/revoke`),

    fetchScorecard: (kind: 'writing' | 'speaking', id?: string) => {
        const qs = new URLSearchParams({ kind });
        if (id) qs.set('id', id);
        return apiClient.get<{ scorecard: Scorecard | null }>(`/analytics/scorecard?${qs}`);
    },
    reattemptDiff: (kind: 'writing' | 'speaking', original_id: string, reattempt_id: string) =>
        apiClient.post<ReattemptDiff>('/analytics/reattempt-diff', { kind, original_id, reattempt_id }),

    fetchCohort: () => apiClient.get<CohortBenchmark>('/analytics/cohort'),

    fetchStudyPlanLatest: () =>
        apiClient.get<{ plan: { id: string; plan: { plan: { day: number; focus: string; task: string }[] }; is_active: boolean; created_at: string } | null }>(
            '/analytics/study-plan/latest',
        ),
};
