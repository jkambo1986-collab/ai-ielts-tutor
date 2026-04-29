/**
 * @file Side pane that streams contemporaneous AI examiner notes (B9).
 *
 * Notes come from two sources:
 *   1. The AI is asked (via system prompt) to occasionally emit a "// NOTE:"
 *      line which we parse from the model output transcript.
 *   2. Local heuristics — discourse marker counter (D3) and filler-rate
 *      detector (E2) — write their own notes.
 */

import React from 'react';
import { ExaminerNote } from '../../services/speakingClient';

interface Props {
    notes: ExaminerNote[];
}

const ExaminerNotesPane: React.FC<Props> = ({ notes }) => (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 h-full">
        <header className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Examiner notes</h4>
            <span className="text-[11px] text-slate-400">{notes.length}</span>
        </header>
        {notes.length === 0 ? (
            <p className="text-xs text-slate-500">Live observations will appear here as the AI listens.</p>
        ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {notes.slice().reverse().map((n, i) => (
                    <li key={i} className="text-xs border-l-2 border-blue-500 pl-2">
                        <p className="text-slate-700 dark:text-slate-200">{n.note}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                            {n.timestamp || ''} {n.category ? `· ${n.category}` : ''}
                        </p>
                    </li>
                ))}
            </ul>
        )}
    </div>
);

export default ExaminerNotesPane;
