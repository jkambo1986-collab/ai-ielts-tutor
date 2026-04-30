/**
 * @file Re-attempt diff celebration strip on result screens.
 *
 * When a session has parent_session_id, this strip appears at the top of
 * the result page comparing original vs re-attempt: overall delta + a
 * compact list of criteria that improved. Backend already exposes the
 * data via /analytics/reattempt-diff — this component just surfaces it
 * at the moment of completion (highest emotional payoff).
 */

import React, { useEffect, useState } from 'react';
import { dashboardService, ReattemptDiff } from '../../services/dashboardService';

interface Props {
    kind: 'writing' | 'speaking';
    originalId: string | null;
    reattemptId: string;
}

const ReattemptDiffStrip: React.FC<Props> = ({ kind, originalId, reattemptId }) => {
    const [diff, setDiff] = useState<ReattemptDiff | null>(null);

    useEffect(() => {
        if (!originalId) return;
        let cancelled = false;
        dashboardService.reattemptDiff(kind, originalId, reattemptId)
            .then(d => { if (!cancelled) setDiff(d); })
            .catch(() => { /* silent — strip is optional decoration */ });
        return () => { cancelled = true; };
    }, [kind, originalId, reattemptId]);

    if (!originalId || !diff) return null;

    const before = diff.original.overall_band;
    const after = diff.reattempt.overall_band;
    const delta = diff.overall_delta;

    const improvedCriteria = diff.criteria.filter(c => (c.delta ?? 0) > 0);

    let tone = 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700';
    let headline = 'Re-attempt complete';
    if (delta != null) {
        if (delta > 0) {
            tone = 'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800';
            headline = `Band ${before?.toFixed(1) ?? '—'} → ${after?.toFixed(1) ?? '—'} (+${delta.toFixed(1)})`;
        } else if (delta < 0) {
            tone = 'bg-amber-100 text-amber-950 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800';
            headline = `Band ${before?.toFixed(1) ?? '—'} → ${after?.toFixed(1) ?? '—'} (${delta.toFixed(1)})`;
        } else {
            headline = `Band held at ${after?.toFixed(1) ?? '—'}`;
        }
    }

    return (
        <div className={`mb-4 rounded-lg border px-4 py-3 ${tone}`} role="status">
            <p className="font-semibold leading-tight">{headline}</p>
            {improvedCriteria.length > 0 && (
                <p className="text-xs mt-1 opacity-90">
                    Improved on {improvedCriteria.length} of {diff.criteria.length} criteria
                    {improvedCriteria.length <= 3
                        ? `: ${improvedCriteria.map(c => c.label).join(', ')}.`
                        : '.'}
                </p>
            )}
        </div>
    );
};

export default ReattemptDiffStrip;
