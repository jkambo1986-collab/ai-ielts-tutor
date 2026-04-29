/**
 * @file Instructor / institute-admin review view (C5).
 *
 * Loaded by passing a session UUID via prop or query param. Reads from the
 * /speaking/instructor/sessions/<id> endpoint which the backend gates by
 * role — the FE just needs to render and let the user annotate.
 */

import React, { useEffect, useState } from 'react';
import { speakingClient } from '../../services/speakingClient';

interface Props {
    sessionId: string;
    onClose: () => void;
}

interface ReviewData {
    session: { transcript?: { speaker: string; text: string; timestamp: string }[]; analysis?: Record<string, unknown> } & Record<string, unknown>;
    student: { id: string; name: string; email: string };
    annotations: { id: string; body: string; transcript_index: number | null; created_at: string }[];
}

const InstructorReview: React.FC<Props> = ({ sessionId, onClose }) => {
    const [data, setData] = useState<ReviewData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [annotation, setAnnotation] = useState('');
    const [transcriptIndex, setTranscriptIndex] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const reload = () => {
        speakingClient.instructorReview(sessionId)
            .then(r => setData(r as unknown as ReviewData))
            .catch(e => setError(e instanceof Error ? e.message : 'Failed to load.'));
    };

    useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sessionId]);

    const submit = async () => {
        if (!annotation.trim()) return;
        setSubmitting(true);
        try {
            await speakingClient.annotate(sessionId, annotation.trim(), transcriptIndex ?? undefined);
            setAnnotation('');
            setTranscriptIndex(null);
            reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Save failed.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <header className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Instructor review</h3>
                    {data && <p className="text-xs text-slate-500">Student: {data.student.name} ({data.student.email})</p>}
                </div>
                <button onClick={onClose} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Close</button>
            </header>

            {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
            {!data ? <p className="text-sm text-slate-400">Loading…</p> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <h4 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Transcript</h4>
                        <div className="rounded border border-slate-200 dark:border-slate-800 max-h-96 overflow-y-auto p-3 space-y-2 text-sm">
                            {(data.session.transcript || []).map((t, i) => (
                                <div
                                    key={i}
                                    className={`cursor-pointer rounded px-2 py-1 ${transcriptIndex === i ? 'bg-amber-100 dark:bg-amber-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                    onClick={() => setTranscriptIndex(i)}
                                >
                                    <span className="text-[10px] text-slate-400">[{t.timestamp}]</span>{' '}
                                    <span className="text-xs font-bold capitalize">{t.speaker}:</span>{' '}
                                    {t.text}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <h4 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Annotations ({data.annotations.length})</h4>
                            <ul className="space-y-2 max-h-72 overflow-y-auto">
                                {data.annotations.map(a => (
                                    <li key={a.id} className="rounded bg-slate-50 dark:bg-slate-950 p-2 text-xs">
                                        <p className="text-slate-700 dark:text-slate-200">{a.body}</p>
                                        <p className="text-[10px] text-slate-400 mt-1">
                                            {a.transcript_index != null && `Turn #${a.transcript_index} · `}
                                            {new Date(a.created_at).toLocaleString()}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Add annotation</h4>
                            {transcriptIndex != null && (
                                <p className="text-[11px] text-slate-500 mb-1">Anchored to turn #{transcriptIndex}.</p>
                            )}
                            <textarea
                                value={annotation}
                                onChange={(e) => setAnnotation(e.target.value)}
                                rows={3}
                                className="w-full text-sm px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                placeholder="Note for the student / private record."
                            />
                            <div className="flex justify-end mt-2">
                                <button
                                    disabled={!annotation.trim() || submitting}
                                    onClick={submit}
                                    className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
                                >
                                    {submitting ? 'Saving…' : 'Save annotation'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default InstructorReview;
