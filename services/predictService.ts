/**
 * @file Public score-predictor — anonymous, no auth, no tenant header.
 *
 * Uses raw fetch instead of `apiClient` so we don't accidentally inject
 * a stale JWT or X-Institute-Slug into the request. The /predict endpoint
 * is exempted from TenantMiddleware on the backend (see middleware.py).
 *
 * The base URL comes from `VITE_API_BASE_URL`, same as the rest of the FE.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

export interface PredictResult {
    estimated_band: number | null;
    top_focus: string;
    top_strength: string;
    uses_remaining_today: number;
    signup_cta: boolean;
}

export class PredictRateLimitError extends Error {
    signup_cta = true;
    constructor(detail: string) {
        super(detail);
        this.name = 'PredictRateLimitError';
    }
}

export async function predictBand(prompt: string, essay: string): Promise<PredictResult> {
    const resp = await fetch(`${API_BASE}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, essay }),
    });
    if (resp.status === 429) {
        const body = await resp.json().catch(() => ({ detail: 'Daily limit reached.' }));
        throw new PredictRateLimitError(body.detail ?? 'Daily limit reached.');
    }
    if (!resp.ok) {
        const body = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` }));
        throw new Error(body.detail ?? `Request failed (${resp.status})`);
    }
    return (await resp.json()) as PredictResult;
}
