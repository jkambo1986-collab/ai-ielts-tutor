/**
 * @file Badge gallery — earned achievements grid.
 *
 * Fetches all earned badges and renders them as a grid of pills. Empty
 * state shows the next earnable badge as motivation. Append-only: badges
 * never disappear once earned.
 */

import React, { useEffect, useState } from 'react';
import { dashboardService, BadgeRow } from '../../services/dashboardService';

const BadgeGallery: React.FC = () => {
    const [badges, setBadges] = useState<BadgeRow[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        dashboardService.fetchBadges()
            .then((r) => { if (!cancelled) setBadges(r.badges); })
            .catch(() => { if (!cancelled) setBadges([]); });
        return () => { cancelled = true; };
    }, []);

    if (badges === null) return null;

    if (badges.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-300">
                Your first badge unlocks on your first writing session.
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {badges.map((b) => (
                <div
                    key={b.id}
                    className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 px-3 py-2"
                    title={b.description}
                >
                    <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 leading-tight">
                        {b.title}
                    </p>
                    <p className="text-[10px] text-amber-800/80 dark:text-amber-300/80 mt-0.5 line-clamp-2">
                        {b.description}
                    </p>
                </div>
            ))}
        </div>
    );
};

export default BadgeGallery;
