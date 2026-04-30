/**
 * @file Helpful / Not-helpful thumbs on AI-generated feedback.
 *
 * On thumbs-down, opens a tiny modal with 4 reason radios + optional
 * note. Posts to /analytics/feedback-votes. Local state hides the
 * thumbs after a vote so the user knows it stuck.
 *
 * Foundation for Hard 3 RLHF aggregation.
 */

import React, { useState } from 'react';
import { apiClient } from '../../services/apiClient';

interface Props {
    /** Identifies the AI agent that generated this output, e.g. 'writing_eval'. */
    agent: string;
    /** Optional sub-criterion, e.g. 'lexicalResource'. */
    criterion?: string;
    /** Optional session/row id this feedback came from. */
    targetId?: string;
}

const REASONS: { code: string; label: string }[] = [
    { code: 'wrong_band', label: 'Wrong band' },
    { code: 'missed_errors', label: 'Missed errors' },
    { code: 'too_generic', label: 'Too generic' },
    { code: 'other', label: 'Other' },
];

const FeedbackThumbs: React.FC<Props> = ({ agent, criterion = '', targetId }) => {
    const [voted, setVoted] = useState<'up' | 'down' | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [reason, setReason] = useState<string>('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const post = async (helpful: boolean, withReason = '', withNote = '') => {
        try {
            await apiClient.post('/analytics/feedback-votes', {
                agent, criterion, target_id: targetId,
                helpful, reason: withReason, note: withNote,
            });
        } catch { /* silent — vote is non-critical */ }
    };

    const onUp = async () => {
        setVoted('up');
        post(true);
    };

    const onDown = () => {
        setVoted('down');
        setShowModal(true);
    };

    const submitDown = async () => {
        setSubmitting(true);
        await post(false, reason, note);
        setSubmitting(false);
        setShowModal(false);
    };

    if (voted) {
        return (
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
                Thanks — your feedback improves the AI.
            </p>
        );
    }

    return (
        <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 mr-1">Was this helpful?</span>
            <button
                type="button"
                onClick={onUp}
                aria-label="Helpful"
                className="text-xs px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-slate-600 dark:text-slate-300"
            >
                ↑
            </button>
            <button
                type="button"
                onClick={onDown}
                aria-label="Not helpful"
                className="text-xs px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-slate-600 dark:text-slate-300"
            >
                ↓
            </button>

            {showModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
                    onClick={() => setShowModal(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 p-5"
                    >
                        <p className="font-semibold text-slate-900 dark:text-slate-100 mb-3">
                            What was wrong?
                        </p>
                        <div className="space-y-2">
                            {REASONS.map((r) => (
                                <label key={r.code} className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="radio"
                                        name="reason"
                                        value={r.code}
                                        checked={reason === r.code}
                                        onChange={() => setReason(r.code)}
                                    />
                                    <span>{r.label}</span>
                                </label>
                            ))}
                        </div>
                        <textarea
                            placeholder="Optional details (we read every one)"
                            className="mt-3 w-full p-2 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800"
                            rows={3}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                        <div className="mt-3 flex justify-end gap-2">
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-xs px-3 py-1.5 text-slate-600 dark:text-slate-300"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={submitDown}
                                disabled={submitting}
                                className="text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 px-3 py-1.5 rounded-md"
                            >
                                {submitting ? 'Sending…' : 'Submit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FeedbackThumbs;
