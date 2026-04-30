/**
 * @file Reading words-per-minute widget for the dashboard.
 *
 * Shows current avg WPM, the band-target, and a tiny sparkline of recent
 * sessions. Reads `reading_wpm` from the dashboard payload — no separate
 * fetch.
 */

import React from 'react';

interface Props {
    avgWpm: number | null;
    targetWpm: number | null;
    samples: { wpm: number; at: string }[];
}

const ReadingWpmWidget: React.FC<Props> = ({ avgWpm, targetWpm, samples }) => {
    if (avgWpm === null || targetWpm === null) return null;

    const onTarget = avgWpm >= targetWpm;
    const tone = onTarget
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-100'
        : 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100';

    // Sparkline: normalise WPM samples into an SVG polyline.
    const w = 120;
    const h = 32;
    const max = Math.max(...samples.map((s) => s.wpm), targetWpm);
    const min = Math.min(...samples.map((s) => s.wpm), targetWpm * 0.6);
    const points = samples.map((s, i) => {
        const x = samples.length > 1 ? (i / (samples.length - 1)) * w : w / 2;
        const y = h - ((s.wpm - min) / Math.max(1, max - min)) * h;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    return (
        <div className={`rounded-lg border px-4 py-3 ${tone}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">
                        Reading pace
                    </p>
                    <p className="text-2xl font-bold mt-0.5 leading-none">
                        {avgWpm} <span className="text-xs font-medium opacity-70">wpm</span>
                    </p>
                    <p className="text-xs mt-0.5 opacity-80">
                        Target for your band: {targetWpm} wpm — {onTarget ? 'on track' : `${targetWpm - avgWpm} wpm to go`}
                    </p>
                </div>
                {samples.length >= 2 && (
                    <svg width={w} height={h} className="shrink-0 opacity-80">
                        <polyline
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                            points={points}
                        />
                    </svg>
                )}
            </div>
        </div>
    );
};

export default ReadingWpmWidget;
