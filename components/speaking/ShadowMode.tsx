/**
 * @file Shadow mode (D2): pick a single Q from a past session, re-record
 * the answer in isolation, get fresh feedback. Doesn't burn a full session.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ShadowAnalysis, speakingClient } from '../../services/speakingClient';

interface Props {
    questions: { id: string; text: string }[];
    onClose: () => void;
}

const ShadowMode: React.FC<Props> = ({ questions, onClose }) => {
    const [picked, setPicked] = useState<string | null>(questions[0]?.id ?? null);
    const [recording, setRecording] = useState(false);
    const [answer, setAnswer] = useState('');
    const [analysis, setAnalysis] = useState<ShadowAnalysis | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Speech-to-text fallback: a textarea. (Live audio capture for shadow mode
    // is a future addition — typing in or pasting transcribed answer is a
    // reliable stand-in until then.)
    const taRef = useRef<HTMLTextAreaElement | null>(null);

    const question = questions.find(q => q.id === picked);

    const submit = async () => {
        if (!question || !answer.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const r = await speakingClient.shadowAnalyze(question.text, answer);
            setAnalysis(r.analysis);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Analysis failed.');
        } finally {
            setBusy(false);
        }
    };

    useEffect(() => { taRef.current?.focus(); }, [picked]);

    return (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <header className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Shadow mode</h3>
                <button onClick={onClose} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Close</button>
            </header>
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Re-do one answer at a time. Pick the question you want to retry, type your fresh answer, and get rubric feedback for that single answer.
            </p>

            <div>
                <label className="text-xs uppercase tracking-wide text-slate-500">Question</label>
                <select
                    value={picked ?? ''}
                    onChange={(e) => { setPicked(e.target.value); setAnswer(''); setAnalysis(null); }}
                    className="block w-full mt-1 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                >
                    {questions.map(q => (
                        <option key={q.id} value={q.id}>{q.text.slice(0, 80)}</option>
                    ))}
                </select>
            </div>

            <div>
                <label className="text-xs uppercase tracking-wide text-slate-500">Your answer</label>
                <textarea
                    ref={taRef}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={6}
                    className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                    placeholder="Speak it aloud, then transcribe — or type your improved answer."
                />
            </div>

            {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

            <div className="flex justify-end gap-2">
                <button
                    disabled={!answer.trim() || busy}
                    onClick={submit}
                    className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-2 rounded-md"
                >
                    {busy ? 'Analyzing…' : 'Analyze this answer'}
                </button>
            </div>

            {analysis && <AnalysisCard analysis={analysis} />}
        </section>
    );
};

const AnalysisCard: React.FC<{ analysis: ShadowAnalysis }> = ({ analysis }) => (
    <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-4 space-y-3">
        <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Estimated band</span>
            <span className="text-2xl font-bold text-emerald-900 dark:text-emerald-200">
                {analysis.overallBandScore != null ? Number(analysis.overallBandScore).toFixed(1) : '—'}
            </span>
        </div>
        {(['fluencyAndCoherence', 'lexicalResource', 'grammaticalRangeAndAccuracy', 'pronunciation'] as const).map(k => {
            const c = (analysis as Record<string, { score?: number; feedback?: string; example?: string } | number>)[k];
            if (typeof c !== 'object' || c == null) return null;
            return (
                <div key={k} className="border-l-2 border-emerald-500 pl-3">
                    <div className="flex justify-between text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                            {k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                            {typeof c.score === 'number' ? c.score.toFixed(1) : '—'}
                        </span>
                    </div>
                    {c.feedback && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{c.feedback}</p>}
                </div>
            );
        })}
    </div>
);

export default ShadowMode;
