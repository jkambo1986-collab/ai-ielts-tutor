/**
 * @file Pre-submission confidence prediction modal (#25).
 * Used by writing/speaking/reading/listening flows: ask the user
 * "what band do you expect?" before submitting. The component is
 * presentation-only — the parent flow attaches the predicted_band to
 * its session-create call.
 */

import React, { useState } from 'react';

const BAND_OPTIONS = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];

interface ConfidenceModalProps {
    open: boolean;
    title?: string;
    onConfirm: (predictedBand: number) => void;
    onSkip: () => void;
}

export const ConfidenceModal: React.FC<ConfidenceModalProps> = ({
    open, title = 'What band do you expect?', onConfirm, onSkip,
}) => {
    const [picked, setPicked] = useState<number | null>(null);
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Predicting your own band tightens self-assessment — itself a key IELTS skill (Speaking Part 3).
                </p>
                <div className="grid grid-cols-4 gap-2 my-5">
                    {BAND_OPTIONS.map(b => (
                        <button
                            key={b}
                            onClick={() => setPicked(b)}
                            className={`
                                rounded-md border px-3 py-2 text-sm font-semibold transition-colors
                                ${picked === b
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-300'}
                            `}
                        >
                            {b.toFixed(1)}
                        </button>
                    ))}
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={onSkip}
                        className="text-sm text-slate-500 dark:text-slate-400 px-3 py-2 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                        Skip
                    </button>
                    <button
                        disabled={picked == null}
                        onClick={() => picked != null && onConfirm(picked)}
                        className="text-sm font-medium text-white bg-blue-600 disabled:bg-slate-300 disabled:dark:bg-slate-700 px-4 py-2 rounded-md hover:bg-blue-500"
                    >
                        Submit prediction
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfidenceModal;
