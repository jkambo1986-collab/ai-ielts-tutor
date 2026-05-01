/**
 * @file Daily Coach Brief — F1.
 *
 * Renders a directive 3-line plan composed server-side from existing data
 * (target gap, due flashcards, weakness). Replaces dashboard hero in Coach
 * view. One card. One decision.
 */

import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import { useAppContext } from '../../App';
import { IELTSSection } from '../../types';
import { Skeleton } from './Skeleton';

interface CoachAction {
    skill: string;
    label: string;
    minutes_estimate: number;
    reason: string;
    target: string;
}

interface CoachBrief {
    minutes_budget: number;
    actions: CoachAction[];
    due_card_count: number;
    target_band: number;
    generated_at: string;
}

const TARGET_TO_SECTION: Record<string, IELTSSection> = {
    Writing: IELTSSection.Writing,
    Speaking: IELTSSection.Speaking,
    Reading: IELTSSection.Reading,
    Listening: IELTSSection.Listening,
    Quiz: IELTSSection.Quiz,
    Dashboard: IELTSSection.Dashboard,
};

const CoachBriefCard: React.FC = () => {
    const { setActiveTab } = useAppContext();
    const [brief, setBrief] = useState<CoachBrief | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        apiClient.get<CoachBrief>('/analytics/coach-brief')
            .then(b => { if (alive) setBrief(b); })
            .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Failed to load coach brief.'); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    if (loading) {
        return (
            <section className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/30 p-5 space-y-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
            </section>
        );
    }

    if (error || !brief || brief.actions.length === 0) {
        return null;
    }

    const totalMinutes = brief.actions.reduce((sum, a) => sum + a.minutes_estimate, 0);

    const handleClick = (a: CoachAction) => {
        const sec = TARGET_TO_SECTION[a.target];
        if (sec) setActiveTab(sec);
    };

    return (
        <section
            className="rounded-xl border border-violet-200 dark:border-violet-900 bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/40 dark:to-blue-950/40 p-5"
            aria-label="Today's coach brief"
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                        Today's brief
                    </p>
                    <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mt-0.5">
                        You have {brief.minutes_budget} minutes. Do this:
                    </h3>
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                    ≈ {totalMinutes} min
                </span>
            </div>

            <ol className="space-y-2">
                {brief.actions.map((a, i) => (
                    <li key={i} className="flex items-start gap-3">
                        <span className="shrink-0 h-6 w-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                            {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                            <button
                                onClick={() => handleClick(a)}
                                className="text-left w-full"
                            >
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 hover:text-violet-700 dark:hover:text-violet-300">
                                    {a.label} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">· {a.minutes_estimate} min</span>
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                                    {a.reason}
                                </p>
                            </button>
                        </div>
                    </li>
                ))}
            </ol>
        </section>
    );
};

export default CoachBriefCard;
