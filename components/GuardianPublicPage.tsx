/**
 * @file F2 — Public read-only guardian page (/g/<token>).
 *
 * Aggregate progress only. No raw transcripts, essays, or chat content.
 */

import React, { useEffect, useState } from 'react';
import { apiConfig } from '../services/apiClient';

interface PublicProgress {
    student_name: string;
    target_band: number | null;
    exam_date: string | null;
    daily_commitment_minutes: number | null;
    last_30_days: {
        sessions_completed: number;
        avg_band: {
            writing: number | null;
            speaking: number | null;
            reading: number | null;
            listening: number | null;
        };
    };
    guardian: { name: string; relationship: string };
    generated_at: string;
}

interface Props { token: string; }

const SkillRow: React.FC<{ label: string; band: number | null; target: number | null }> = ({ label, band, target }) => {
    const pct = band && target ? Math.min(100, Math.round((band / target) * 100)) : 0;
    return (
        <div>
            <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {band !== null ? band.toFixed(1) : '—'}
                    {target !== null && <span className="text-xs font-normal text-slate-500"> / {target.toFixed(1)}</span>}
                </span>
            </div>
            <div className="mt-1 h-2 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
};

const GuardianPublicPage: React.FC<Props> = ({ token }) => {
    const [data, setData] = useState<PublicProgress | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`${apiConfig.baseUrl}/public/guardian/${token}`)
            .then(async r => {
                if (!r.ok) throw new Error(r.status === 404 ? 'Link is invalid or revoked.' : `HTTP ${r.status}`);
                return r.json();
            })
            .then(setData)
            .catch(e => setError(e instanceof Error ? e.message : 'Failed to load.'));
    }, [token]);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200 py-10 px-4">
            <div className="max-w-xl mx-auto">
                <header className="mb-8 text-center">
                    <h1 className="text-2xl font-bold">IELTS Progress</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Read-only summary · aggregates only · no transcripts shared
                    </p>
                </header>

                {error && (
                    <div role="alert" className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-4 py-3 text-sm">
                        {error}
                    </div>
                )}

                {data && (
                    <div className="space-y-6">
                        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Student</p>
                            <h2 className="text-lg font-bold mt-1">{data.student_name}</h2>
                            <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                                <dt className="text-slate-500 dark:text-slate-400">Target band</dt>
                                <dd className="font-semibold">{data.target_band ? data.target_band.toFixed(1) : '—'}</dd>
                                <dt className="text-slate-500 dark:text-slate-400">Exam date</dt>
                                <dd className="font-semibold">{data.exam_date ? new Date(data.exam_date).toLocaleDateString() : 'Not booked'}</dd>
                                <dt className="text-slate-500 dark:text-slate-400">Daily commitment</dt>
                                <dd className="font-semibold">{data.daily_commitment_minutes ? `${data.daily_commitment_minutes} min` : '—'}</dd>
                                <dt className="text-slate-500 dark:text-slate-400">Last 30 days</dt>
                                <dd className="font-semibold">{data.last_30_days.sessions_completed} session{data.last_30_days.sessions_completed === 1 ? '' : 's'}</dd>
                            </dl>
                        </section>

                        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                            <h3 className="text-sm font-semibold">Average band by skill (last 30 days)</h3>
                            <SkillRow label="Writing" band={data.last_30_days.avg_band.writing} target={data.target_band} />
                            <SkillRow label="Speaking" band={data.last_30_days.avg_band.speaking} target={data.target_band} />
                            <SkillRow label="Reading" band={data.last_30_days.avg_band.reading} target={data.target_band} />
                            <SkillRow label="Listening" band={data.last_30_days.avg_band.listening} target={data.target_band} />
                        </section>

                        <p className="text-xs text-center text-slate-400 dark:text-slate-500">
                            Shared with {data.guardian.name} ({data.guardian.relationship || 'guardian'}). Generated {new Date(data.generated_at).toLocaleString()}.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GuardianPublicPage;
