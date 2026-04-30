/**
 * @file Pre-session SRS warmup banner.
 *
 * Mounted on each section's landing page. If the student has SRS cards due
 * matching the section type, a slim banner offers a 30-second warmup before
 * the session. Connecting SRS → upcoming session is the highest-leverage
 * retention loop in the app, and the underlying /analytics/warmup endpoint
 * already exists — this component is just the FE consumer.
 *
 * Dismissible per-section per-day via localStorage so the student isn't
 * nagged across multiple page visits.
 */

import React, { useEffect, useState } from 'react';
import { dashboardService, WarmupPayload, ErrorCard } from '../../services/dashboardService';

type SessionType = 'writing' | 'speaking' | 'reading' | 'listening';

const dismissedTodayKey = (sessionType: SessionType) => {
    const today = new Date().toISOString().slice(0, 10);
    return `warmup_dismissed_${sessionType}_${today}`;
};

const WarmupBanner: React.FC<{ sessionType: SessionType }> = ({ sessionType }) => {
    const [data, setData] = useState<WarmupPayload | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [reviewIdx, setReviewIdx] = useState(0);

    useEffect(() => {
        try {
            if (localStorage.getItem(dismissedTodayKey(sessionType)) === '1') {
                setDismissed(true);
                return;
            }
        } catch { /* ignore */ }

        let cancelled = false;
        dashboardService.fetchWarmup(sessionType)
            .then(d => { if (!cancelled) setData(d); })
            .catch(() => { /* silent */ });
        return () => { cancelled = true; };
    }, [sessionType]);

    const dismiss = () => {
        setDismissed(true);
        try { localStorage.setItem(dismissedTodayKey(sessionType), '1'); } catch { /* ignore */ }
    };

    if (dismissed || !data || data.due_srs_count === 0) return null;

    const top = data.due_categories[0]?.category;
    const summary = top
        ? `${data.due_srs_count} cards due — top category: ${top.replace('_', ' ')}.`
        : `${data.due_srs_count} cards due.`;

    return (
        <div
            role="status"
            className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-4 py-3 text-sm"
        >
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-blue-900 dark:text-blue-100">
                    Warm up before this {sessionType} session?
                </p>
                <p className="text-xs text-blue-800/80 dark:text-blue-200/80 mt-0.5">{summary}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <button
                    type="button"
                    onClick={() => { setReviewIdx(0); setReviewing(true); }}
                    className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    Review {Math.min(3, data.suggested_cards.length)}
                </button>
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Dismiss warmup"
                    className="text-xs text-blue-900/60 hover:text-blue-900 dark:text-blue-200/60 dark:hover:text-blue-100 px-2"
                >
                    Skip
                </button>
            </div>
            {reviewing && data.suggested_cards.length > 0 && (
                <ReviewModal
                    cards={data.suggested_cards}
                    index={reviewIdx}
                    onNext={() => setReviewIdx(i => i + 1)}
                    onClose={() => { setReviewing(false); dismiss(); }}
                />
            )}
        </div>
    );
};

const ReviewModal: React.FC<{
    cards: ErrorCard[];
    index: number;
    onNext: () => void;
    onClose: () => void;
}> = ({ cards, index, onNext, onClose }) => {
    const card = cards[index];
    if (!card) {
        // Past the last card — close the modal.
        setTimeout(onClose, 0);
        return null;
    }
    const last = index === cards.length - 1;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                onClick={e => e.stopPropagation()}
                className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 p-5"
            >
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                    {card.category.replace('_', ' ')} · {index + 1} / {cards.length}
                </p>
                <p className="font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                    {card.error_text}
                </p>
                {card.correction_text && (
                    <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
                        Better: {card.correction_text}
                    </p>
                )}
                {card.explanation && (
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{card.explanation}</p>
                )}
                <div className="mt-4 flex items-center justify-end gap-2">
                    <button onClick={onClose} className="text-xs px-3 py-1.5 text-slate-600 hover:text-slate-800 dark:text-slate-300">
                        Close
                    </button>
                    <button
                        onClick={last ? onClose : onNext}
                        className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md"
                    >
                        {last ? 'Done' : 'Next'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WarmupBanner;
