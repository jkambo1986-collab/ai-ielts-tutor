/**
 * @file Lexical sophistication chart — 12-week trend of new B2+ words,
 * AWL coverage, and type-token ratio.
 *
 * Reads `lexical_trend.weeks` from the dashboard payload and renders three
 * inline bar/line tracks. SVG only — no chart library.
 */

import React from 'react';

interface Week {
    week_start: string;
    unique_b2_plus: number;
    awl: number;
    type_token_ratio: number | null;
}

const LexicalTrendChart: React.FC<{ weeks: Week[] }> = ({ weeks }) => {
    if (!weeks.length) {
        return (
            <div className="text-sm text-slate-500 text-center py-3">
                Practice this week to start tracking lexical growth.
            </div>
        );
    }

    const w = 360;
    const h = 80;
    const max = Math.max(...weeks.map(x => x.unique_b2_plus), 5);
    const barW = w / weeks.length;

    return (
        <div className="space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-300">
                New B2+ words per week (bars) — total over the period:
                {' '}<span className="font-semibold">{weeks.reduce((s, x) => s + x.unique_b2_plus, 0)}</span>.
                AWL coverage adds up to{' '}
                <span className="font-semibold">{weeks.reduce((s, x) => s + x.awl, 0)}</span> academic words.
            </p>
            <svg width={w} height={h} className="w-full h-20" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
                {weeks.map((row, i) => {
                    const bh = (row.unique_b2_plus / max) * h;
                    const x = i * barW + 2;
                    const y = h - bh;
                    return (
                        <rect
                            key={row.week_start}
                            x={x}
                            y={y}
                            width={Math.max(2, barW - 4)}
                            height={bh}
                            className="fill-blue-500/80 dark:fill-blue-400/80"
                        >
                            <title>
                                {row.week_start}: {row.unique_b2_plus} B2+ words, {row.awl} AWL
                            </title>
                        </rect>
                    );
                })}
            </svg>
            <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>{weeks[0].week_start}</span>
                <span>{weeks[weeks.length - 1].week_start}</span>
            </div>
        </div>
    );
};

export default LexicalTrendChart;
