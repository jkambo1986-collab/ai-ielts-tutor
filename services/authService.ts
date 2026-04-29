/**
 * @file Auth service — calls the Django backend instead of localStorage.
 *
 * Exports preserve the original signatures so App.tsx, AuthPage.tsx, and the
 * rest of the components keep working without changes. The only behavioural
 * differences from the localStorage version:
 *   - subscription expiry is enforced server-side as well as client-side
 *   - upgradeUserPlan takes a real path through the backend (still a stub on
 *     the server until Stripe is wired up)
 *   - `password` is never present on returned UserProfile (it never was on the
 *     wire — the old code just deleted it before resolving)
 */

import { EnglishProficiencyLevel, NativeLanguageCode, SubscriptionPlan, UserProfile, UserRole } from '../types';
import { apiClient, ApiError, tokenStore } from './apiClient';

interface BackendUser {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    target_score: number;
    adaptive_learning_enabled: boolean;
    native_language: NativeLanguageCode;
    english_proficiency_level: EnglishProficiencyLevel;
    exam_date: string | null;
    daily_commitment_minutes: number | null;
    public_progress_slug: string | null;
    theme_pref: 'system' | 'light' | 'dark';
    onboarded_at: string | null;
    subscription_plan: 'free' | 'pro';
    subscription_end_date: string | null;
    is_pro: boolean;
    institute_slug: string | null;
    created_at: string;
}

interface AuthResponse {
    user: BackendUser;
    access: string;
    refresh: string;
}

const fromBackend = (u: BackendUser): UserProfile => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    targetScore: u.target_score,
    isAdaptiveLearningEnabled: u.adaptive_learning_enabled,
    nativeLanguage: u.native_language ?? '',
    englishProficiencyLevel: u.english_proficiency_level ?? '',
    examDate: u.exam_date ?? null,
    dailyCommitmentMinutes: u.daily_commitment_minutes ?? null,
    publicProgressSlug: u.public_progress_slug ?? null,
    themePref: u.theme_pref ?? 'system',
    onboardedAt: u.onboarded_at ?? null,
    plan: u.subscription_plan === 'pro' ? SubscriptionPlan.Pro : SubscriptionPlan.Free,
    subscriptionEndDate: u.subscription_end_date ?? undefined,
    dateJoined: u.created_at,
    instituteSlug: u.institute_slug ?? undefined,
});

export const authService = {
    signup: async (name: string, email: string, password: string): Promise<UserProfile> => {
        try {
            const data = await apiClient.post<AuthResponse>('/auth/signup', { name, email, password });
            tokenStore.set(data.access, data.refresh);
            return fromBackend(data.user);
        } catch (e) {
            if (e instanceof ApiError) throw new Error(e.message);
            throw e;
        }
    },

    login: async (email: string, password: string): Promise<UserProfile> => {
        try {
            const data = await apiClient.post<AuthResponse>('/auth/login', { email, password });
            tokenStore.set(data.access, data.refresh);
            return fromBackend(data.user);
        } catch (e) {
            if (e instanceof ApiError) throw new Error(e.message);
            throw e;
        }
    },

    logout: () => {
        const refresh = tokenStore.getRefresh();
        if (refresh) {
            // Fire-and-forget — best-effort blacklist, don't block the UI on it
            apiClient.post('/auth/logout', { refresh }).catch(() => undefined);
        }
        tokenStore.clear();
    },

    /**
     * Synchronous shim — App.tsx still calls this on mount expecting either a
     * UserProfile or null. We can only check whether a token *exists* synchronously;
     * calling /me to validate it has to be async. For now, return null when no
     * token, and let App.tsx call refreshSession() async to populate.
     *
     * App.tsx hydration was already async-friendly (sets isLoadingSession), so
     * this does not break anything — it just defers the actual user-profile
     * fetch until refreshSession resolves.
     */
    checkSession: (): UserProfile | null => {
        // Returning null here keeps the type, but App.tsx will await refreshSession()
        // immediately after to get the actual profile.
        return null;
    },

    refreshSession: async (): Promise<UserProfile | null> => {
        if (!tokenStore.getAccess() && !tokenStore.getRefresh()) return null;
        try {
            const u = await apiClient.get<BackendUser>('/auth/me');
            return fromBackend(u);
        } catch (e) {
            if (e instanceof ApiError && e.isAuthError) {
                tokenStore.clear();
            }
            return null;
        }
    },

    updateUserProfile: async (
        _userId: string,
        updates: Partial<UserProfile>,
    ): Promise<UserProfile> => {
        const body: Record<string, unknown> = {};
        if (updates.name !== undefined) body.name = updates.name;
        if (updates.targetScore !== undefined) body.target_score = updates.targetScore;
        if (updates.isAdaptiveLearningEnabled !== undefined)
            body.adaptive_learning_enabled = updates.isAdaptiveLearningEnabled;
        if (updates.nativeLanguage !== undefined) body.native_language = updates.nativeLanguage;
        if (updates.englishProficiencyLevel !== undefined)
            body.english_proficiency_level = updates.englishProficiencyLevel;
        if (updates.examDate !== undefined) body.exam_date = updates.examDate;
        if (updates.dailyCommitmentMinutes !== undefined)
            body.daily_commitment_minutes = updates.dailyCommitmentMinutes;
        if (updates.themePref !== undefined) body.theme_pref = updates.themePref;
        const u = await apiClient.patch<BackendUser>('/auth/me', body);
        return fromBackend(u);
    },

    upgradeUserPlan: async (_userId: string): Promise<UserProfile> => {
        const data = await apiClient.post<{ user: BackendUser }>('/billing/upgrade');
        return fromBackend(data.user);
    },

    requestPasswordReset: async (email: string): Promise<void> => {
        await apiClient.post('/auth/password-reset-request', { email });
    },
};
