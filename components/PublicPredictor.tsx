/**
 * @file Public score-predictor landing component.
 *
 * Mounted on the public marketing path so prospective students can paste
 * an essay and get an instant band estimate without signing up. Caps at
 * 2 attempts per IP per day (server-enforced); after the second attempt
 * the response sets signup_cta=true and the FE swaps to a "create
 * account to keep practising" panel.
 *
 * This is THE lead-gen tool every IELTS competitor has — Magoosh, Deep
 * IELTS, Upscore, IELTAI all use the same pattern.
 */

import React, { useState } from 'react';
import { predictBand, PredictRateLimitError, PredictResult } from '../services/predictService';

const PublicPredictor: React.FC<{ onSignup?: () => void }> = ({ onSignup }) => {
    const [prompt, setPrompt] = useState('');
    const [essay, setEssay] = useState('');
    const [result, setResult] = useState<PredictResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [limitReached, setLimitReached] = useState(false);

    const wordCount = essay.trim().split(/\s+/).filter(Boolean).length;
    const canSubmit = prompt.trim().length >= 10 && wordCount >= 50 && !loading;

    const submit = async () => {
        setLoading(true);
        setError(null);
        try {
            const r = await predictBand(prompt, essay);
            setResult(r);
            if (r.signup_cta) setLimitReached(true);
        } catch (e) {
            if (e instanceof PredictRateLimitError) {
                setLimitReached(true);
                setError(e.message);
            } else {
                setError(e instanceof Error ? e.message : 'Something went wrong.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto p-6">
            <header className="mb-6 text-center">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                    Free IELTS Writing Band Estimate
                </h1>
                <p className="text-slate-600 dark:text-slate-300 mt-2">
                    Paste your Task 2 essay. Get an instant AI band score and one focused coaching line.
                    No signup required.
                </p>
            </header>

            {!result && (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Task 2 prompt
                        </label>
                        <textarea
                            className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm"
                            rows={3}
                            placeholder="Paste the IELTS Task 2 question here…"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Your essay
                        </label>
                        <textarea
                            className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm"
                            rows={12}
                            placeholder="Paste your full essay here. Aim for 250+ words."
                            value={essay}
                            onChange={(e) => setEssay(e.target.value)}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            {wordCount} words {wordCount < 50 ? '· need at least 50 to get a useful estimate' : ''}
                        </p>
                    </div>
                    {error && (
                        <div role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-sm px-4 py-3">
                            {error}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={submit}
                        disabled={!canSubmit}
                        className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        {loading ? 'Estimating…' : 'Estimate my band'}
                    </button>
                </div>
            )}

            {result && (
                <div className="space-y-4">
                    <div className="text-center bg-blue-100 dark:bg-blue-900/40 p-6 rounded-lg">
                        <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 uppercase tracking-wide">
                            Estimated band
                        </p>
                        <p className="text-6xl font-bold text-blue-700 dark:text-blue-300 mt-2">
                            {result.estimated_band !== null ? result.estimated_band.toFixed(1) : '—'}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
                            Estimated by AI; expect ±0.5 band variance vs a human examiner.
                        </p>
                    </div>

                    <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 px-4 py-3">
                        <p className="text-xs uppercase tracking-wide font-semibold text-emerald-800 dark:text-emerald-200">
                            Strength
                        </p>
                        <p className="text-sm text-emerald-900 dark:text-emerald-100 mt-1">{result.top_strength}</p>
                    </div>

                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 px-4 py-3">
                        <p className="text-xs uppercase tracking-wide font-semibold text-amber-900 dark:text-amber-200">
                            Focus next
                        </p>
                        <p className="text-sm text-amber-950 dark:text-amber-100 mt-1">{result.top_focus}</p>
                    </div>

                    {limitReached ? (
                        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 px-4 py-4 text-center">
                            <p className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                                That's your two free attempts for today.
                            </p>
                            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                                Sign up to keep practising — full feedback, SRS review cards, streak tracking,
                                and personalised study plans included.
                            </p>
                            <button
                                type="button"
                                onClick={onSignup}
                                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md"
                            >
                                Create a free account
                            </button>
                        </div>
                    ) : (
                        <p className="text-xs text-slate-500 text-center">
                            {result.uses_remaining_today} free attempt
                            {result.uses_remaining_today === 1 ? '' : 's'} remaining today.
                        </p>
                    )}

                    <button
                        type="button"
                        onClick={() => { setResult(null); setEssay(''); setPrompt(''); }}
                        className="text-sm text-slate-600 hover:text-slate-800 dark:text-slate-300 underline"
                        disabled={limitReached}
                    >
                        Try another essay
                    </button>
                </div>
            )}
        </div>
    );
};

export default PublicPredictor;
