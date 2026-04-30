/**
 * @file Last-minute exam-day crash plan banner.
 *
 * Visible only when the user's exam_date is within 14 days. Generates a
 * crash-mode 7-day plan via /analytics/study-plan?mode=crash. Mirrors the
 * "Last Minute" version of Road to IELTS — the British Council ships this
 * for free and we should too.
 */

import React, { useState } from 'react';
import { dashboardService } from '../../services/dashboardService';

interface DailyGoal {
    day: number;
    focus: string;
    task: string;
}

const CrashPlanBanner: React.FC<{ daysUntilExam: number }> = ({ daysUntilExam }) => {
    const [plan, setPlan] = useState<DailyGoal[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState(false);

    if (dismissed || daysUntilExam < 0 || daysUntilExam > 14) return null;

    const generate = async () => {
        setLoading(true);
        setError(null);
        try {
            const r = await dashboardService.fetchCrashStudyPlan();
            const planData = r.plan as { plan?: DailyGoal[] } | DailyGoal[] | undefined;
            // Tolerate both shapes the agent might return.
            let goals: DailyGoal[] = [];
            if (Array.isArray(planData)) goals = planData;
            else if (planData && Array.isArray((planData as { plan?: DailyGoal[] }).plan)) {
                goals = (planData as { plan: DailyGoal[] }).plan;
            }
            setPlan(goals);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not generate plan.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-wide font-bold text-rose-700 dark:text-rose-300">
                        Crash plan available
                    </p>
                    <p className="text-sm font-semibold text-rose-950 dark:text-rose-100 mt-0.5">
                        Your exam is in {daysUntilExam} day{daysUntilExam === 1 ? '' : 's'}.
                    </p>
                    <p className="text-xs text-rose-900/80 dark:text-rose-200/80 mt-1">
                        Generate a tight 7-day plan with mock-test priority and weak-skill triage.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {!plan && (
                        <button
                            type="button"
                            onClick={generate}
                            disabled={loading}
                            className="text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 px-3 py-1.5 rounded-md"
                        >
                            {loading ? 'Generating…' : 'Generate plan'}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setDismissed(true)}
                        aria-label="Dismiss"
                        className="text-rose-700/60 hover:text-rose-900 dark:text-rose-200/60 dark:hover:text-rose-100 px-2"
                    >
                        ✕
                    </button>
                </div>
            </div>
            {error && (
                <p role="alert" className="mt-2 text-xs text-rose-800 dark:text-rose-200">{error}</p>
            )}
            {plan && (
                <ol className="mt-3 space-y-1.5">
                    {plan.slice(0, 7).map((g) => (
                        <li key={g.day} className="text-xs text-rose-950 dark:text-rose-100">
                            <span className="font-bold">Day {g.day}:</span> <span className="font-semibold">{g.focus}</span> — {g.task}
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
};

export default CrashPlanBanner;
