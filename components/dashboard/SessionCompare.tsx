/**
 * @file Side-by-side session comparison (P5).
 *
 * Pick two writing or speaking sessions; show their scorecards next to
 * each other with the rubric diff (uses /analytics/reattempt-diff).
 */

import React, { useState } from 'react';
import { dashboardService, ReattemptDiff } from '../../services/dashboardService';
import { Section } from './cards';

interface Props {
    kind: 'writing' | 'speaking';
    candidates: { id: string; label: string }[];
    onClose: () => void;
}

const SessionCompare: React.FC<Props> = ({ kind, candidates, onClose }) => {
    const [a, setA] = useState<string | null>(null);
    const [b, setB] = useState<string | null>(null);
    const [diff, setDiff] = useState<ReattemptDiff | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const compare = async () => {
        if (!a || !b || a === b) return;
        setLoading(true); setError(null);
        try {
            const r = await dashboardService.reattemptDiff(kind, a, b);
            setDiff(r);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to compare.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Section title="Compare two sessions" subtitle="See score deltas across each rubric criterion." right={
            <button onClick={onClose} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Close</button>
        }>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <SessionPicker label="Earlier session" value={a} onChange={setA} candidates={candidates} />
                <SessionPicker label="Later session" value={b} onChange={setB} candidates={candidates} />
            </div>
            <button
                onClick={compare}
                disabled={!a || !b || a === b || loading}
                className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-2 rounded"
            >
                {loading ? 'Comparing…' : 'Compare'}
            </button>
            {error && <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
            {diff && (
                <div className="mt-4 space-y-3">
                    <div className="flex items-baseline justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-300">Overall delta</span>
                        <span className={`text-xl font-bold ${
                            diff.overall_delta == null ? 'text-slate-400'
                                : diff.overall_delta > 0 ? 'text-emerald-600 dark:text-emerald-400'
                                : diff.overall_delta < 0 ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-600 dark:text-slate-300'
                        }`}>
                            {diff.overall_delta == null ? '—' : `${diff.overall_delta > 0 ? '+' : ''}${diff.overall_delta.toFixed(2)}`}
                        </span>
                    </div>
                    <ul className="space-y-2">
                        {diff.criteria.map(c => (
                            <li key={c.key} className="rounded border border-slate-200 dark:border-slate-800 p-3">
                                <div className="flex items-baseline justify-between">
                                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.label}</span>
                                    <span className="text-xs text-slate-500">
                                        {c.before == null ? '—' : c.before.toFixed(1)} →{' '}
                                        <span className="font-semibold text-slate-800 dark:text-slate-100">{c.after == null ? '—' : c.after.toFixed(1)}</span>
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Section>
    );
};

const SessionPicker: React.FC<{ label: string; value: string | null; onChange: (v: string) => void; candidates: { id: string; label: string }[] }> = ({ label, value, onChange, candidates }) => (
    <div>
        <label className="text-xs uppercase tracking-wide text-slate-500">{label}</label>
        <select
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            className="block w-full mt-1 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
        >
            <option value="">— choose —</option>
            {candidates.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
            ))}
        </select>
    </div>
);

export default SessionCompare;
