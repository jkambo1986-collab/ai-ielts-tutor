/**
 * @file Admin-only client. Calls /api/admin/* endpoints.
 *
 * The 403 returned for non-admin callers is surfaced as a typed error so the
 * UI can hide the admin route gracefully if a user's role changes mid-session.
 */

import { UserRole } from '../types';
import { apiClient } from './apiClient';

export interface SitemapNode {
    id: string;
    title: string;
    path: string;
    description?: string;
    skill?: string;
    admin_only?: boolean;
    children?: SitemapNode[];
    api_endpoints?: string[];
}

export interface SitemapResponse {
    institute: { id: string; name: string; slug: string; plan_tier: string };
    counts: {
        users: number;
        users_pro: number;
        sessions: { writing: number; speaking: number; reading: number; listening: number };
    };
    sections: SitemapNode[];
    viewer: { id: string; email: string; role: UserRole };
}

export interface AdminUserRow {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    subscription_plan: 'free' | 'pro';
    subscription_end_date: string | null;
    is_active: boolean;
    date_joined: string;
    last_login: string | null;
}

export interface UsersListResponse {
    total: number;
    limit: number;
    offset: number;
    users: AdminUserRow[];
}

export interface UsageStatsResponse {
    institute: { name: string; slug: string; plan_tier: string; max_users: number };
    users: {
        total: number;
        active: number;
        pro: number;
        by_role: Record<string, number>;
    };
    sessions: {
        writing: { count: number; avg_band: number };
        speaking_analyzed: number;
        reading: number;
        listening: number;
    };
}

export const adminService = {
    getSitemap: () => apiClient.get<SitemapResponse>('/admin/sitemap'),

    listUsers: (params: { search?: string; role?: string; plan?: string; limit?: number; offset?: number } = {}) => {
        const q = new URLSearchParams();
        if (params.search) q.set('search', params.search);
        if (params.role) q.set('role', params.role);
        if (params.plan) q.set('plan', params.plan);
        if (params.limit !== undefined) q.set('limit', String(params.limit));
        if (params.offset !== undefined) q.set('offset', String(params.offset));
        const qs = q.toString();
        return apiClient.get<UsersListResponse>(`/admin/users${qs ? '?' + qs : ''}`);
    },

    getUsageStats: () => apiClient.get<UsageStatsResponse>('/admin/usage-stats'),

    grantPro: (params: { user_id?: string; user_email?: string; days?: number }) =>
        apiClient.post<{ user: unknown }>('/billing/grant-pro', params),

    bulkGrantPro: (params: { user_emails: string[]; days?: number }) =>
        apiClient.post<{
            total: number;
            granted: number;
            extended: number;
            not_found: number;
            results: Array<{ email: string; status: string }>;
        }>('/billing/bulk-grant-pro', params),

    revokePro: (params: { user_id?: string; user_email?: string }) =>
        apiClient.post<{ user: unknown }>('/billing/revoke-pro', params),

    getAuditLog: (params: { action?: string; actor_email?: string; limit?: number; offset?: number } = {}) => {
        const q = new URLSearchParams();
        if (params.action) q.set('action', params.action);
        if (params.actor_email) q.set('actor_email', params.actor_email);
        if (params.limit !== undefined) q.set('limit', String(params.limit));
        if (params.offset !== undefined) q.set('offset', String(params.offset));
        const qs = q.toString();
        return apiClient.get<{
            total: number;
            limit: number;
            offset: number;
            entries: Array<{
                id: string;
                action: string;
                actor_email: string | null;
                target_email: string | null;
                payload: Record<string, unknown>;
                ip_address: string | null;
                created_at: string;
            }>;
        }>(`/admin/audit-log${qs ? '?' + qs : ''}`);
    },
};
