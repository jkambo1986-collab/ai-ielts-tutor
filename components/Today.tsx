/**
 * @file "Today" landing page (D1).
 *
 * Composes streak headline, exam countdown, "continue", recommended block,
 * SRS due, and yesterday's win/gap into a single morning-routine screen.
 *
 * Sits at the top of the Dashboard route so the user lands here by default.
 * The full Stats dashboard is still one click away (the rest of Dashboard.tsx
 * renders below this component).
 */

import React, { useEffect, useState } from 'react';
import { useAppContext } from '../App';
import { dashboardService, DashboardPayload } from '../services/dashboardService';
import { speakingClient, CueCard } from '../services/speakingClient';
import { generateRandomWritingPrompt } from '../services/promptService';
import { IELTSSection } from '../types';
import EmptyState from './ui/EmptyState';
import { SkeletonStatGrid } from './ui/Skeleton';
import { Section } from './dashboard/cards';

const Today: React.FC = () => {
    const { currentUser, setActiveTab } = useAppContext();
    const [payload, setPayload] = useState<DashboardPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [recommendedCard, setRecommendedCard] = useState<CueCard | null>(null);
    const [recommendedWriting, setRecommendedWriting] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            dashboardService.fetchDashboard('all').catch(() => null),
            speakingClient.fetchRandomCueCard('medium').catch(() => ({ card: null })),
        ]).then(([dash, card]) => {
            if (cancelled) return;
            setPayload(dash);
            setRecommendedCard(card?.card ?? null);
            setRecommendedWriting(generateRandomWritingPrompt());
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, []);

    const greeting = useGreeting(currentUser?.name);

    return (
        <div className="space-y-5">
            {/* Big headline */}
            <header className="space-y-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">
                    {greeting}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {payload && payload.streak_days > 0
                        ? `Day ${payload.streak_days} of your streak — keep it going.`
                        : "Today is a great day to start a streak."}
                </p>
            </header>

            {loading || !payload ? (
                <SkeletonStatGrid count={3} />
            ) : (
                <>
                    {/* Top tiles: streak, due SRS, target gap */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Tile
                            label="Streak"
                            value={`${payload.streak_days}d`}
                            hint={payload.streak_days > 0 ? 'Practice today to extend it' : 'Start one today'}
                            onClick={() => setActiveTab(IELTSSection.Speaking)}
                        />
                        <Tile
                            label="SRS due"
                            value={String(payload.error_cards.due_now)}
                            hint={payload.error_cards.due_now > 0 ? '~3 minutes to clear' : 'No reviews due'}
                            onClick={() => setActiveTab(IELTSSection.Dashboard)}
                            accent={payload.error_cards.due_now > 0 ? 'amber' : undefined}
                        />
                        <Tile
                            label="Today's plan"
                            value={`${currentUser?.dailyCommitmentMinutes ?? 20} min`}
                            hint="Block out one focused session"
                            onClick={() => setActiveTab(IELTSSection.Speaking)}
                        />
                    </div>

                    {/* Recommended block */}
                    <Section
                        title="Today's recommended block"
                        subtitle="One writing prompt, one cue card, one quiz — picked for your level."
                    >
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                            <RecommendCard
                                kind="Writing"
                                title={recommendedWriting ?? 'Writing prompt'}
                                cta="Start writing"
                                onClick={() => setActiveTab(IELTSSection.Writing)}
                            />
                            <RecommendCard
                                kind="Speaking"
                                title={recommendedCard?.topic ?? 'Mock speaking session'}
                                cta="Start speaking"
                                onClick={() => setActiveTab(IELTSSection.Speaking)}
                            />
                            <RecommendCard
                                kind="Quiz"
                                title="5-question grammar / vocab quiz"
                                cta="Start quiz"
                                onClick={() => setActiveTab(IELTSSection.Quiz)}
                            />
                        </div>
                    </Section>

                    {/* Yesterday digest */}
                    <Section title="Yesterday at a glance" subtitle="What's worth remembering from your last sessions.">
                        {payload.counts.writing + payload.counts.speaking + payload.counts.reading + payload.counts.listening === 0 ? (
                            <EmptyState
                                title="Nothing yet"
                                body="Complete one session today and tomorrow's tile will be full."
                                primaryAction={{ label: 'Start a 5-minute speaking session', onClick: () => setActiveTab(IELTSSection.Speaking) }}
                            />
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Insight label="Latest writing" value={payload.latest.writing != null ? payload.latest.writing.toFixed(1) : '—'} good={payload.trends.writing != null && payload.trends.writing >= 0} />
                                <Insight label="Latest speaking" value={payload.latest.speaking != null ? payload.latest.speaking.toFixed(1) : '—'} good={payload.trends.speaking != null && payload.trends.speaking >= 0} />
                                <Insight label="Latest reading" value={payload.latest.reading != null ? payload.latest.reading.toFixed(1) : '—'} good={payload.trends.reading != null && payload.trends.reading >= 0} />
                                <Insight label="Latest listening" value={payload.latest.listening != null ? payload.latest.listening.toFixed(1) : '—'} good={payload.trends.listening != null && payload.trends.listening >= 0} />
                            </div>
                        )}
                    </Section>
                </>
            )}
        </div>
    );
};

const Tile: React.FC<{ label: string; value: string; hint: string; onClick?: () => void; accent?: 'amber' }> = ({ label, value, hint, onClick, accent }) => (
    <button
        onClick={onClick}
        className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 w-full"
    >
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${accent === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>
    </button>
);

const RecommendCard: React.FC<{ kind: string; title: string; cta: string; onClick: () => void }> = ({ kind, title, cta, onClick }) => (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-2 bg-white dark:bg-slate-900">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{kind}</span>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-3 min-h-[40px]">{title}</p>
        <button
            onClick={onClick}
            className="mt-auto text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md px-3 py-1.5 self-start focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
            {cta} →
        </button>
    </div>
);

const Insight: React.FC<{ label: string; value: string; good: boolean }> = ({ label, value, good }) => (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex items-baseline justify-between bg-white dark:bg-slate-900">
        <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
        <span className={`text-lg font-bold ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`}>{value}</span>
    </div>
);

function useGreeting(name: string | undefined): string {
    const hour = new Date().getHours();
    const segment = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return name ? `${segment}, ${name.split(' ')[0]}` : segment;
}

export default Today;
