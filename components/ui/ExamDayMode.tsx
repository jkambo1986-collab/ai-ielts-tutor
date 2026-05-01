/**
 * @file F5 — Exam Day Mode (T-7 lockdown).
 *
 * When the exam is within 7 days, the dashboard collapses to a focused
 * 7-day checklist. Persists per-user item completion in localStorage so
 * users can tick items across sessions.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../../App';
import { IELTSSection } from '../../types';
import { uxService } from '../../services/uxService';
import { tokenStore } from '../../services/apiClient';
import { useToast } from './Toast';

interface ChecklistItem {
    id: string;
    label: string;
    detail: string;
    target?: IELTSSection;
    isDownload?: boolean;
}

const ITEMS: ChecklistItem[] = [
    { id: 'mock', label: 'Run one full mock test', detail: 'Sit a complete simulation under exam conditions to lock in pacing.', target: IELTSSection.MockTests },
    { id: 'writing', label: 'One Writing Task 2 essay', detail: 'Pick a familiar topic — refine, don\'t experiment.', target: IELTSSection.Writing },
    { id: 'speaking', label: 'One Speaking Part 2 + 3', detail: 'Warm up Part 1 lightly; rehearse Part 3 hedging language.', target: IELTSSection.Speaking },
    { id: 'reading', label: 'One Reading drill', detail: 'Time yourself. Don\'t aim for new strategies — re-cement what works.', target: IELTSSection.Reading },
    { id: 'listening', label: 'One Listening drill', detail: 'Practice the test pace, not the highest difficulty.', target: IELTSSection.Listening },
    { id: 'vocab', label: 'Review SRS flashcards', detail: 'High-leverage 10 minutes. Cement what you already know.', target: IELTSSection.Dashboard },
    { id: 'rest', label: 'Sleep + pacing reminder', detail: '8 hours of sleep, hydrate, and time your morning routine like exam day.' },
    { id: 'cert', label: 'Print readiness certificate', detail: 'Optional — bring it as a confidence cue if helpful.', isDownload: true },
];

const EXAM_MODE_LSKEY = 'exam_mode.completed';

const ExamDayMode: React.FC<{ daysUntilExam: number }> = ({ daysUntilExam }) => {
    const { setActiveTab } = useAppContext();
    const { toast } = useToast();
    const [completed, setCompleted] = useState<Record<string, boolean>>({});
    const [collapsed, setCollapsed] = useState(false);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(EXAM_MODE_LSKEY);
            if (raw) setCompleted(JSON.parse(raw));
        } catch { /* ignore */ }
    }, []);

    const toggle = (id: string) => {
        setCompleted(prev => {
            const next = { ...prev, [id]: !prev[id] };
            try { localStorage.setItem(EXAM_MODE_LSKEY, JSON.stringify(next)); } catch { /* ignore */ }
            return next;
        });
    };

    const downloadCertificate = async () => {
        setDownloading(true);
        try {
            const url = uxService.certificateUrl();
            const token = tokenStore.getAccess();
            const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const blob = await r.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'ielts-readiness-certificate.pdf';
            a.click();
            URL.revokeObjectURL(a.href);
            toast({ kind: 'success', title: 'Certificate downloaded' });
        } catch (e) {
            toast({ kind: 'error', title: 'Download failed', body: e instanceof Error ? e.message : '' });
        } finally {
            setDownloading(false);
        }
    };

    const completedCount = useMemo(
        () => ITEMS.reduce((n, i) => n + (completed[i.id] ? 1 : 0), 0),
        [completed],
    );

    const headline = daysUntilExam === 0
        ? 'Exam day. Trust the work.'
        : daysUntilExam === 1
            ? 'One day to go. Light practice only.'
            : `${daysUntilExam} days to go. Stay focused.`;

    return (
        <section className="rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-gradient-to-br from-amber-50 to-rose-50 dark:from-amber-950/40 dark:to-rose-950/40 p-6">
            <header className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Exam day mode
                </p>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
                    {headline}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    Non-essential features are tucked away. Run through this list once, sleep well, and you're done.
                </p>
                <div className="mt-3 h-2 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all"
                        style={{ width: `${(completedCount / ITEMS.length) * 100}%` }}
                    />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {completedCount} / {ITEMS.length} items
                </p>
            </header>

            <ul className="space-y-2">
                {ITEMS.map(item => {
                    const done = !!completed[item.id];
                    return (
                        <li
                            key={item.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border ${
                                done
                                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30'
                                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                            }`}
                        >
                            <button
                                onClick={() => toggle(item.id)}
                                aria-pressed={done}
                                aria-label={done ? `Unmark ${item.label}` : `Mark ${item.label} complete`}
                                className={`shrink-0 h-5 w-5 mt-0.5 rounded border-2 flex items-center justify-center text-xs ${
                                    done
                                        ? 'bg-emerald-500 border-emerald-500 text-white'
                                        : 'border-slate-400 dark:border-slate-600'
                                }`}
                            >
                                {done && '✓'}
                            </button>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold ${done ? 'line-through text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>
                                    {item.label}
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{item.detail}</p>
                            </div>
                            {item.target && (
                                <button
                                    onClick={() => setActiveTab(item.target!)}
                                    className="shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    Open →
                                </button>
                            )}
                            {item.isDownload && (
                                <button
                                    onClick={downloadCertificate}
                                    disabled={downloading}
                                    className="shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-60"
                                >
                                    {downloading ? '…' : 'Download'}
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>

            <div className="mt-4 text-center">
                <button
                    onClick={() => setCollapsed(c => !c)}
                    className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline"
                >
                    {collapsed ? 'Bring back full dashboard' : 'I trust this — show full dashboard anyway'}
                </button>
            </div>
        </section>
    );
};

export default ExamDayMode;
