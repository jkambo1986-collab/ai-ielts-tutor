/**
 * @file Daily commitment progress ring for the dashboard.
 *
 * Renders a small SVG ring filled by today's practice minutes / commitment.
 * When the user is past 6pm local time and < 50% complete, the parent
 * dashboard can pair this with a banner; the ring itself is silent and
 * always-visible whenever a commitment is set.
 *
 * Returns null when no commitment exists (user skipped that onboarding step).
 */

import React from 'react';

interface Props {
    minutesToday: number;
    commitmentMinutes: number;
    progress: number | null;  // 0..1, server-clipped; null means no commitment set
}

const SIZE = 56;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

const CommitmentRing: React.FC<Props> = ({ minutesToday, commitmentMinutes, progress }) => {
    if (progress == null || commitmentMinutes <= 0) return null;

    const pct = Math.max(0, Math.min(1, progress));
    const dash = CIRC * pct;
    const done = pct >= 1;

    const ringColor = done
        ? 'stroke-emerald-500'
        : pct >= 0.5
            ? 'stroke-blue-500'
            : 'stroke-amber-500';

    const remaining = Math.max(0, commitmentMinutes - minutesToday);

    return (
        <div
            className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
            role="status"
            aria-label={`Daily commitment: ${minutesToday} of ${commitmentMinutes} minutes`}
        >
            <svg width={SIZE} height={SIZE} className="-rotate-90">
                <circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    className="stroke-slate-200 dark:stroke-slate-700"
                    strokeWidth={STROKE}
                />
                <circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    className={ringColor}
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${CIRC - dash}`}
                />
            </svg>
            <div className="text-xs text-slate-700 dark:text-slate-200">
                <p className="font-semibold">
                    {done
                        ? 'Daily goal hit'
                        : `${minutesToday.toFixed(0)} / ${commitmentMinutes} min`}
                </p>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    {done
                        ? 'Anything more is a bonus.'
                        : `${remaining.toFixed(0)} min to go today.`}
                </p>
            </div>
        </div>
    );
};

export default CommitmentRing;
