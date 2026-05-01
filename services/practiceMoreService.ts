import { apiClient } from './apiClient';

export interface VoiceJournalEntry {
    id: string;
    created_at: string;
    prompt: string;
    duration_seconds: number;
    word_count: number;
    fluency_metrics?: { wpm?: number; pause_ratio?: number };
    lexical_note?: string;
}

export interface VoiceJournalDaily {
    prompt: string;
    entry: VoiceJournalEntry | null;
}

export interface MockTestSummary {
    id: string;
    created_at: string;
    overall_band: number;
    readiness_score: number;
    duration_seconds: number;
    sub_results: Record<string, unknown>;
}

export interface DebateRoomSummary {
    id: string;
    topic: string;
    status: 'queued' | 'live' | 'completed';
    participants_count: number;
    created_at: string;
    started_at?: string;
    completed_at?: string;
}

export interface TutorProfile {
    id: string;
    name: string;
    hourly_rate_cents: number;
    languages: string[];
    specialities: string[];
    rating?: number;
    bio?: string;
}

export interface TutorBooking {
    id: string;
    tutor_id: string;
    tutor_name: string;
    status: 'requested' | 'confirmed' | 'live' | 'completed' | 'cancelled';
    scheduled_at: string;
    duration_minutes: number;
}

export interface ReviewRequest {
    id: string;
    skill: 'writing' | 'speaking';
    session_id: string;
    requested_at: string;
    sla_due_at: string;
    status: 'queued' | 'claimed' | 'completed';
    claimed_by?: string;
    excerpt?: string;
}

export const journalService = {
    today: () => apiClient.get<VoiceJournalDaily>('/speaking/journal/today'),
    list: () => apiClient.get<{ results: VoiceJournalEntry[] }>('/speaking/journal'),
};

export const mockTestService = {
    list: () => apiClient.get<MockTestSummary[]>('/analytics/mock-tests'),
};

export const debateService = {
    queue: () => apiClient.get<{ results: DebateRoomSummary[] }>('/speaking/debate/queue'),
};

export const tutorService = {
    list: () => apiClient.get<{ results: TutorProfile[] }>('/speaking/tutors'),
    bookings: () => apiClient.get<{ results: TutorBooking[] }>('/speaking/bookings'),
    book: (tutor_id: string, scheduled_at: string, duration_minutes: number) =>
        apiClient.post<TutorBooking>('/speaking/bookings', { tutor_id, scheduled_at, duration_minutes }),
    bookingAction: (id: string, action: 'confirm' | 'cancel') =>
        apiClient.post<TutorBooking>(`/speaking/bookings/${id}/${action}`),
};

export const markerQueueService = {
    queue: () => apiClient.get<{ results: ReviewRequest[] }>('/analytics/reviews/queue'),
    claim: (id: string) => apiClient.post<ReviewRequest>(`/analytics/reviews/${id}/claim`),
    complete: (id: string, body: { band: number; notes: string }) =>
        apiClient.post<ReviewRequest>(`/analytics/reviews/${id}/complete`, body),
    payStub: (id: string) => apiClient.get<{ amount_cents: number; currency: string; paid: boolean }>(`/analytics/reviews/${id}/pay-stub`),
};
