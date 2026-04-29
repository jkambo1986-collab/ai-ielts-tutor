/**
 * @file Small dependency-free SVG visualisations for the dashboard.
 */

import React from 'react';

// -- Streak heatmap (#12) -- //

export const Heatmap12W: React.FC<{ grid: number[][] }> = ({ grid }) => {
    if (!grid?.length) return null;
    const cell = 14;
    const gap = 3;
    const cols = grid.length;
    const rows = 7;
    const max = Math.max(1, ...grid.flat());
    const intensity = (n: number) => {
        if (n <= 0) return 'fill-slate-200 dark:fill-slate-800';
        const ratio = n / max;
        if (ratio < 0.25) return 'fill-emerald-200 dark:fill-emerald-900';
        if (ratio < 0.5) return 'fill-emerald-300 dark:fill-emerald-700';
        if (ratio < 0.8) return 'fill-emerald-400 dark:fill-emerald-600';
        return 'fill-emerald-500 dark:fill-emerald-500';
    };
    const width = cols * (cell + gap);
    const height = rows * (cell + gap);
    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Practice activity over the last 12 weeks">
            {grid.map((week, x) =>
                week.map((count, y) => (
                    <rect
                        key={`${x}-${y}`}
                        x={x * (cell + gap)}
                        y={y * (cell + gap)}
                        width={cell}
                        height={cell}
                        rx={2}
                        className={intensity(count)}
                    >
                        <title>{count} session{count === 1 ? '' : 's'}</title>
                    </rect>
                )),
            )}
        </svg>
    );
};

// -- Target gap gauge (#11) -- //

export const TargetGauge: React.FC<{ current: number | null; target: number; label: string }> = ({ current, target, label }) => {
    const safeTarget = target || 7.0;
    const safeCurrent = current ?? 0;
    const pct = Math.min(100, Math.max(0, (safeCurrent / 9) * 100));
    const targetPct = Math.min(100, (safeTarget / 9) * 100);
    const reached = current != null && current >= safeTarget;
    const gap = current == null ? null : Math.max(0, +(safeTarget - current).toFixed(1));

    return (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
                {current == null ? (
                    <span className="text-xs text-slate-400">No data</span>
                ) : reached ? (
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">at target</span>
                ) : (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        gap <span className="font-semibold text-slate-700 dark:text-slate-200">{gap?.toFixed(1)}</span>
                    </span>
                )}
            </div>
            <div className="relative h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                    className={`h-full ${reached ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-500 to-teal-400'}`}
                    style={{ width: `${pct}%` }}
                />
                <div
                    className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-amber-500"
                    style={{ left: `calc(${targetPct}% - 1px)` }}
                    title={`Target ${safeTarget.toFixed(1)}`}
                />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>{(current ?? 0).toFixed(1)}</span>
                <span>target {safeTarget.toFixed(1)}</span>
            </div>
        </div>
    );
};

// -- Trend arrow used inline on stat cards (#15) -- //

export const TrendBadge: React.FC<{ delta: number | null }> = ({ delta }) => {
    if (delta == null) return null;
    if (Math.abs(delta) < 0.05) {
        return <span className="text-xs text-slate-400" title="No change">→ 0.0</span>;
    }
    const positive = delta > 0;
    return (
        <span
            className={`text-xs font-medium ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
            title={`Average change vs first half of period`}
        >
            {positive ? '↑' : '↓'} {Math.abs(delta).toFixed(2)}
        </span>
    );
};

// -- Sub-skill horizontal bar (#13) -- //

export const SubSkillBar: React.FC<{ label: string; value: number | null; max?: number }> = ({ label, value, max = 9 }) => {
    const safe = value == null ? 0 : Math.min(max, Math.max(0, value));
    const pct = (safe / max) * 100;
    return (
        <div>
            <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 dark:text-slate-200">{label}</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {value == null ? <span className="text-slate-400">—</span> : value.toFixed(1)}
                </span>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
};

// -- Day-of-week activity strip (#6) -- //

export const WeekdayStrip: React.FC<{ counts: number[] }> = ({ counts }) => {
    const max = Math.max(1, ...counts);
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return (
        <div className="grid grid-cols-7 gap-1 text-[10px] text-center text-slate-500">
            {labels.map((lbl, i) => {
                const c = counts[i] ?? 0;
                const h = Math.max(4, (c / max) * 32);
                return (
                    <div key={lbl} className="flex flex-col items-center gap-1">
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded h-8 flex items-end">
                            <div className="w-full bg-blue-500 rounded-t" style={{ height: `${h}px` }} title={`${c} sessions`} />
                        </div>
                        <span>{lbl}</span>
                    </div>
                );
            })}
        </div>
    );
};
