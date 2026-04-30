/**
 * @file Pronunciation phoneme heat-map.
 *
 * Each cell is one targetPhoneme with intensity proportional to how many
 * speaking sessions flagged it. Hovering surfaces example problem words.
 * Empty when the user has no analyzed speaking sessions yet.
 */

import React from 'react';

interface Cell {
    phoneme: string;
    sessions: number;
    problem_words: number;
    examples: string[];
}

const PronunciationHeatmap: React.FC<{ cells: Cell[] }> = ({ cells }) => {
    if (!cells.length) {
        return (
            <div className="text-sm text-slate-500 text-center py-3">
                Complete a speaking session with analysis to see your pronunciation pattern.
            </div>
        );
    }

    const maxSessions = Math.max(...cells.map((c) => c.sessions));

    return (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {cells.map((c) => {
                const intensity = c.sessions / maxSessions;
                const alpha = 0.2 + intensity * 0.7;
                return (
                    <div
                        key={c.phoneme}
                        className="relative rounded-md border border-rose-200 dark:border-rose-800 px-2 py-2 text-center"
                        style={{ backgroundColor: `rgba(244, 63, 94, ${alpha.toFixed(2)})` }}
                        title={`${c.sessions} session${c.sessions === 1 ? '' : 's'} flagged /${c.phoneme}/. Examples: ${c.examples.join(', ') || 'none'}`}
                    >
                        <p className="font-mono text-base font-bold text-rose-950">/{c.phoneme}/</p>
                        <p className="text-[10px] text-rose-900/80 mt-0.5">
                            {c.sessions}× · {c.problem_words} words
                        </p>
                    </div>
                );
            })}
        </div>
    );
};

export default PronunciationHeatmap;
