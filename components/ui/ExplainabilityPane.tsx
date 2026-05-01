/**
 * @file F3 — "Why this band?" descriptor explainability pane.
 *
 * Lazy: only fires the Gemini call when the user clicks "Explain band".
 */

import React, { useState } from 'react';
import { apiClient } from '../../services/apiClient';
import Loader from '../Loader';

interface CriterionExplanation {
    name: string;
    band: number;
    descriptorAtBand: string;
    evidence: string[];
    toReachNextBand: string;
}

interface BandExplanation {
    overallBand: number;
    criteria: CriterionExplanation[];
}

interface Props {
    skill: 'writing' | 'speaking';
    band: number;
    /** Writing only: prompt + essay text. */
    writing?: { prompt: string; essay: string };
    /** Speaking only: transcript turns. */
    speaking?: { transcript: { speaker: string; text: string; timestamp?: string }[] };
}

const ExplainabilityPane: React.FC<Props> = ({ skill, band, writing, speaking }) => {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [explanation, setExplanation] = useState<BandExplanation | null>(null);

    const handleExplain = async () => {
        if (explanation) {
            setOpen(o => !o);
            return;
        }
        setLoading(true);
        setError(null);
        setOpen(true);
        try {
            const path = skill === 'writing' ? '/writing/explain-band' : '/speaking/explain-band';
            const body = skill === 'writing'
                ? { prompt: writing?.prompt, essay: writing?.essay, band }
                : { transcript: speaking?.transcript || [], band };
            const r = await apiClient.post<{ explanation: BandExplanation }>(path, body);
            setExplanation(r.explanation);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to explain band.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="mt-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30">
            <button
                onClick={handleExplain}
                aria-expanded={open}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                        Examiner explainability
                    </p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-0.5">
                        Why this band? Decompose into the four IELTS descriptors
                    </p>
                </div>
                <span className={`text-blue-600 dark:text-blue-400 text-sm transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>›</span>
            </button>
            {open && (
                <div className="px-4 pb-4">
                    {loading && <Loader text="Analyzing against the official descriptors…" />}
                    {error && (
                        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    )}
                    {explanation && (
                        <div className="space-y-3">
                            {explanation.criteria.map((c, i) => (
                                <div
                                    key={i}
                                    className="rounded-lg border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-900 p-3"
                                >
                                    <div className="flex items-baseline justify-between gap-3">
                                        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{c.name}</h4>
                                        <span className="text-xs font-bold text-blue-700 dark:text-blue-300">Band {c.band.toFixed(1)}</span>
                                    </div>
                                    <p className="text-xs italic text-slate-600 dark:text-slate-300 mt-1">
                                        “{c.descriptorAtBand}”
                                    </p>
                                    {c.evidence?.length > 0 && (
                                        <ul className="mt-2 space-y-1">
                                            {c.evidence.map((q, j) => (
                                                <li key={j} className="text-xs text-slate-700 dark:text-slate-200 border-l-2 border-blue-400 dark:border-blue-700 pl-2">
                                                    {q}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {c.toReachNextBand && (
                                        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                                            <span className="font-semibold">To reach next band: </span>{c.toReachNextBand}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};

export default ExplainabilityPane;
