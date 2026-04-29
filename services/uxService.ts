/**
 * @file Frontend client for the UX foundation endpoints (resume,
 * notifications, drafts, onboarding, certificate, public profile).
 */

import { apiClient } from './apiClient';

export interface ResumeTarget {
    kind: 'writing_draft' | 'speaking_unanalyzed';
    title: string;
    subtitle: string;
    section: string;
    id: string;
    updated_at: string;
    extra: Record<string, unknown>;
}

export interface AppNotification {
    id: string;
    type: string;
    title: string;
    body: string;
    cta_label: string;
    cta_target: string;
    payload: Record<string, unknown>;
    read_at: string | null;
    dismissed_at: string | null;
    created_at: string;
}

export interface NotificationPrefs {
    in_app: Record<string, boolean>;
    browser_push: Record<string, boolean>;
    email: Record<string, boolean>;
}

export interface WritingDraftRow {
    id: string;
    prompt_hash: string;
    prompt: string;
    essay: string;
    word_count: number;
    task_type: 'task1' | 'task2';
    updated_at: string;
    created_at: string;
}

export interface OnboardInput {
    target_score: number;
    exam_date?: string | null;
    native_language?: string;
    daily_commitment_minutes?: number;
}

export interface PublicProfile {
    name: string;
    target_band: number;
    streak_days: number;
    exam_date: string | null;
    native_language: string;
    recent_writing: { band: number | null; created_at: string; task_type: string }[];
    recent_speaking: { band: number; created_at: string }[];
}

export const uxService = {
    fetchResume: () => apiClient.get<{ resume: ResumeTarget | null }>('/analytics/resume'),

    fetchNotifications: (unreadOnly = false) =>
        apiClient.get<{ notifications: AppNotification[]; unread_count: number }>(
            `/analytics/notifications${unreadOnly ? '?unread=1' : ''}`,
        ),
    markNotificationRead: (id: string) => apiClient.post(`/analytics/notifications/${id}/read`),
    dismissNotification: (id: string) => apiClient.post(`/analytics/notifications/${id}/dismiss`),

    fetchPrefs: () => apiClient.get<{ prefs: NotificationPrefs }>('/analytics/notification-prefs'),
    savePrefs: (prefs: NotificationPrefs) =>
        apiClient.put<{ prefs: NotificationPrefs }>('/analytics/notification-prefs', { prefs }),

    fetchDrafts: () => apiClient.get<{ drafts: WritingDraftRow[] }>('/writing/drafts'),
    upsertDraft: (prompt: string, essay: string, taskType: 'task1' | 'task2' = 'task2') =>
        apiClient.post<WritingDraftRow>('/writing/drafts', { prompt, essay, task_type: taskType }),
    deleteDraft: (promptHash: string) => apiClient.del(`/writing/drafts/${promptHash}`),

    completeOnboarding: (input: OnboardInput) =>
        apiClient.post<{ ok: boolean; onboarded_at: string }>('/analytics/complete-onboarding', input),

    calendarIcsUrl: () => {
        const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8000/api/v1';
        return `${base}/analytics/calendar.ics`;
    },

    certificateUrl: () => {
        const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8000/api/v1';
        return `${base}/analytics/certificate?fmt=pdf`;
    },

    togglePublicProfile: (enabled: boolean) =>
        apiClient.post<{ enabled: boolean; slug: string | null }>(
            '/analytics/public-profile/toggle', { enabled },
        ),

    publicProfileUrl: (slug: string) => {
        const origin = window.location.origin;
        return `${origin}/u/${slug}`;
    },
};
