import React, { useEffect, useState } from 'react';
import Card from './Card';
import Loader from './Loader';
import EmptyState from './ui/EmptyState';
import { markerQueueService, ReviewRequest } from '../services/practiceMoreService';
import { useToast } from './ui/Toast';

const MarkerQueuePage: React.FC = () => {
    const { toast } = useToast();
    const [items, setItems] = useState<ReviewRequest[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [completing, setCompleting] = useState<string | null>(null);
    const [band, setBand] = useState<string>('7.0');
    const [notes, setNotes] = useState<string>('');

    const refresh = () => {
        markerQueueService.queue()
            .then(r => setItems(r.results || []))
            .catch(e => setError(e instanceof Error ? e.message : 'Failed to load queue.'));
    };

    useEffect(() => { refresh(); }, []);

    const handleClaim = async (id: string) => {
        setBusyId(id);
        try {
            await markerQueueService.claim(id);
            toast({ kind: 'success', title: 'Claimed' });
            refresh();
        } catch (e) {
            toast({ kind: 'error', title: 'Claim failed', body: e instanceof Error ? e.message : 'Try again' });
        } finally {
            setBusyId(null);
        }
    };

    const handleComplete = async (id: string) => {
        const parsed = parseFloat(band);
        if (isNaN(parsed) || parsed < 0 || parsed > 9) {
            toast({ kind: 'warning', title: 'Enter a band 0-9' });
            return;
        }
        setBusyId(id);
        try {
            await markerQueueService.complete(id, { band: parsed, notes });
            toast({ kind: 'success', title: 'Submitted' });
            setCompleting(null);
            setBand('7.0');
            setNotes('');
            refresh();
        } catch (e) {
            toast({ kind: 'error', title: 'Submit failed', body: e instanceof Error ? e.message : 'Try again' });
        } finally {
            setBusyId(null);
        }
    };

    if (error) {
        return <Card><div role="alert" className="text-red-500">{error}</div></Card>;
    }
    if (!items) {
        return <Card><Loader text="Loading queue…" /></Card>;
    }

    return (
        <Card>
            <h2 className="text-2xl font-bold">Marker Queue</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
                Human-graded review requests. Claim one to start, then submit a band score and notes.
            </p>

            {items.length === 0 ? (
                <EmptyState title="Queue is empty" body="No review requests waiting right now." />
            ) : (
                <ul className="space-y-3">
                    {items.map(r => (
                        <li key={r.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold capitalize">{r.skill} · {r.status}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Requested {new Date(r.requested_at).toLocaleString()} · SLA {new Date(r.sla_due_at).toLocaleString()}
                                    </p>
                                    {r.excerpt && <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-3">{r.excerpt}</p>}
                                </div>
                                <div className="shrink-0 space-x-2">
                                    {r.status === 'queued' && (
                                        <button
                                            onClick={() => handleClaim(r.id)}
                                            disabled={busyId === r.id}
                                            className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-3 py-1.5 rounded-md"
                                        >
                                            Claim
                                        </button>
                                    )}
                                    {r.status === 'claimed' && (
                                        <button
                                            onClick={() => setCompleting(completing === r.id ? null : r.id)}
                                            className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md"
                                        >
                                            {completing === r.id ? 'Cancel' : 'Submit grade'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {completing === r.id && (
                                <div className="mt-3 space-y-2">
                                    <input
                                        type="number"
                                        min={0}
                                        max={9}
                                        step={0.5}
                                        value={band}
                                        onChange={e => setBand(e.target.value)}
                                        placeholder="Band 0-9"
                                        className="w-32 text-sm px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    />
                                    <textarea
                                        rows={3}
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        placeholder="Marker notes…"
                                        className="w-full text-sm px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    />
                                    <button
                                        onClick={() => handleComplete(r.id)}
                                        disabled={busyId === r.id}
                                        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-3 py-1.5 rounded-md"
                                    >
                                        Submit
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
};

export default MarkerQueuePage;
