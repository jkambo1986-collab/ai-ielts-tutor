/**
 * @file Computer-Delivered IELTS (CDI) reading interface mock.
 *
 * Pixel-rough replica of the IDP CDI surface students see on test day:
 *   - Top bar: section name, timer, candidate ID, help button
 *   - Left pane: passage with a highlight tool (mark text by selection)
 *   - Right pane: question stack
 *   - Bottom bar: question navigation review panel + Previous/Next
 *
 * Major sales differentiator for institutions whose students take CDI —
 * familiarity with the on-screen layout reduces test-day friction.
 *
 * Wiring: this component takes a ReadingTest payload (same shape as the
 * existing tutor) and exposes onSubmit when the candidate finishes.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ReadingTest } from '../types';

interface Props {
    test: ReadingTest;
    durationSeconds: number; // typical CDI Reading is 60 minutes; default below
    onSubmit: (answers: Record<number, string>, timeUsedSeconds: number) => void;
    onExit: () => void;
}

const DEFAULT_DURATION = 60 * 60;

const fmt = (s: number) => {
    const m = Math.max(0, Math.floor(s / 60));
    const sec = Math.max(0, s % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const CdiReadingMock: React.FC<Props> = ({ test, durationSeconds = DEFAULT_DURATION, onSubmit, onExit }) => {
    const [remaining, setRemaining] = useState(durationSeconds);
    const [activeIdx, setActiveIdx] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [highlights, setHighlights] = useState<{ start: number; end: number }[]>([]);
    const [reviewMarked, setReviewMarked] = useState<Set<number>>(new Set());
    const startedAt = useRef(Date.now());

    useEffect(() => {
        if (remaining <= 0) return;
        const id = window.setInterval(() => setRemaining((r) => r - 1), 1000);
        return () => clearInterval(id);
    }, [remaining]);

    const submit = () => {
        const used = Math.round((Date.now() - startedAt.current) / 1000);
        onSubmit(answers, used);
    };

    useEffect(() => {
        if (remaining === 0) submit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remaining]);

    const passage = test.passage ?? '';
    const questions = test.questions ?? [];
    const q = questions[activeIdx];

    const highlight = () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return;
        const text = sel.toString();
        const start = passage.indexOf(text);
        if (start < 0) return;
        setHighlights((h) => [...h, { start, end: start + text.length }]);
        sel.removeAllRanges();
    };

    const passageRendered = useMemo(() => {
        if (!highlights.length) return passage;
        // Merge overlapping ranges and render with <mark>.
        const sorted = [...highlights].sort((a, b) => a.start - b.start);
        const merged: { start: number; end: number }[] = [];
        for (const r of sorted) {
            const last = merged[merged.length - 1];
            if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
            else merged.push({ ...r });
        }
        const parts: React.ReactNode[] = [];
        let cursor = 0;
        merged.forEach((r, i) => {
            if (cursor < r.start) parts.push(passage.slice(cursor, r.start));
            parts.push(<mark key={i} className="bg-yellow-200 dark:bg-yellow-700/60">{passage.slice(r.start, r.end)}</mark>);
            cursor = r.end;
        });
        if (cursor < passage.length) parts.push(passage.slice(cursor));
        return parts;
    }, [highlights, passage]);

    return (
        <div className="fixed inset-0 z-40 bg-slate-50 dark:bg-slate-950 flex flex-col text-slate-900 dark:text-slate-100">
            {/* Top bar — CDI-style */}
            <header className="flex items-center justify-between px-4 py-2 bg-slate-800 text-white text-sm">
                <div className="flex items-center gap-4">
                    <span className="font-semibold">CDI · Reading</span>
                    <span className="opacity-80">Candidate · CDI demo</span>
                </div>
                <div className="font-mono text-base font-bold tabular-nums">
                    {fmt(remaining)}
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={highlight} className="px-2 py-1 text-xs bg-yellow-400 text-slate-900 rounded">Highlight</button>
                    <button onClick={onExit} className="px-2 py-1 text-xs bg-slate-600 rounded">Exit</button>
                </div>
            </header>

            {/* Two-pane body */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
                <section className="overflow-y-auto p-6 border-r border-slate-200 dark:border-slate-800 select-text">
                    <h1 className="text-xl font-bold mb-3">{test.passageTitle ?? 'Reading Passage'}</h1>
                    <div className="prose prose-slate dark:prose-invert max-w-none whitespace-pre-wrap">
                        {passageRendered}
                    </div>
                </section>

                <section className="overflow-y-auto p-6">
                    {q && (
                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                                Question {activeIdx + 1} of {questions.length}
                            </p>
                            <p className="font-semibold mb-4">{q.questionText}</p>
                            <div className="space-y-2">
                                {q.options.map((opt) => {
                                    const letter = opt.charAt(0);
                                    const checked = answers[activeIdx] === letter;
                                    return (
                                        <label
                                            key={opt}
                                            className={`flex items-start gap-2 p-3 rounded-md border cursor-pointer ${checked ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/40' : 'border-slate-300 dark:border-slate-700'}`}
                                        >
                                            <input
                                                type="radio"
                                                name={`q-${activeIdx}`}
                                                checked={checked}
                                                onChange={() => setAnswers((a) => ({ ...a, [activeIdx]: letter }))}
                                                className="mt-1"
                                            />
                                            <span className="text-sm">{opt}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-2 mt-4">
                                <button
                                    onClick={() => setReviewMarked((r) => {
                                        const c = new Set(r);
                                        if (c.has(activeIdx)) c.delete(activeIdx); else c.add(activeIdx);
                                        return c;
                                    })}
                                    className="text-xs px-3 py-1.5 border rounded-md text-slate-700 dark:text-slate-200"
                                >
                                    {reviewMarked.has(activeIdx) ? 'Unmark' : 'Mark for review'}
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            {/* Bottom bar — CDI review panel */}
            <footer className="bg-slate-800 text-white px-4 py-2 flex items-center gap-3 overflow-x-auto">
                <button
                    onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
                    disabled={activeIdx === 0}
                    className="px-3 py-1.5 text-xs bg-slate-700 rounded disabled:opacity-50"
                >
                    ◀ Previous
                </button>
                <div className="flex items-center gap-1 flex-1 overflow-x-auto">
                    {questions.map((_, i) => {
                        const ans = answers[i];
                        const review = reviewMarked.has(i);
                        const cls =
                            i === activeIdx ? 'bg-blue-500'
                            : review ? 'bg-amber-400 text-slate-900'
                            : ans ? 'bg-emerald-600'
                            : 'bg-slate-600';
                        return (
                            <button
                                key={i}
                                onClick={() => setActiveIdx(i)}
                                className={`shrink-0 w-7 h-7 rounded text-xs font-bold ${cls}`}
                                title={ans ? `Answered: ${ans}` : 'Unanswered'}
                            >
                                {i + 1}
                            </button>
                        );
                    })}
                </div>
                <button
                    onClick={() => setActiveIdx((i) => Math.min(questions.length - 1, i + 1))}
                    disabled={activeIdx >= questions.length - 1}
                    className="px-3 py-1.5 text-xs bg-slate-700 rounded disabled:opacity-50"
                >
                    Next ▶
                </button>
                <button
                    onClick={submit}
                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-slate-900 rounded"
                >
                    Submit
                </button>
            </footer>
        </div>
    );
};

export default CdiReadingMock;
