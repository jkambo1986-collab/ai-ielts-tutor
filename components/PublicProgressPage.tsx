/**
 * @file Public read-only progress profile (X2).
 *
 * Rendered when the URL path is /u/<slug>. No auth required — the slug
 * itself is the access control. Mobile-first single-column layout.
 */

import React, { useEffect, useState } from 'react';
import { PublicProfile } from '../services/uxService';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8000/api/v1';

interface Props {
    slug: string;
}

const PublicProgressPage: React.FC<Props> = ({ slug }) => {
    const [profile, setProfile] = useState<PublicProfile | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(`${API_BASE}/public/u/${slug}`)
            .then(r => r.ok ? r.json() : Promise.reject(new Error(r.statusText)))
            .then(data => { if (!cancelled) setProfile(data as PublicProfile); })
            .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Not found'); });
        return () => { cancelled = true; };
    }, [slug]);

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
                <div className="text-center max-w-sm">
                    <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Profile not found</h1>
                    <p className="text-sm text-slate-500 mt-2">The link may have been removed by its owner.</p>
                </div>
            </div>
        );
    }
    if (!profile) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
                <p className="text-sm text-slate-500">Loading…</p>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-14">
                <header className="text-center mb-8">
                    <p className="text-xs uppercase tracking-wide text-slate-500">AI IELTS Tutor — Progress profile</p>
                    <h1 className="text-3xl sm:text-4xl font-bold mt-2">{profile.name}</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {profile.exam_date ? `Exam date: ${new Date(profile.exam_date + 'T00:00:00').toLocaleDateString()}` : 'Exam date private'}
                    </p>
                </header>

                <section className="grid grid-cols-2 gap-3 mb-6">
                    <Tile label="Target band" value={profile.target_band ? profile.target_band.toFixed(1) : '—'} />
                    <Tile label="Streak" value={`${profile.streak_days}d`} />
                </section>

                <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-4">
                    <h2 className="text-sm font-semibold mb-3">Recent writing</h2>
                    {profile.recent_writing.length === 0 ? (
                        <p className="text-sm text-slate-500">No writing sessions yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {profile.recent_writing.map((w, i) => (
                                <li key={i} className="flex justify-between text-sm">
                                    <span className="text-slate-600 dark:text-slate-300">{new Date(w.created_at).toLocaleDateString()} · {w.task_type === 'task1' ? 'Task 1' : 'Task 2'}</span>
                                    <span className="font-bold">{w.band != null ? w.band.toFixed(1) : '—'}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-4">
                    <h2 className="text-sm font-semibold mb-3">Recent speaking</h2>
                    {profile.recent_speaking.length === 0 ? (
                        <p className="text-sm text-slate-500">No analyzed speaking sessions yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {profile.recent_speaking.map((s, i) => (
                                <li key={i} className="flex justify-between text-sm">
                                    <span className="text-slate-600 dark:text-slate-300">{new Date(s.created_at).toLocaleDateString()}</span>
                                    <span className="font-bold">{s.band.toFixed(1)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <footer className="text-center mt-10">
                    <p className="text-xs text-slate-400">
                        This page is opt-in and only shows summary data. Transcripts, feedback, and personal info are private.
                    </p>
                </footer>
            </div>
        </main>
    );
};

const Tile: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-center">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
);

export default PublicProgressPage;
