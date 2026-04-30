/**
 * @file Performance Dashboard — fully backend-driven.
 *
 * Fetches /analytics/dashboard once for the selected period and renders all
 * of: streak, target gauges, smart stat cards, sub-skill drilldown, per-task
 * splits, time-to-target, vocab, mock test, error-cards (SRS), calibration,
 * cohort benchmarks (admin), examiner scorecards, share link, alerts.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../App';
import { ADMIN_ROLES, IELTSSection } from '../types';
import { DashboardPayload, dashboardService } from '../services/dashboardService';
import {
    AlertsBanner, CalibrationCard, CohortCard, ConsistencyCard, ErrorCardsCard,
    HeroStrip, MockTestCard, QualityCard, ScorecardCard, Section, ShareLinkCard,
    SkillStatCard, SpeakingAnalysisHint, SubSkillCard, TaskSplitCard,
    TimeToTargetCard, VocabularyCard,
} from './dashboard/cards';
import { TargetGauge } from './dashboard/charts';
import ErrorLogPage from './dashboard/ErrorLogPage';
import Loader from './Loader';
import CommitmentRing from './ui/CommitmentRing';
import DailyChallengeCard from './ui/DailyChallengeCard';
import BadgeGallery from './ui/BadgeGallery';
import CrashPlanBanner from './ui/CrashPlanBanner';
import ReadingWpmWidget from './ui/ReadingWpmWidget';

type DaysFilter = 7 | 30 | 'all';

const Dashboard: React.FC = () => {
    const { currentUser, setActiveTab, clearAllHistories } = useAppContext();
    const [days, setDays] = useState<DaysFilter>('all');
    const [data, setData] = useState<DashboardPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'overview' | 'error-log'>('overview');

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const payload = await dashboardService.fetchDashboard(days);
            setData(payload);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load dashboard.');
        } finally {
            setLoading(false);
        }
    }, [days]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const isAdmin = currentUser ? ADMIN_ROLES.includes(currentUser.role) : false;

    const dismissAlert = useCallback(async (id: string) => {
        try {
            await dashboardService.dismissAlert(id);
            setData(prev => prev ? { ...prev, alerts: prev.alerts.filter(a => a.id !== id) } : prev);
        } catch { /* swallow — UI still updated optimistically next reload */ }
    }, []);

    const handleAlertCta = useCallback((target: string) => {
        const map: Record<string, IELTSSection> = {
            Writing: IELTSSection.Writing,
            Speaking: IELTSSection.Speaking,
            Reading: IELTSSection.Reading,
            Listening: IELTSSection.Listening,
            Quiz: IELTSSection.Quiz,
        };
        if (map[target]) setActiveTab(map[target]);
    }, [setActiveTab]);

    const handleClearHistory = useCallback(async () => {
        if (!window.confirm('Delete all your practice history? This cannot be undone.')) return;
        clearAllHistories();
        await fetchData();
    }, [clearAllHistories, fetchData]);

    if (!currentUser) return null;

    if (view === 'error-log') {
        return <ErrorLogPage onBack={() => setView('overview')} />;
    }

    const totalSessions = data
        ? data.counts.writing + data.counts.speaking + data.counts.reading + data.counts.listening
        : 0;

    return (
        <div className="space-y-6">
            {/* Header / filters */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Performance Dashboard</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Backend-driven analytics across writing, speaking, reading, and listening.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-1 flex space-x-1">
                        {([7, 30, 'all'] as DaysFilter[]).map(d => (
                            <button
                                key={String(d)}
                                onClick={() => setDays(d)}
                                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                    days === d
                                        ? 'bg-blue-500 text-white shadow'
                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            >
                                {d === 'all' ? 'All time' : `${d}d`}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={handleClearHistory}
                        disabled={totalSessions === 0}
                        className="text-xs px-3 py-1.5 rounded text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40"
                    >
                        Clear history
                    </button>
                </div>
            </div>

            {error && (
                <div role="alert" className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm px-4 py-3">
                    {error}
                </div>
            )}

            {loading && !data && (
                <div className="py-12"><Loader text="Loading dashboard…" /></div>
            )}

            {data && (
                <>
                    {/* Alerts (#28) */}
                    <AlertsBanner alerts={data.alerts} onDismiss={dismissAlert} onCta={handleAlertCta} />

                    {/* Crash plan banner — fires when exam_date within 14 days. */}
                    {currentUser?.examDate && (() => {
                        const days = Math.ceil(
                            (new Date(currentUser.examDate).getTime() - Date.now()) / 86400000,
                        );
                        return days >= 0 && days <= 14
                            ? <CrashPlanBanner daysUntilExam={days} />
                            : null;
                    })()}

                    {/* Today's daily challenge. */}
                    <DailyChallengeCard onAccept={(c) => {
                        const tabMap: Record<string, IELTSSection | undefined> = {
                            writing: IELTSSection.Writing,
                            speaking: IELTSSection.Speaking,
                            reading: IELTSSection.Reading,
                            listening: IELTSSection.Listening,
                        };
                        if (tabMap[c.skill]) setActiveTab(tabMap[c.skill]!);
                    }} />

                    {/* Top strip: commitment + WPM widget side-by-side */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {data.daily_commitment && data.daily_commitment.commitment_minutes > 0 ? (
                            <CommitmentRing
                                minutesToday={data.daily_commitment.minutes_today}
                                commitmentMinutes={data.daily_commitment.commitment_minutes}
                                progress={data.daily_commitment.progress}
                            />
                        ) : <div />}
                        {data.reading_wpm && data.reading_wpm.avg_wpm !== null ? (
                            <ReadingWpmWidget
                                avgWpm={data.reading_wpm.avg_wpm}
                                targetWpm={data.reading_wpm.target_wpm_for_band}
                                samples={data.reading_wpm.samples}
                            />
                        ) : <div />}
                    </div>

                    {/* Hero strip (#12 streak, #18 effective time, target) */}
                    <HeroStrip data={data} />

                    {/* Earned badges */}
                    <Section
                        title="Achievements"
                        subtitle="Badges earned for streaks, calibration accuracy, and skill milestones."
                    >
                        <BadgeGallery />
                    </Section>

                    {/* Target gauges (#11) */}
                    <Section
                        title="Distance to your target"
                        subtitle={`Latest band per skill against your goal of band ${data.target.toFixed(1)}.`}
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <TargetGauge label="Writing" current={data.latest.writing} target={data.target} />
                            <TargetGauge label="Speaking" current={data.latest.speaking} target={data.target} />
                            <TargetGauge label="Reading" current={data.latest.reading} target={data.target} />
                            <TargetGauge label="Listening" current={data.latest.listening} target={data.target} />
                        </div>
                    </Section>

                    {/* Smart stat grid (#1, #2, #4, #15, #5) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <SkillStatCard
                            label="Writing"
                            latest={data.latest.writing}
                            average={data.averages.writing}
                            trend={data.trends.writing}
                            count={data.counts.writing}
                            rawCount={data.counts.writing_raw}
                        />
                        <SkillStatCard
                            label="Speaking"
                            latest={data.latest.speaking}
                            average={data.averages.speaking}
                            trend={data.trends.speaking}
                            count={data.counts.speaking}
                            rawCount={data.counts.speaking_raw}
                            extraNote={data.speaking_analysis_state.pending > 0
                                ? `${data.speaking_analysis_state.pending} session${data.speaking_analysis_state.pending === 1 ? '' : 's'} not yet analyzed`
                                : undefined}
                        />
                        <SkillStatCard
                            label="Reading (band)"
                            latest={data.latest.reading}
                            average={data.averages.reading}
                            trend={data.trends.reading}
                            count={data.counts.reading}
                            rawCount={data.counts.reading_raw}
                        />
                        <SkillStatCard
                            label="Listening (band)"
                            latest={data.latest.listening}
                            average={data.averages.listening}
                            trend={data.trends.listening}
                            count={data.counts.listening}
                            rawCount={data.counts.listening_raw}
                        />
                    </div>

                    <SpeakingAnalysisHint data={data} />

                    {/* Two-column layout below */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <SubSkillCard data={data} />
                        <TaskSplitCard data={data} />
                        <ConsistencyCard data={data} />
                        <TimeToTargetCard data={data} />
                        <VocabularyCard data={data} />
                        <QualityCard data={data} />
                        <MockTestCard data={data} />
                        <ErrorCardsCard data={data} onOpen={() => setView('error-log')} />
                        <CalibrationCard data={data} />
                        <ScorecardCard kind="writing" />
                        <ScorecardCard kind="speaking" />
                        <ShareLinkCard />
                        {isAdmin && <CohortCard />}
                    </div>

                    {/* Methodology note (#8) */}
                    <Section title="How these numbers are computed" subtitle="Transparent methodology — not a black box.">
                        <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc list-inside">
                            <li><strong>Latest band</strong>: most recent session in the selected period.</li>
                            <li><strong>Average</strong>: arithmetic mean across completed sessions in the period.</li>
                            <li><strong>Trend</strong>: mean of the second half of the period minus the mean of the first half.</li>
                            <li><strong>Reading / Listening band</strong>: official IELTS Academic raw → 9-band table (canonical, not interpolated).</li>
                            <li><strong>Sub-skills</strong>: average of the named criterion across feedback objects in the period.</li>
                            <li><strong>Quality</strong>: 0-100 score weighting length, completeness, and analysis depth per session.</li>
                            <li><strong>Effective practice</strong>: sum of session durations weighted by the per-session quality score.</li>
                            <li><strong>Time to target</strong>: linear regression on the band trend; only shown when slope &gt; 0 and ETA &lt; 18 months out.</li>
                            <li><strong>Streak</strong>: consecutive calendar days with at least one completed session.</li>
                            <li><strong>Vocabulary</strong>: lemmas extracted from your writing and speaking, deduplicated and tagged via a CEFR/AWL lexicon.</li>
                            <li><strong>Calibration delta</strong>: predicted band − actual band; near zero means well-calibrated.</li>
                        </ul>
                    </Section>
                </>
            )}
        </div>
    );
};

export default Dashboard;
