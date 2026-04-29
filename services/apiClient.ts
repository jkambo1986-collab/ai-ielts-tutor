/**
 * @file Thin fetch wrapper for the Django backend.
 *
 * Responsibilities:
 *  - Attach the institute slug as `X-Institute-Slug` (so multi-tenancy works
 *    without subdomains in dev).
 *  - Attach the JWT access token as `Authorization: Bearer ...`.
 *  - On 401, attempt one silent refresh using the stored refresh token, then
 *    retry the original request once.
 *  - Surface readable errors back to callers (matches the AIError shape that
 *    the original geminiService.ts threw, so component code doesn't need to
 *    change).
 *
 * The token storage layer is a single helper at the bottom — easy to swap out
 * for HttpOnly cookies later if we move auth off localStorage.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8000/api/v1';
const INSTITUTE_SLUG =
    (import.meta.env.VITE_DEFAULT_INSTITUTE_SLUG as string | undefined) || 'default';

const ACCESS_KEY = 'ielts_access_token';
const REFRESH_KEY = 'ielts_refresh_token';

export const tokenStore = {
    getAccess: () => localStorage.getItem(ACCESS_KEY),
    getRefresh: () => localStorage.getItem(REFRESH_KEY),
    set: (access: string, refresh: string) => {
        localStorage.setItem(ACCESS_KEY, access);
        localStorage.setItem(REFRESH_KEY, refresh);
    },
    setAccess: (access: string) => localStorage.setItem(ACCESS_KEY, access),
    clear: () => {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
    },
};

export class ApiError extends Error {
    constructor(public status: number, message: string, public payload?: unknown) {
        super(message);
        this.name = 'ApiError';
    }

    /** True if this is a 401/403 from auth state being invalid. */
    get isAuthError() {
        return this.status === 401 || this.status === 403;
    }

    /** True if the user needs to upgrade their plan. */
    get isPaymentRequired() {
        return this.status === 402;
    }

    /** True for AI-provider failures (Gemini timeout, quota, transient 5xx). */
    get isAiError() {
        return this.status === 502 || this.status === 503;
    }

    /** True if the AI provider is in a fatal misconfiguration state. */
    get isAiFatal() {
        return this.status === 503;
    }
}

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
    body?: unknown;
    /** Skip the 401-refresh dance. Used internally by /auth/refresh itself. */
    skipRefresh?: boolean;
}

async function rawRequest(path: string, opts: RequestOptions = {}): Promise<Response> {
    const headers: Record<string, string> = {
        'X-Institute-Slug': INSTITUTE_SLUG,
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const access = tokenStore.getAccess();
    if (access) headers['Authorization'] = `Bearer ${access}`;

    return fetch(`${API_BASE}${path}`, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
}

async function refreshAccessToken(): Promise<boolean> {
    const refresh = tokenStore.getRefresh();
    if (!refresh) return false;

    const resp = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Institute-Slug': INSTITUTE_SLUG },
        body: JSON.stringify({ refresh }),
    });

    if (!resp.ok) {
        tokenStore.clear();
        return false;
    }
    const data = await resp.json();
    tokenStore.setAccess(data.access);
    if (data.refresh) localStorage.setItem(REFRESH_KEY, data.refresh);
    return true;
}

/**
 * Pull a human-readable message out of a DRF error body. DRF returns:
 *   - {"detail": "..."}                        for permission / generic errors
 *   - {"non_field_errors": ["..."]}            for cross-field validation
 *   - {"<field>": ["msg1", "msg2"], ...}       for field-level validation
 *   - {"<field>": {"<sub>": ["..."]}}          for nested serializers
 * We flatten the first useful string we find and prefix field-level errors
 * with the field name so the user sees what's wrong.
 */
function extractErrorMessage(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const obj = payload as Record<string, unknown>;
    if (typeof obj.detail === 'string') return obj.detail;
    const nfe = obj.non_field_errors;
    if (Array.isArray(nfe) && typeof nfe[0] === 'string') return nfe[0];
    for (const [field, value] of Object.entries(obj)) {
        if (Array.isArray(value) && typeof value[0] === 'string') {
            return field === 'non_field_errors' ? value[0] : `${humanizeField(field)}: ${value[0]}`;
        }
        if (value && typeof value === 'object') {
            const nested = extractErrorMessage(value);
            if (nested) return nested;
        }
    }
    return null;
}

function humanizeField(field: string): string {
    return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    let resp = await rawRequest(path, opts);

    if (resp.status === 401 && !opts.skipRefresh) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            resp = await rawRequest(path, opts);
        }
    }

    if (!resp.ok) {
        let payload: unknown = null;
        let message = `Request failed (${resp.status})`;
        try {
            payload = await resp.json();
            message = extractErrorMessage(payload) ?? message;
        } catch {
            // non-JSON body — fall back to status text
            message = resp.statusText || message;
        }
        throw new ApiError(resp.status, message, payload);
    }

    if (resp.status === 204) return undefined as T;
    return (await resp.json()) as T;
}

export const apiClient = {
    get: <T>(path: string) => apiRequest<T>(path),
    post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
    put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
    patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
    del: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

export const apiConfig = {
    baseUrl: API_BASE,
    instituteSlug: INSTITUTE_SLUG,
};
