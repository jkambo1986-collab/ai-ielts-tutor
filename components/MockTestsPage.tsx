import React, { useEffect, useState } from 'react';
import Card from './Card';
import Loader from './Loader';
import EmptyState from './ui/EmptyState';
import { mockTestService, MockTestSummary } from '../services/practiceMoreService';
import { useAppContext } from '../App';
import { IELTSSection } from '../types';

const MockTestsPage: React.FC = () => {
    const { setActiveTab } = useAppContext();
    const [items, setItems] = useState<MockTestSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        mockTestService.list()
            .then(setItems)
            .catch(e => setError(e instanceof Error ? e.message : 'Failed to load mock tests.'));
    }, []);

    if (error) {
        return <Card><div role="alert" className="text-red-500">{error}</div></Card>;
    }
    if (!items) {
        return <Card><Loader text="Loading mock tests…" /></Card>;
    }

    return (
        <Card>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-2xl font-bold">Mock Tests</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Full-length IELTS simulations with readiness scoring.</p>
                </div>
            </div>

            {items.length === 0 ? (
                <EmptyState
                    title="No mock tests yet"
                    body="A mock test runs all four skills back-to-back and gives you a single readiness score."
                    primaryAction={{
                        label: 'Start with Reading',
                        onClick: () => setActiveTab(IELTSSection.Reading),
                    }}
                    secondaryAction={{
                        label: 'Open dashboard',
                        onClick: () => setActiveTab(IELTSSection.Dashboard),
                    }}
                />
            ) : (
                <ul className="space-y-3">
                    {items.map(t => (
                        <li
                            key={t.id}
                            className="flex items-center justify-between gap-4 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40"
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-semibold">
                                    {new Date(t.created_at).toLocaleDateString()} — {Math.round(t.duration_seconds / 60)} min
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Readiness: {Math.round(t.readiness_score * 100)}%
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <div className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 px-2 py-1 rounded-full inline-block">
                                    Band {t.overall_band.toFixed(1)}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
};

export default MockTestsPage;
