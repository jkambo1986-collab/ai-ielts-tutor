import React, { useEffect, useState } from 'react';
import Card from './Card';
import Loader from './Loader';
import EmptyState from './ui/EmptyState';
import { journalService, VoiceJournalDaily, VoiceJournalEntry } from '../services/practiceMoreService';
import { useAppContext } from '../App';
import { IELTSSection } from '../types';

const VoiceJournalPage: React.FC = () => {
    const { setActiveTab } = useAppContext();
    const [today, setToday] = useState<VoiceJournalDaily | null>(null);
    const [history, setHistory] = useState<VoiceJournalEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([journalService.today(), journalService.list()])
            .then(([t, h]) => {
                setToday(t);
                setHistory(h.results || []);
            })
            .catch(e => setError(e instanceof Error ? e.message : 'Failed to load journal.'));
    }, []);

    if (error) {
        return <Card><div role="alert" className="text-red-500">{error}</div></Card>;
    }
    if (!today || history === null) {
        return <Card><Loader text="Loading voice journal…" /></Card>;
    }

    return (
        <div className="space-y-6">
            <Card>
                <h2 className="text-2xl font-bold">Voice Journal</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
                    Free-talk speaking with no rubric. Build fluency without exam pressure.
                </p>

                <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                        Today's prompt
                    </p>
                    <p className="text-base font-semibold text-slate-800 dark:text-slate-100 mt-1">
                        {today.prompt}
                    </p>
                    {today.entry ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                            Logged today — {today.entry.word_count} words, {Math.round(today.entry.duration_seconds)}s.
                        </p>
                    ) : (
                        <button
                            onClick={() => setActiveTab(IELTSSection.Speaking)}
                            className="mt-3 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md"
                        >
                            Record now
                        </button>
                    )}
                </div>
            </Card>

            <Card>
                <h3 className="text-lg font-semibold mb-3">History</h3>
                {history.length === 0 ? (
                    <EmptyState title="No journal entries yet" body="Use the prompt above to start your daily speaking habit." />
                ) : (
                    <ul className="space-y-2">
                        {history.map(e => (
                            <li
                                key={e.id}
                                className="flex items-center justify-between gap-3 p-3 rounded border border-slate-200 dark:border-slate-800"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{e.prompt}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {new Date(e.created_at).toLocaleDateString()} · {e.word_count} words · {Math.round(e.duration_seconds)}s
                                    </p>
                                </div>
                                {e.fluency_metrics?.wpm && (
                                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                                        {Math.round(e.fluency_metrics.wpm)} wpm
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
};

export default VoiceJournalPage;
