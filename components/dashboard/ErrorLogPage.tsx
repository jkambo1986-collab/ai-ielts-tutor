/**
 * @file SRS error-log review page (#22).
 * Cards are due_at-sorted; user grades 0..5 (SM-2). Backend reschedules.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { dashboardService, ErrorCard } from '../../services/dashboardService';

const QUALITY_LABELS: Record<number, string> = {
    0: 'Blank — couldn\'t recall',
    1: 'Wrong, looked obvious in hindsight',
    2: 'Wrong, but close',
    3: 'Hard but correct',
    4: 'Correct with effort',
    5: 'Easy / instant',
};

const ErrorLogPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
    const [cards, setCards] = useState<ErrorCard[] | null>(null);
    const [showAll, setShowAll] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchCards = useCallback(async () => {
        try {
            const list = await dashboardService.fetchErrorCards(!showAll);
            setCards(list);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load cards');
        }
    }, [showAll]);

    useEffect(() => { fetchCards(); }, [fetchCards]);

    const due = useMemo(() => cards?.filter(c => new Date(c.due_at) <= new Date()) ?? [], [cards]);
    const queue = showAll ? cards ?? [] : due;
    const current = queue[0];

    const review = async (q: number) => {
        if (!current) return;
        setSubmitting(true);
        try {
            await dashboardService.reviewErrorCard(current.id, q);
            await fetchCards();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Error log review</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Spaced repetition for past mistakes — 5 minutes a day locks them in.</p>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 flex items-center gap-1">
                        <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
                        Show all (not just due)
                    </label>
                    {onBack && (
                        <button onClick={onBack} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                            ← Back
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 rounded">
                    {error}
                </div>
            )}

            {!cards ? (
                <p className="text-sm text-slate-400">Loading…</p>
            ) : queue.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        No cards {showAll ? 'in your error log yet' : 'due right now'}.
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                        New cards are added when AI flags weaknesses in your writing or speaking.
                    </p>
                </div>
            ) : current ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
                    <div className="flex items-baseline justify-between text-xs text-slate-500 mb-3">
                        <span className="uppercase tracking-wide">{current.category.replace('_', ' ')}</span>
                        <span>{queue.length} card{queue.length === 1 ? '' : 's'} in queue</span>
                    </div>

                    <p className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-3">
                        {current.error_text}
                    </p>
                    {current.correction_text && (
                        <div className="rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200 mb-2">
                            <strong>Correction:</strong> {current.correction_text}
                        </div>
                    )}
                    {current.explanation && (
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{current.explanation}</p>
                    )}

                    <p className="text-xs text-slate-500 mb-2">How well did you recall this?</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[0, 1, 2, 3, 4, 5].map(q => (
                            <button
                                key={q}
                                disabled={submitting}
                                onClick={() => review(q)}
                                className={`
                                    text-left text-xs rounded-md border px-3 py-2
                                    ${q < 3
                                        ? 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                                        : 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'}
                                    hover:opacity-80 disabled:opacity-50
                                `}
                            >
                                <span className="font-bold">{q}</span> — {QUALITY_LABELS[q]}
                            </button>
                        ))}
                    </div>

                    <div className="text-[11px] text-slate-400 mt-4 flex justify-between">
                        <span>Repetitions: {current.repetitions}</span>
                        <span>Interval: {current.interval_days}d</span>
                        <span>Ease: {current.ease.toFixed(2)}</span>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default ErrorLogPage;
