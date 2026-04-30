/**
 * @file Always-on streak status pill in the header.
 *
 * Three states keyed off /analytics/streak:
 *   - alive    (green-ish) — current_days >= 1, today is in the streak
 *   - at-risk  (amber)     — alive but no session yet today
 *   - broken   (rose)      — just_broken (was a >=3 day streak, now lost)
 *   - hidden   (null)      — no streak data; render nothing
 *
 * Polls every 5 minutes — cheap, and the pill is high-visibility so we want
 * it fresh after the user closes a tab and comes back later in the day.
 */

import React, { useEffect, useState } from 'react';
import { dashboardService, StreakSnapshot } from '../../services/dashboardService';

const POLL_MS = 5 * 60 * 1000;

const StreakPill: React.FC = () => {
    const [streak, setStreak] = useState<StreakSnapshot | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const s = await dashboardService.fetchStreak();
                if (!cancelled) setStreak(s);
            } catch { /* silent — header pill must never crash the chrome */ }
        };
        load();
        const handle = window.setInterval(load, POLL_MS);
        return () => { cancelled = true; clearInterval(handle); };
    }, []);

    if (!streak || (streak.current_days === 0 && !streak.just_broken)) return null;

    let tone = 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800';
    let label = `${streak.current_days}-day streak`;
    let tooltip = `Longest: ${streak.longest_days} days`;

    if (streak.just_broken) {
        tone = 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800';
        label = `Streak ended (${streak.longest_days})`;
        tooltip = 'A 5-minute session today restarts your streak.';
    } else if (streak.is_at_risk) {
        tone = 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800';
        label = `${streak.current_days}-day streak — at risk`;
        tooltip = 'Practise today to keep it alive.';
    }

    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium ${tone}`}
            title={tooltip}
            aria-label={`${label}. ${tooltip}`}
        >
            <span aria-hidden>•</span>
            {label}
        </span>
    );
};

export default StreakPill;
