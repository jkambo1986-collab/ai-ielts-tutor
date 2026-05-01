/**
 * @file F6 — Speaking session replay.
 *
 * Reuses the persisted transcript, bookmarks, and annotations on a speaking
 * session. Plays the transcript via browser TTS so users can re-hear it
 * without us storing the original audio. Bookmarks are timestamped pins
 * users can jump to.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import Loader from './Loader';
import { apiClient } from '../services/apiClient';
import { Turn } from '../types';

interface Bookmark {
    id: string;
    transcript_index: number;
    note: string;
    created_at: string;
}

interface Annotation {
    id: string;
    transcript_index: number | null;
    note: string;
    created_at: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    sessionId: string;
    transcript: Turn[];
    title?: string;
}

const SessionReplay: React.FC<Props> = ({ open, onClose, sessionId, transcript, title }) => {
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeIdx, setActiveIdx] = useState<number | null>(null);
    const [playing, setPlaying] = useState(false);
    const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        Promise.all([
            apiClient.get<{ results?: Bookmark[] } | Bookmark[]>(`/speaking/sessions/${sessionId}/bookmarks`).catch(() => []),
            apiClient.get<{ results?: Annotation[] } | Annotation[]>(`/speaking/sessions/${sessionId}/annotations`).catch(() => []),
        ]).then(([b, a]) => {
            const bArr = Array.isArray(b) ? b : (b?.results || []);
            const aArr = Array.isArray(a) ? a : (a?.results || []);
            setBookmarks(bArr as Bookmark[]);
            setAnnotations(aArr as Annotation[]);
        }).finally(() => setLoading(false));
    }, [open, sessionId]);

    // Stop any ongoing speech on close.
    useEffect(() => {
        if (!open && typeof window !== 'undefined') {
            window.speechSynthesis?.cancel();
            setPlaying(false);
            setActiveIdx(null);
        }
    }, [open]);

    const speakFrom = (start: number) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        setPlaying(true);
        const playOne = (idx: number) => {
            if (idx >= transcript.length) {
                setPlaying(false);
                setActiveIdx(null);
                return;
            }
            const turn = transcript[idx];
            setActiveIdx(idx);
            const u = new SpeechSynthesisUtterance(turn.text);
            u.rate = 1.0;
            u.onend = () => playOne(idx + 1);
            u.onerror = () => playOne(idx + 1);
            utterRef.current = u;
            window.speechSynthesis.speak(u);
        };
        playOne(start);
    };

    const stop = () => {
        window.speechSynthesis?.cancel();
        setPlaying(false);
    };

    const annotationByIdx = useMemo(() => {
        const map: Record<number, Annotation[]> = {};
        for (const a of annotations) {
            if (a.transcript_index === null || a.transcript_index === undefined) continue;
            (map[a.transcript_index] = map[a.transcript_index] || []).push(a);
        }
        return map;
    }, [annotations]);

    const bookmarkByIdx = useMemo(() => {
        const map: Record<number, Bookmark[]> = {};
        for (const b of bookmarks) {
            (map[b.transcript_index] = map[b.transcript_index] || []).push(b);
        }
        return map;
    }, [bookmarks]);

    return (
        <Modal isOpen={open} onClose={onClose} title={title || 'Session replay'}>
            <div className="space-y-3">
                <div className="flex items-center gap-2 sticky top-0 bg-white dark:bg-slate-900 py-2 z-10">
                    {!playing ? (
                        <button
                            onClick={() => speakFrom(activeIdx ?? 0)}
                            className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md"
                        >
                            ▶ Play
                        </button>
                    ) : (
                        <button
                            onClick={stop}
                            className="text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-md"
                        >
                            ■ Stop
                        </button>
                    )}
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        {transcript.length} turn{transcript.length === 1 ? '' : 's'}
                        {bookmarks.length > 0 && ` · ${bookmarks.length} bookmark${bookmarks.length === 1 ? '' : 's'}`}
                    </span>
                </div>

                {loading && <Loader text="Loading bookmarks…" />}

                {transcript.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">No transcript stored for this session.</p>
                ) : (
                    <ol className="space-y-2 max-h-[60vh] overflow-y-auto">
                        {transcript.map((turn, i) => {
                            const bms = bookmarkByIdx[i] || [];
                            const ans = annotationByIdx[i] || [];
                            const isActive = i === activeIdx;
                            return (
                                <li
                                    key={i}
                                    onClick={() => speakFrom(i)}
                                    className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                                        isActive
                                            ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/40'
                                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                    }`}
                                >
                                    <div className="flex items-baseline justify-between gap-2 mb-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                            {turn.speaker}
                                        </span>
                                        <span className="text-[10px] text-slate-400">{turn.timestamp}</span>
                                    </div>
                                    <p className="text-sm text-slate-700 dark:text-slate-200">{turn.text}</p>
                                    {bms.length > 0 && (
                                        <ul className="mt-2 space-y-1">
                                            {bms.map(b => (
                                                <li key={b.id} className="text-xs text-amber-700 dark:text-amber-300">
                                                    🔖 {b.note || 'Bookmarked'}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {ans.length > 0 && (
                                        <ul className="mt-2 space-y-1">
                                            {ans.map(a => (
                                                <li key={a.id} className="text-xs text-violet-700 dark:text-violet-300">
                                                    📝 {a.note}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>
        </Modal>
    );
};

export default SessionReplay;
