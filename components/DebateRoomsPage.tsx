import React, { useEffect, useState } from 'react';
import Card from './Card';
import Loader from './Loader';
import EmptyState from './ui/EmptyState';
import { debateService, DebateRoomSummary } from '../services/practiceMoreService';

const DebateRoomsPage: React.FC = () => {
    const [rooms, setRooms] = useState<DebateRoomSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        debateService.queue()
            .then(r => setRooms(r.results || []))
            .catch(e => setError(e instanceof Error ? e.message : 'Failed to load debate rooms.'));
    }, []);

    if (error) {
        return <Card><div role="alert" className="text-red-500">{error}</div></Card>;
    }
    if (!rooms) {
        return <Card><Loader text="Looking for debate rooms…" /></Card>;
    }

    return (
        <Card>
            <h2 className="text-2xl font-bold">Debate Rooms</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
                Practice with peers on a shared topic, with an AI moderator keeping the discussion balanced.
            </p>

            {rooms.length === 0 ? (
                <EmptyState
                    title="No rooms open right now"
                    body="Rooms appear when 2-3 students opt in on a topic. Check back soon, or invite a peer."
                />
            ) : (
                <ul className="space-y-3">
                    {rooms.map(r => (
                        <li
                            key={r.id}
                            className="flex items-center justify-between gap-4 p-4 rounded-lg border border-slate-200 dark:border-slate-800"
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">{r.topic}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {r.participants_count} participant{r.participants_count === 1 ? '' : 's'} · {r.status}
                                </p>
                            </div>
                            <span
                                className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${
                                    r.status === 'live'
                                        ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                                        : r.status === 'queued'
                                        ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                }`}
                            >
                                {r.status}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
};

export default DebateRoomsPage;
