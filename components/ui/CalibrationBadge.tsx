/**
 * @file Inline calibration coaching badge shown under the band score.
 *
 * When the student self-predicted before submitting, this badge tells them
 * how close they were. Three tones:
 *   - spot-on   (≤ 0.5 absolute diff) — success
 *   - close     (0.5 to 1.0)          — info
 *   - off       (> 1.0)               — warning, hints which rubric to revisit
 *
 * Calibration accuracy is itself a band-7+ self-awareness skill, and the
 * backend already records every (predicted, actual) pair as a CalibrationEntry.
 * Surfacing per-session feedback closes that loop at the moment the student
 * is most receptive — right when they see the band.
 */

import React from 'react';

interface Props {
    predicted: number | null | undefined;
    actual: number | null | undefined;
}

const CalibrationBadge: React.FC<Props> = ({ predicted, actual }) => {
    if (predicted == null || actual == null || isNaN(predicted) || isNaN(actual)) return null;

    const diff = predicted - actual;
    const abs = Math.abs(diff);

    let tone: string;
    let title: string;
    let body: string;

    if (abs <= 0.5) {
        tone = 'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800';
        title = 'Spot-on prediction';
        body = `You predicted ${predicted.toFixed(1)} and scored ${actual.toFixed(1)}. Calibration is itself a band 7+ skill.`;
    } else if (abs <= 1.0) {
        tone = 'bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800';
        title = `Close — within ${abs.toFixed(1)} band`;
        body = `Predicted ${predicted.toFixed(1)}, scored ${actual.toFixed(1)}. Try to tighten the gap next time.`;
    } else {
        tone = 'bg-amber-100 text-amber-950 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800';
        const direction = diff > 0 ? 'over-predicted' : 'under-predicted';
        title = `You ${direction} by ${abs.toFixed(1)} band`;
        body = `Predicted ${predicted.toFixed(1)}, scored ${actual.toFixed(1)}. Re-read the rubric for the criterion you scored lowest on.`;
    }

    return (
        <div
            role="status"
            className={`mt-3 rounded-lg border px-4 py-2.5 text-sm ${tone}`}
        >
            <p className="font-semibold leading-tight">{title}</p>
            <p className="text-xs opacity-90 mt-0.5">{body}</p>
        </div>
    );
};

export default CalibrationBadge;
