/**
 * @file Per-part timer (B3) used by the Mock Test runner. Counts up or
 * down depending on `mode`. Fires `onComplete` when the target is reached.
 */

import React, { useEffect, useRef, useState } from 'react';

interface Props {
    label: string;
    targetSeconds: number;
    mode: 'countdown' | 'countup';
    running: boolean;
    onComplete?: () => void;
    /** Reset when the value changes. */
    resetKey?: string | number;
}

const PartTimer: React.FC<Props> = ({ label, targetSeconds, mode, running, onComplete, resetKey }) => {
    const [elapsed, setElapsed] = useState(0);
    const tickRef = useRef<number | null>(null);
    const startedRef = useRef<number | null>(null);

    useEffect(() => {
        setElapsed(0);
        startedRef.current = null;
    }, [resetKey]);

    useEffect(() => {
        if (!running) {
            if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
            return;
        }
        if (!startedRef.current) startedRef.current = Date.now();
        tickRef.current = window.setInterval(() => {
            setElapsed(Math.floor((Date.now() - (startedRef.current ?? Date.now())) / 1000));
        }, 250);
        return () => {
            if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
        };
    }, [running]);

    useEffect(() => {
        if (mode === 'countdown' && elapsed >= targetSeconds && running) {
            onComplete?.();
        }
        if (mode === 'countup' && elapsed >= targetSeconds && running) {
            onComplete?.();
        }
    }, [elapsed, targetSeconds, mode, running, onComplete]);

    const display = mode === 'countdown'
        ? Math.max(0, targetSeconds - elapsed)
        : elapsed;
    const minutes = String(Math.floor(display / 60)).padStart(2, '0');
    const seconds = String(display % 60).padStart(2, '0');

    const ratio = Math.min(1, elapsed / Math.max(1, targetSeconds));
    const tone = ratio >= 1
        ? 'text-rose-600 dark:text-rose-400'
        : ratio > 0.8
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-slate-700 dark:text-slate-200';

    return (
        <div className="flex items-baseline gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
            <span className={`text-2xl font-bold tabular-nums ${tone}`}>
                {minutes}:{seconds}
            </span>
            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full ${ratio >= 1 ? 'bg-rose-500' : 'bg-blue-500'}`} style={{ width: `${ratio * 100}%` }} />
            </div>
        </div>
    );
};

export default PartTimer;
