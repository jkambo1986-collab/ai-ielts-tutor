/**
 * @file Sticky "Continue where you left off" pill (F6).
 *
 * Fetches /analytics/resume on mount and renders a single CTA when there
 * is something the user can pick up where they left off. Self-dismissing
 * for the session to avoid noise.
 */

import React, { useEffect, useState } from 'react';
import { uxService, ResumeTarget } from '../../services/uxService';
import { useAppContext } from '../../App';
import { IELTSSection } from '../../types';

const SESSION_DISMISS_KEY = 'ielts_resume_dismissed_for_session';

const ResumePill: React.FC = () => {
    const { setActiveTab } = useAppContext();
    const [target, setTarget] = useState<ResumeTarget | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        try {
            if (sessionStorage.getItem(SESSION_DISMISS_KEY) === '1') setDismissed(true);
        } catch { /* ignore */ }
        let cancelled = false;
        uxService.fetchResume()
            .then(r => { if (!cancelled) setTarget(r.resume); })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, []);

    if (!target || dismissed) return null;

    const sectionMap: Record<string, IELTSSection | undefined> = {
        Writing: IELTSSection.Writing,
        Speaking: IELTSSection.Speaking,
        Reading: IELTSSection.Reading,
        Listening: IELTSSection.Listening,
    };
    const sec = sectionMap[target.section];
    return (
        <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-3 py-2 sm:py-2.5 flex items-center justify-between gap-2 mb-4">
            <div className="min-w-0">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 truncate">{target.title}</p>
                <p className="text-[11px] text-blue-700/80 dark:text-blue-300/80 truncate">{target.subtitle}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
                <button
                    onClick={() => { if (sec) setActiveTab(sec); }}
                    className="text-xs font-medium px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    Resume
                </button>
                <button
                    onClick={() => {
                        setDismissed(true);
                        try { sessionStorage.setItem(SESSION_DISMISS_KEY, '1'); } catch { /* ignore */ }
                    }}
                    aria-label="Dismiss"
                    className="text-blue-700/70 dark:text-blue-300/70 hover:text-blue-800 dark:hover:text-blue-200 px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    ✕
                </button>
            </div>
        </div>
    );
};

export default ResumePill;
