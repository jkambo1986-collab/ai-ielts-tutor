/**
 * @file Today's daily challenge card.
 *
 * Mounted on the Today / Dashboard view. Shows the user one short prompt
 * (5 minutes, rotating skill) for the day. Skill rotates by day-of-year
 * server-side so a regular user touches all four skills weekly.
 *
 * Click → routes to the matching tutor with the prompt pre-filled.
 */

import React, { useEffect, useState } from 'react';
import { dashboardService, DailyChallenge } from '../../services/dashboardService';

const SKILL_LABEL: Record<DailyChallenge['skill'], string> = {
    writing: 'Writing',
    speaking: 'Speaking',
    reading: 'Reading',
    listening: 'Listening',
};

const DailyChallengeCard: React.FC<{ onAccept?: (c: DailyChallenge) => void }> = ({ onAccept }) => {
    const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        dashboardService.fetchDailyChallenge()
            .then((c) => { if (!cancelled) setChallenge(c); })
            .catch(() => undefined)
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    if (loading) return null;
    if (!challenge) return null;

    const done = !!challenge.completed_at;

    return (
        <div className={`rounded-lg border px-4 py-3 ${done ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/30 dark:border-emerald-800' : 'border-blue-200 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-800'}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                            Today · {SKILL_LABEL[challenge.skill]}
                        </span>
                        {done && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                                Done
                            </span>
                        )}
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                        {challenge.prompt}
                    </p>
                </div>
                {!done && onAccept && (
                    <button
                        type="button"
                        onClick={() => onAccept(challenge)}
                        className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md shrink-0"
                    >
                        Start (5 min)
                    </button>
                )}
            </div>
        </div>
    );
};

export default DailyChallengeCard;
