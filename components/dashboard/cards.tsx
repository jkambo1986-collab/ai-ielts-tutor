/**
 * @file Dashboard card components — each consumes one slice of the
 * /analytics/dashboard payload (or its own endpoint).
 */

import React, { useState } from 'react';
import {
    DashboardAlert, DashboardPayload, dashboardService,
    Scorecard, ShareLink,
} from '../../services/dashboardService';
import { Heatmap12W, SubSkillBar, TargetGauge, TrendBadge, WeekdayStrip } from './charts';

const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return iso;
    }
};

export const Section: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, right, children }) => (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <header className="flex items-start justify-between gap-3 mb-4">
            <div>
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
                {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
            {right}
        </header>
        {children}
    </section>
);

// -- Alerts (#28) -- //
export const AlertsBanner: React.FC<{ alerts: DashboardAlert[]; onDismiss: (id: string) => void; onCta?: (target: string) => void }> = ({ alerts, onDismiss, onCta }) => {
    if (!alerts.length) return null;
    return (
        <div className="space-y-2">
            {alerts.map(a => {
                const tone =
                    a.severity === 'warning' ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900 text-amber-900 dark:text-amber-200' :
                    a.severity === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200' :
                    'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-900 text-blue-900 dark:text-blue-200';
                return (
                    <div key={a.id} className={`rounded-lg border ${tone} px-4 py-3 flex items-start justify-between gap-4`}>
                        <div>
                            <p className="text-sm font-semibold">{a.title}</p>
                            {a.body && <p className="text-xs mt-0.5 opacity-90">{a.body}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {a.cta_label && (
                                <button onClick={() => onCta?.(a.cta_target)} className="text-xs font-medium underline underline-offset-2 hover:no-underline">
                                    {a.cta_label}
                                </button>
                            )}
                            <button onClick={() => onDismiss(a.id)} className="text-xs opacity-60 hover:opacity-100" aria-label="Dismiss">✕</button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// -- Hero strip (#12 streak + at-a-glance counts + #18 effective time) -- //
export const HeroStrip: React.FC<{ data: DashboardPayload }> = ({ data }) => {
    const total = data.counts.writing + data.counts.speaking + data.counts.reading + data.counts.listening;
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <HeroStat label="Streak" value={`${data.streak_days}d`} hint={data.streak_days > 0 ? 'days in a row' : 'practice today to start'} accent="text-emerald-500" />
            <HeroStat label="Sessions" value={String(total)} hint="completed" />
            <HeroStat label="Effective practice" value={`${data.effective_practice_minutes.toFixed(0)} min`} hint="quality-weighted" />
            <HeroStat label="Target" value={data.target.toFixed(1)} hint="band goal" accent="text-amber-500" />
        </div>
    );
};

const HeroStat: React.FC<{ label: string; value: string; hint?: string; accent?: string }> = ({ label, value, hint, accent }) => (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${accent ?? 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
        {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
);

// -- Skill stat card with trend (#1, #2, #4, #15) -- //
export const SkillStatCard: React.FC<{
    label: string;
    latest: number | null;
    average: number | null;
    trend: number | null;
    count: number;
    rawCount: number;
    extraNote?: string;
}> = ({ label, latest, average, trend, count, rawCount, extraNote }) => (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
            <TrendBadge delta={trend} />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                {latest != null ? latest.toFixed(1) : <span className="text-slate-400 text-lg">—</span>}
            </span>
            {average != null && (
                <span className="text-xs text-slate-500" title="Average over the period">avg {average.toFixed(2)}</span>
            )}
        </div>
        <p className="text-xs text-slate-500 mt-2">
            {count} session{count === 1 ? '' : 's'}
            {rawCount !== count && (
                <span className="text-slate-400" title="Abandoned / partial sessions excluded">
                    {' '}(of {rawCount})
                </span>
            )}
        </p>
        {extraNote && <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">{extraNote}</p>}
    </div>
);

// -- Time-to-target (#16) -- //
export const TimeToTargetCard: React.FC<{ data: DashboardPayload }> = ({ data }) => {
    const skills: { label: string; key: keyof DashboardPayload['eta_to_target'] }[] = [
        { label: 'Writing', key: 'writing' },
        { label: 'Speaking', key: 'speaking' },
        { label: 'Reading', key: 'reading' },
        { label: 'Listening', key: 'listening' },
    ];
    return (
        <Section title="Projected time to target" subtitle="Linear projection of your trend; needs ≥ 3 sessions and a positive slope.">
            <div className="grid grid-cols-2 gap-3">
                {skills.map(s => {
                    const eta = data.eta_to_target[s.key];
                    const reached = data.latest[s.key] != null && data.latest[s.key]! >= data.target;
                    return (
                        <div key={s.key} className="rounded border border-slate-200 dark:border-slate-800 p-3">
                            <p className="text-xs text-slate-500">{s.label}</p>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1">
                                {reached ? 'Already at target' : eta ? formatDate(eta) : 'Not yet projectable'}
                            </p>
                        </div>
                    );
                })}
            </div>
        </Section>
    );
};

// -- Sub-skill drill-down (#13) -- //
export const SubSkillCard: React.FC<{ data: DashboardPayload }> = ({ data }) => (
    <Section title="Sub-skill breakdown" subtitle="Average per IELTS scoring criterion across the selected period.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <h4 className="text-xs font-semibold uppercase text-slate-500 mb-3">Writing</h4>
                <div className="space-y-3">
                    <SubSkillBar label="Task Achievement" value={data.writing_subskills.task_achievement} />
                    <SubSkillBar label="Coherence & Cohesion" value={data.writing_subskills.coherence_cohesion} />
                    <SubSkillBar label="Lexical Resource" value={data.writing_subskills.lexical_resource} />
                    <SubSkillBar label="Grammar & Accuracy" value={data.writing_subskills.grammar_accuracy} />
                </div>
            </div>
            <div>
                <h4 className="text-xs font-semibold uppercase text-slate-500 mb-3">Speaking</h4>
                <div className="space-y-3">
                    <SubSkillBar label="Fluency & Coherence" value={data.speaking_subskills.fluency_coherence} />
                    <SubSkillBar label="Lexical Resource" value={data.speaking_subskills.lexical_resource} />
                    <SubSkillBar label="Grammar & Accuracy" value={data.speaking_subskills.grammar_accuracy} />
                    <SubSkillBar label="Pronunciation" value={data.speaking_subskills.pronunciation} />
                </div>
            </div>
        </div>
    </Section>
);

// -- Per-task type splits (#14) -- //
export const TaskSplitCard: React.FC<{ data: DashboardPayload }> = ({ data }) => {
    const w = data.writing_task_split;
    const s = data.speaking_part_split;
    const Cell: React.FC<{ label: string; avg: number | null; count: number }> = ({ label, avg, count }) => (
        <div className="text-center rounded border border-slate-200 dark:border-slate-800 p-3">
            <p className="text-[10px] uppercase text-slate-500 tracking-wide">{label}</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">
                {avg != null ? avg.toFixed(1) : <span className="text-slate-400 text-base">—</span>}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">{count} session{count === 1 ? '' : 's'}</p>
        </div>
    );
    return (
        <Section title="Per-task split" subtitle="Writing Task 1 vs Task 2; Speaking Parts 1, 2, 3.">
            <div>
                <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Writing</p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                    <Cell label="Task 1" avg={w.task1_avg} count={w.task1_count} />
                    <Cell label="Task 2" avg={w.task2_avg} count={w.task2_count} />
                </div>
                <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Speaking</p>
                <div className="grid grid-cols-4 gap-2">
                    <Cell label="Part 1" avg={s.part1_avg ?? null} count={(s as Record<string, number>).part1_count ?? 0} />
                    <Cell label="Part 2" avg={s.part2_avg ?? null} count={(s as Record<string, number>).part2_count ?? 0} />
                    <Cell label="Part 3" avg={s.part3_avg ?? null} count={(s as Record<string, number>).part3_count ?? 0} />
                    <Cell label="Mixed" avg={s.mixed_avg ?? null} count={(s as Record<string, number>).mixed_count ?? 0} />
                </div>
            </div>
        </Section>
    );
};

// -- Heatmap + weekday (#12, #6) -- //
export const ConsistencyCard: React.FC<{ data: DashboardPayload }> = ({ data }) => (
    <Section title="Consistency" subtitle="Last 12 weeks of practice activity.">
        <Heatmap12W grid={data.heatmap_12w} />
        <div className="mt-4">
            <p className="text-xs font-semibold uppercase text-slate-500 mb-2">When you practise</p>
            <WeekdayStrip counts={data.by_weekday} />
        </div>
    </Section>
);

// -- Vocabulary tracker (#19) -- //
export const VocabularyCard: React.FC<{ data: DashboardPayload }> = ({ data }) => (
    <Section title="Vocabulary range" subtitle="Unique lemmas observed in your writing & speaking.">
        <div className="grid grid-cols-3 gap-3">
            <Stat label="Unique words" value={data.vocabulary.unique_total} />
            <Stat label="B2+ words" value={data.vocabulary.unique_b2_plus} accent="text-blue-600 dark:text-blue-400" />
            <Stat label="Academic Word List" value={data.vocabulary.awl_total} accent="text-purple-600 dark:text-purple-400" />
        </div>
        {data.vocabulary.added_this_period != null && (
            <p className="text-xs text-slate-500 mt-3">
                <span className="font-semibold text-slate-700 dark:text-slate-200">+{data.vocabulary.added_this_period}</span> new lemmas seen this period.
            </p>
        )}
    </Section>
);

// -- Quality / effective practice (#18) -- //
export const QualityCard: React.FC<{ data: DashboardPayload }> = ({ data }) => {
    const quality = data.quality;
    return (
        <Section title="Practice quality" subtitle="Quality reflects length, completeness, and analysis depth.">
            <div className="grid grid-cols-2 gap-3">
                <Stat label="Writing" value={quality.writing != null ? `${quality.writing.toFixed(0)}%` : '—'} />
                <Stat label="Speaking" value={quality.speaking != null ? `${quality.speaking.toFixed(0)}%` : '—'} />
                <Stat label="Reading" value={quality.reading != null ? `${quality.reading.toFixed(0)}%` : '—'} />
                <Stat label="Listening" value={quality.listening != null ? `${quality.listening.toFixed(0)}%` : '—'} />
            </div>
            <p className="text-xs text-slate-500 mt-3">
                Effective practice this period: <span className="font-semibold text-slate-700 dark:text-slate-200">{data.effective_practice_minutes.toFixed(0)} min</span>
            </p>
        </Section>
    );
};

// -- Mock test readiness (#20) -- //
export const MockTestCard: React.FC<{ data: DashboardPayload }> = ({ data }) => {
    const m = data.mock_tests;
    const readiness = m.latest_readiness_score;
    return (
        <Section title="Mock test readiness" subtitle="Timed end-to-end mocks build test-day stamina.">
            {m.count === 0 ? (
                <p className="text-sm text-slate-500">No mock tests completed yet. A mock test simulates real exam timing across all four skills.</p>
            ) : (
                <div className="grid grid-cols-3 gap-3 items-center">
                    <Stat label="Latest band" value={m.latest_overall_band != null ? m.latest_overall_band.toFixed(1) : '—'} accent="text-blue-600 dark:text-blue-400" />
                    <Stat label="Readiness" value={readiness != null ? `${readiness.toFixed(0)}%` : '—'} accent="text-emerald-600 dark:text-emerald-400" />
                    <Stat label="Completed" value={String(m.count)} />
                </div>
            )}
        </Section>
    );
};

// -- SRS error cards (#22) -- //
export const ErrorCardsCard: React.FC<{ data: DashboardPayload; onOpen?: () => void }> = ({ data, onOpen }) => (
    <Section
        title="Error log (spaced repetition)"
        subtitle="AI-flagged mistakes you can review on a schedule."
        right={onOpen && (
            <button onClick={onOpen} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Open
            </button>
        )}
    >
        <div className="grid grid-cols-2 gap-3">
            <Stat label="Total cards" value={String(data.error_cards.total)} />
            <Stat label="Due now" value={String(data.error_cards.due_now)} accent={data.error_cards.due_now > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
        </div>
        {data.error_cards.due_now > 0 && (
            <p className="text-xs text-slate-500 mt-3">
                Reviewing 5 cards a day takes ~3 minutes and locks in past corrections.
            </p>
        )}
    </Section>
);

// -- Calibration (#25) -- //
export const CalibrationCard: React.FC<{ data: DashboardPayload }> = ({ data }) => {
    const c = data.calibration;
    if (!c.samples) {
        return (
            <Section title="Self-assessment calibration" subtitle="How accurately you predict your own band before submitting.">
                <p className="text-sm text-slate-500">No predictions logged yet. Predicting your band before each session sharpens self-assessment — itself an IELTS skill.</p>
            </Section>
        );
    }
    const bias = c.avg_delta ?? 0;
    const verdict = Math.abs(bias) < 0.25 ? 'Well calibrated' : bias > 0 ? 'Tend to over-estimate' : 'Tend to under-estimate';
    return (
        <Section title="Self-assessment calibration" subtitle={`${c.samples} prediction${c.samples === 1 ? '' : 's'} logged.`}>
            <div className="grid grid-cols-2 gap-3 items-center">
                <Stat label="Avg delta" value={`${bias > 0 ? '+' : ''}${bias.toFixed(2)}`} />
                <Stat label="Verdict" value={verdict} />
            </div>
        </Section>
    );
};

// -- Examiner-style scorecard (#24) + re-attempt CTA (#21) + fluency surfacing (#26) -- //
export const ScorecardCard: React.FC<{ kind: 'writing' | 'speaking' }> = ({ kind }) => {
    const [card, setCard] = React.useState<Scorecard | null | undefined>(undefined);
    const [reattemptUrl, setReattemptUrl] = React.useState<string | null>(null);
    React.useEffect(() => {
        let cancelled = false;
        dashboardService.fetchScorecard(kind).then(r => { if (!cancelled) setCard(r.scorecard); }).catch(() => setCard(null));
        return () => { cancelled = true; };
    }, [kind]);
    return (
        <Section title={`Latest ${kind} scorecard`} subtitle="Examiner-style breakdown of your most recent session.">
            {card === undefined ? <p className="text-sm text-slate-400">Loading…</p>
              : !card ? <p className="text-sm text-slate-500">No {kind} session to score yet.</p>
              : (
                <div>
                    <div className="flex items-baseline justify-between mb-3">
                        <span className="text-xs text-slate-500">{formatDate(card.created_at)}</span>
                        <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                            {card.overall_band != null ? card.overall_band.toFixed(1) : '—'}
                        </span>
                    </div>
                    <div className="space-y-3">
                        {card.criteria.map(c => (
                            <div key={c.key} className="border-l-2 border-blue-500 pl-3">
                                <div className="flex justify-between">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{c.label}</span>
                                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                        {typeof c.score === 'number' ? c.score.toFixed(1) : '—'}
                                    </span>
                                </div>
                                {c.comment && <p className="text-xs text-slate-500 mt-1">{c.comment}</p>}
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                        <button
                            onClick={() => {
                                // Mark this session as the re-attempt parent in localStorage; the
                                // Writing/Speaking flow reads it on next submit (#21).
                                try {
                                    localStorage.setItem(`reattempt_parent_${kind}`, card.session_id);
                                    setReattemptUrl(card.session_id);
                                } catch { /* ignore */ }
                            }}
                            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            {reattemptUrl ? 'Marked for re-attempt ✓' : 'Re-attempt this prompt'}
                        </button>
                        <span className="text-[11px] text-slate-400">
                            {kind === 'writing' && card.task_type ? `Task ${card.task_type === 'task1' ? '1' : '2'}` : null}
                            {kind === 'speaking' && card.part ? `Part ${card.part.replace('part', '')}` : null}
                        </span>
                    </div>
                </div>
            )}
        </Section>
    );
};

// -- Cohort benchmark (#23) — admin-only -- //
export const CohortCard: React.FC = () => {
    const [data, setData] = React.useState<unknown>(undefined);
    React.useEffect(() => {
        let cancelled = false;
        dashboardService.fetchCohort()
            .then(d => { if (!cancelled) setData(d); })
            .catch(() => setData(null));
        return () => { cancelled = true; };
    }, []);
    if (data === undefined) return <Section title="Cohort benchmarks"><p className="text-sm text-slate-400">Loading…</p></Section>;
    if (!data) return null; // 403 / no data
    const d = data as import('../../services/dashboardService').CohortBenchmark;
    return (
        <Section title="Cohort benchmarks" subtitle={`Lookback ${d.lookback_days} days. Cohorts < ${d.min_cohort_size} hidden.`}>
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-xs text-slate-500 text-left">
                        <th className="font-medium pb-2">Scope</th>
                        <th className="font-medium pb-2">Writing</th>
                        <th className="font-medium pb-2">Speaking</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td className="py-1 text-slate-700 dark:text-slate-200">You</td>
                        <td>{d.you.writing.avg?.toFixed(2) ?? '—'}</td>
                        <td>{d.you.speaking.avg?.toFixed(2) ?? '—'}</td></tr>
                    <tr><td className="py-1 text-slate-700 dark:text-slate-200">{d.institute.slug ?? 'Institute'}</td>
                        <td>{d.institute.writing.avg?.toFixed(2) ?? '—'}</td>
                        <td>{d.institute.speaking.avg?.toFixed(2) ?? '—'}</td></tr>
                    <tr><td className="py-1 text-slate-700 dark:text-slate-200">Platform</td>
                        <td>{d.platform.writing.avg?.toFixed(2) ?? '—'}</td>
                        <td>{d.platform.speaking.avg?.toFixed(2) ?? '—'}</td></tr>
                    {d.same_l1_cohort && (
                        <tr><td className="py-1 text-slate-700 dark:text-slate-200">{d.same_l1_cohort.language} cohort ({d.same_l1_cohort.cohort_size})</td>
                            <td>{d.same_l1_cohort.writing.avg?.toFixed(2) ?? '—'}</td>
                            <td>{d.same_l1_cohort.speaking.avg?.toFixed(2) ?? '—'}</td></tr>
                    )}
                </tbody>
            </table>
        </Section>
    );
};

// -- Share link (#27) -- //
export const ShareLinkCard: React.FC = () => {
    const [link, setLink] = React.useState<ShareLink | null>(null);
    const [loading, setLoading] = React.useState(false);
    const create = async () => {
        setLoading(true);
        try {
            const newLink = await dashboardService.createShareLink({ period_days: 30, ttl_days: 30 });
            setLink(newLink);
        } finally {
            setLoading(false);
        }
    };
    const copy = async () => {
        if (!link) return;
        try { await navigator.clipboard.writeText(link.url); } catch { /* ignore */ }
    };
    return (
        <Section title="Share progress" subtitle="Generate a read-only link of the last 30 days for tutors / records.">
            {!link ? (
                <button onClick={create} disabled={loading} className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded">
                    {loading ? 'Generating…' : 'Generate link'}
                </button>
            ) : (
                <div className="flex items-center gap-2">
                    <input readOnly value={link.url} className="flex-1 text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1.5 rounded" onClick={e => (e.target as HTMLInputElement).select()} />
                    <button onClick={copy} className="text-xs px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600">Copy</button>
                </div>
            )}
        </Section>
    );
};

// -- Speaking analysis state explainer (#2) -- //
export const SpeakingAnalysisHint: React.FC<{ data: DashboardPayload }> = ({ data }) => {
    const s = data.speaking_analysis_state;
    if (s.total === 0 || s.pending === 0) return null;
    return (
        <p className="text-xs text-amber-600 dark:text-amber-400">
            {s.analyzed} of {s.total} speaking sessions analyzed — open the others to score them.
        </p>
    );
};

// -- Helper -- //
const Stat: React.FC<{ label: string; value: string | number; accent?: string }> = ({ label, value, accent }) => (
    <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className={`text-lg font-bold mt-0.5 ${accent ?? 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
    </div>
);
