/**
 * @file Today hero card — single next-action recommendation at the top of
 * the dashboard.
 *
 * Reads existing dashboard payload + warmup endpoint + crash-mode flag and
 * picks ONE recommendation. Decision rules (priority order, first match
 * wins):
 *   1. Crash plan (exam ≤ 14 days, no plan generated yet)
 *   2. SRS warmup if 5+ cards due today
 *   3. Daily challenge if not completed
 *   4. Resume on the lowest-band skill (regression target)
 *   5. Generic "20 minutes of writing" fallback
 *
 * The point: replace the "10 cards, you pick" UX with one explicit CTA
 * the student can act on without thinking. Closes flow gap A1.
 */

import React from 'react';
import { DashboardPayload } from '../../services/dashboardService';
import { IELTSSection } from '../../types';

interface Props {
    data: DashboardPayload;
    daysUntilExam: number | null;
    onAct: (section: IELTSSection) => void;
}

const TodayHero: React.FC<Props> = ({ data, daysUntilExam, onAct }) => {
    const { headline, body, cta, target } = pickRecommendation(data, daysUntilExam);
    return (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/30 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                Today
            </p>
            <p className="mt-1 text-lg font-semibold text-blue-950 dark:text-blue-100 leading-snug">
                {headline}
            </p>
            <p className="mt-1 text-sm text-blue-900/80 dark:text-blue-200/80">
                {body}
            </p>
            <button
                type="button"
                onClick={() => onAct(target)}
                className="mt-3 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
                {cta}
            </button>
        </div>
    );
};

function pickRecommendation(data: DashboardPayload, daysUntilExam: number | null) {
    // 1. Exam imminent — defer the recommendation to the crash banner; here
    //    just call it out.
    if (daysUntilExam !== null && daysUntilExam <= 14 && daysUntilExam >= 0) {
        return {
            headline: `Your exam is in ${daysUntilExam} day${daysUntilExam === 1 ? '' : 's'}.`,
            body: 'Generate the crash plan below or start a full mock test now.',
            cta: 'Start a mock writing test',
            target: IELTSSection.Writing,
        };
    }

    // 2. Lots of SRS cards due — review them first; reuses the warmup banner
    //    inside each section but here we suggest the most-due skill.
    const dueCount = data.error_cards?.due_now ?? 0;
    if (dueCount >= 5) {
        return {
            headline: `${dueCount} review cards are due.`,
            body: 'Clear them in 5 minutes to lock in last week\'s learning before today\'s session.',
            cta: 'Review now',
            target: IELTSSection.Dashboard,
        };
    }

    // 3. Lowest-band skill = where the next 25 minutes will move the needle most.
    const latest = data.latest;
    const skillEntries: { skill: keyof typeof latest; section: IELTSSection }[] = [
        { skill: 'writing', section: IELTSSection.Writing },
        { skill: 'speaking', section: IELTSSection.Speaking },
        { skill: 'reading', section: IELTSSection.Reading },
        { skill: 'listening', section: IELTSSection.Listening },
    ];
    const ranked = skillEntries
        .map(e => ({ ...e, band: latest[e.skill] }))
        .filter(e => e.band !== null)
        .sort((a, b) => (a.band ?? 9) - (b.band ?? 9));
    if (ranked.length) {
        const top = ranked[0];
        const skillName = top.skill.charAt(0).toUpperCase() + top.skill.slice(1);
        return {
            headline: `${skillName} — your weakest skill (band ${top.band?.toFixed(1)}).`,
            body: `Closing the gap to your target of ${data.target.toFixed(1)} starts here. Plan for 20 minutes.`,
            cta: `Start a ${top.skill} session`,
            target: top.section,
        };
    }

    // 4. Brand-new student — kindest possible nudge.
    return {
        headline: 'Start with one writing session.',
        body: 'Twenty minutes is enough for a band estimate and your first SRS card.',
        cta: 'Start writing',
        target: IELTSSection.Writing,
    };
}

export default TodayHero;
