/**
 * @file Band-7 rephrase (E3) — given a user turn, the AI returns a band-7
 * version of the answer. Browser TTS plays it back.
 */

import React, { useState } from 'react';
import { speakingClient } from '../../services/speakingClient';

interface Props {
    userText: string;
    question?: string;
    onClose: () => void;
}

const Band7Rephrase: React.FC<Props> = ({ userText, question, onClose }) => {
    const [rephrased, setRephrased] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchRephrase = async () => {
        setBusy(true);
        setError(null);
        try {
            const r = await speakingClient.band7Rephrase(userText, question);
            setRephrased(r.rephrased);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Rephrase failed.');
        } finally {
            setBusy(false);
        }
    };

    const speak = () => {
        if (!rephrased) return;
        try {
            const u = new SpeechSynthesisUtterance(rephrased);
            u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
        } catch { /* ignore */ }
    };

    return (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <header className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Band-7 version</h3>
                <button onClick={onClose} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Close</button>
            </header>
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Hear what a band-7 answer sounds like for the same content. Compare to your original.
            </p>
            <div className="rounded bg-slate-50 dark:bg-slate-950 p-3 text-sm text-slate-700 dark:text-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Your answer</p>
                <p>{userText}</p>
            </div>
            {!rephrased ? (
                <button
                    onClick={fetchRephrase}
                    disabled={busy}
                    className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-2 rounded-md"
                >
                    {busy ? 'Rephrasing…' : 'Show band-7 version'}
                </button>
            ) : (
                <div className="space-y-3">
                    <div className="rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-3 text-sm text-emerald-900 dark:text-emerald-100">
                        <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1">Band-7 version</p>
                        <p>{rephrased}</p>
                    </div>
                    <button
                        onClick={speak}
                        className="text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
                    >
                        ▶ Play aloud
                    </button>
                </div>
            )}
            {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </section>
    );
};

export default Band7Rephrase;
