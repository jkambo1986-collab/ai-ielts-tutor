/**
 * @file Cross-skill "next step" bridge (D4).
 *
 * Renders 1-2 next-step CTAs at the end of any session screen. Suggestions
 * are derived locally from session topic + the global appContext's
 * targetedPractice mechanism (existing).
 */

import React from 'react';
import { useAppContext } from '../../App';
import { IELTSSection } from '../../types';

interface Props {
    fromSection: IELTSSection;
    topic: string;
    weakest?: 'Lexical' | 'Coherence' | 'Grammar' | 'Pronunciation' | 'Task' | null;
}

const NextStepBridge: React.FC<Props> = ({ fromSection, topic, weakest }) => {
    const { setActiveTab, setTargetedPractice } = useAppContext();

    const suggestions: { label: string; cta: string; action: () => void }[] = [];

    // 1) topic-based bridge into a complementary skill
    if (fromSection === IELTSSection.Reading || fromSection === IELTSSection.Listening) {
        suggestions.push({
            label: `Speak about "${trim(topic)}"`,
            cta: 'Open Speaking',
            action: () => {
                setTargetedPractice({
                    destination: IELTSSection.Speaking,
                    payload: { part: 'Part 3', text: `What are your views on ${topic.toLowerCase()}?` },
                });
                setActiveTab(IELTSSection.Speaking);
            },
        });
        suggestions.push({
            label: `Write a Task 2 essay on "${trim(topic)}"`,
            cta: 'Open Writing',
            action: () => setActiveTab(IELTSSection.Writing),
        });
    } else if (fromSection === IELTSSection.Writing) {
        suggestions.push({
            label: `Discuss "${trim(topic)}" out loud (Part 3)`,
            cta: 'Open Speaking',
            action: () => {
                setTargetedPractice({
                    destination: IELTSSection.Speaking,
                    payload: { part: 'Part 3', text: `Tell me your views on ${topic.toLowerCase()}.` },
                });
                setActiveTab(IELTSSection.Speaking);
            },
        });
    } else if (fromSection === IELTSSection.Speaking) {
        suggestions.push({
            label: `Write 150 words on "${trim(topic)}" while it's fresh`,
            cta: 'Open Writing',
            action: () => {
                setTargetedPractice({
                    destination: IELTSSection.Writing,
                    payload: { text: topic },
                });
                setActiveTab(IELTSSection.Writing);
            },
        });
        suggestions.push({
            label: `Read a related passage`,
            cta: 'Open Reading',
            action: () => setActiveTab(IELTSSection.Reading),
        });
        suggestions.push({
            label: `Lock in vocab via SRS review`,
            cta: 'Open SRS',
            action: () => setActiveTab(IELTSSection.Dashboard),
        });
    } else if (fromSection === IELTSSection.Quiz) {
        suggestions.push({
            label: `Review wrong answers as flashcards`,
            cta: 'Open SRS',
            action: () => setActiveTab(IELTSSection.Dashboard),
        });
        suggestions.push({
            label: `Apply this vocab in a 90-second speaking turn`,
            cta: 'Open Speaking',
            action: () => setActiveTab(IELTSSection.Speaking),
        });
        suggestions.push({
            label: `Read a passage to see these words in context`,
            cta: 'Open Reading',
            action: () => setActiveTab(IELTSSection.Reading),
        });
    }

    // 2) weakness-based bridge
    if (weakest === 'Lexical') {
        suggestions.push({
            label: 'Vocab quiz to widen lexical resource',
            cta: 'Open Quiz',
            action: () => setActiveTab(IELTSSection.Quiz),
        });
    }
    if (weakest === 'Pronunciation') {
        suggestions.push({
            label: 'Pronunciation drills tailored to your last error',
            cta: 'Open Speaking',
            action: () => setActiveTab(IELTSSection.Speaking),
        });
    }

    if (suggestions.length === 0) return null;

    return (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mt-4">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">What to do next</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Suggestions based on this session.</p>
            <ul className="space-y-2">
                {suggestions.slice(0, 3).map((s, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 rounded border border-slate-200 dark:border-slate-800 px-3 py-2">
                        <span className="text-sm text-slate-700 dark:text-slate-200 line-clamp-2 flex-1">{s.label}</span>
                        <button
                            onClick={s.action}
                            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0"
                        >
                            {s.cta} →
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
};

const trim = (s: string, n = 50) => (s.length > n ? `${s.slice(0, n)}…` : s);

export default NextStepBridge;
