/**
 * @file F2 — Guardian / sponsor management card.
 *
 * Lives inside the Profile "Sharing" tab. Lets the student create a guardian
 * link (parent / employer / sponsor) and copy the read-only URL.
 */

import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { useToast } from './ui/Toast';
import EmptyState from './ui/EmptyState';

interface Guardian {
    id: string;
    name: string;
    email: string;
    relationship: string;
    token: string;
    created_at: string;
    revoked_at: string | null;
    last_viewed_at: string | null;
    view_count: number;
}

const GuardianManagementCard: React.FC = () => {
    const { toast } = useToast();
    const [guardians, setGuardians] = useState<Guardian[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [relationship, setRelationship] = useState('parent');
    const [showForm, setShowForm] = useState(false);

    const refresh = () => {
        apiClient.get<Guardian[]>('/auth/guardians')
            .then(setGuardians)
            .catch(e => setError(e instanceof Error ? e.message : 'Failed to load guardians.'));
    };

    useEffect(() => { refresh(); }, []);

    const handleCreate = async () => {
        if (!name.trim() || !email.trim()) return;
        setCreating(true);
        try {
            await apiClient.post<Guardian>('/auth/guardians', {
                name: name.trim(), email: email.trim(), relationship,
            });
            setName('');
            setEmail('');
            setRelationship('parent');
            setShowForm(false);
            toast({ kind: 'success', title: 'Guardian added', body: 'Share the unique link below with them.' });
            refresh();
        } catch (e) {
            toast({ kind: 'error', title: 'Failed to add guardian', body: e instanceof Error ? e.message : '' });
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async (g: Guardian) => {
        if (!window.confirm(`Revoke access for ${g.name}?`)) return;
        try {
            await apiClient.post(`/auth/guardians/${g.id}/revoke`);
            toast({ kind: 'success', title: 'Access revoked' });
            refresh();
        } catch (e) {
            toast({ kind: 'error', title: 'Revoke failed', body: e instanceof Error ? e.message : '' });
        }
    };

    const handleCopyLink = (g: Guardian) => {
        const url = `${window.location.origin}/g/${g.token}`;
        navigator.clipboard.writeText(url).then(
            () => toast({ kind: 'success', title: 'Link copied' }),
            () => toast({ kind: 'warning', title: 'Could not copy', body: url }),
        );
    };

    return (
        <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
            <header className="mb-4 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Guardians & sponsors</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Give a parent, employer, or sponsor a read-only link to your progress.
                        They see streaks and band averages — never your raw essays or transcripts.
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(s => !s)}
                    className="text-sm font-medium px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60"
                >
                    {showForm ? 'Cancel' : 'Add guardian'}
                </button>
            </header>

            {showForm && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 mb-4 space-y-3">
                    <input
                        type="text" placeholder="Name" value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full text-sm px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <input
                        type="email" placeholder="Email" value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full text-sm px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <select
                        value={relationship}
                        onChange={(e) => setRelationship(e.target.value)}
                        className="w-full text-sm px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                        <option value="parent">Parent</option>
                        <option value="guardian">Guardian</option>
                        <option value="employer">Employer / Sponsor</option>
                        <option value="instructor">Instructor</option>
                        <option value="other">Other</option>
                    </select>
                    <button
                        onClick={handleCreate}
                        disabled={creating || !name.trim() || !email.trim()}
                        className="text-sm font-medium px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
                    >
                        {creating ? 'Creating…' : 'Create link'}
                    </button>
                </div>
            )}

            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

            {guardians === null ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
            ) : guardians.length === 0 ? (
                <EmptyState title="No guardians yet" body="Add one above to share read-only progress." />
            ) : (
                <ul className="space-y-2">
                    {guardians.map(g => (
                        <li
                            key={g.id}
                            className={`flex items-center justify-between gap-3 p-3 rounded border ${
                                g.revoked_at ? 'border-slate-200 dark:border-slate-800 opacity-60' : 'border-slate-200 dark:border-slate-800'
                            }`}
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                    {g.name} <span className="text-xs text-slate-500 dark:text-slate-400">· {g.relationship || '—'}</span>
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                    {g.email} · viewed {g.view_count} time{g.view_count === 1 ? '' : 's'}
                                </p>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                                {!g.revoked_at && (
                                    <>
                                        <button
                                            onClick={() => handleCopyLink(g)}
                                            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            Copy link
                                        </button>
                                        <button
                                            onClick={() => handleRevoke(g)}
                                            className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                                        >
                                            Revoke
                                        </button>
                                    </>
                                )}
                                {g.revoked_at && (
                                    <span className="text-xs text-slate-500 dark:text-slate-400">Revoked</span>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default GuardianManagementCard;
