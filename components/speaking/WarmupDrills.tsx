/**
 * @file Warm-up drills (D4) — surfaces minimal pairs and tongue twisters
 * derived from the user's most recent pronunciationAnalysis. ~60 seconds
 * of focused practice before a session.
 */

import React from 'react';
import { PronunciationDetail, PronunciationPractice } from '../../types';

interface Props {
    targetPhoneme: string;
    practice: PronunciationPractice | null;
    onClose: () => void;
}

const WarmupDrills: React.FC<Props> = ({ targetPhoneme, practice, onClose }) => {
    const speak = (text: string) => {
        try {
            const u = new SpeechSynthesisUtterance(text);
            u.rate = 0.95;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
        } catch { /* ignore */ }
    };

    return (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <header className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                    Warm-up: {targetPhoneme}
                </h3>
                <button onClick={onClose} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Close</button>
            </header>
            {!practice ? (
                <p className="text-sm text-slate-500">No practice exercises generated yet. Run "Practice Pronunciation" on a recent session first.</p>
            ) : (
                <>
                    <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Minimal pairs</p>
                        <ul className="space-y-1">
                            {practice.minimalPairs.map((p, i) => (
                                <li key={i} className="text-sm flex items-center gap-3">
                                    <button onClick={() => speak(`${p.wordA}, ${p.wordB}`)} className="text-emerald-600 dark:text-emerald-400">▶</button>
                                    <span className="font-medium text-slate-800 dark:text-slate-100">{p.wordA}</span>
                                    <span className="text-slate-400">vs</span>
                                    <span className="font-medium text-slate-800 dark:text-slate-100">{p.wordB}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Tongue twisters</p>
                        <ul className="space-y-1">
                            {practice.tongueTwisters.map((t, i) => (
                                <li key={i} className="text-sm flex items-start gap-3">
                                    <button onClick={() => speak(t)} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0">▶</button>
                                    <p className="text-slate-700 dark:text-slate-200">{t}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </>
            )}
        </section>
    );
};

// Convenience wrapper that pulls a `PronunciationDetail` from props and
// asks the AI service to expand it into a `PronunciationPractice` package.
// Intended use: parent components hold the ready-to-render data.
export default WarmupDrills;
export type { PronunciationDetail };
