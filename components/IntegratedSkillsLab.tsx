/**
 * @file This component serves as the main hub for the Integrated Skills Lab,
 * allowing users to choose between different multi-skill practice tasks.
 */
import React, { useState, lazy, Suspense } from 'react';
import Card from './Card';
import Button from './Button';
import Loader from './Loader';
import { ListeningIcon, ReadingIcon, SynthesisIcon } from './Icons';
import { SubscriptionPlan } from '../types';
import { useAppContext } from '../App';

// Lazily load the individual task components to keep the initial load light.
const ListenSummarize = lazy(() => import('./ListenSummarize'));
const ReadSpeak = lazy(() => import('./ReadSpeak'));
const ReadListenWrite = lazy(() => import('./ReadListenWrite'));


type ActiveTask = 'ListenSummarize' | 'ReadSpeak' | 'ReadListenWrite' | null;

interface IntegratedSkillsLabProps {}

/**
 * The main component for the Integrated Skills Lab section.
 * @returns {React.FC} The rendered component.
 */
const IntegratedSkillsLab: React.FC<IntegratedSkillsLabProps> = () => {
    const { currentUser: userProfile } = useAppContext();
    const [activeTask, setActiveTask] = useState<ActiveTask>(null);

    if (!userProfile) return null;

    const isProUser = userProfile.plan === SubscriptionPlan.Pro;

    if (!isProUser) {
        return (
            <Card>
                <div className="text-center p-8">
                    <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/50 rounded-full mx-auto flex items-center justify-center mb-4">
                        <span className="text-3xl" role="img" aria-label="Sparkles">✨</span>
                    </div>
                    <h2 className="text-2xl font-bold mb-4">Integrated Skills Lab — Pro Feature</h2>
                    <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto mb-2">
                        The Integrated Skills Lab is a Pro feature designed to challenge you with multi-skill tasks, just like the real IELTS exam.
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
                        Pro features on this platform are enabled by your institute. Contact your institute administrator to request access.
                    </p>
                </div>
            </Card>
        );
    }

    /**
     * Renders the appropriate content based on whether a task has been selected.
     */
    const renderContent = () => {
        // If no task is selected, show the selection menu.
        if (!activeTask) {
            return (
                <div className="text-center">
                    <h2 className="text-2xl font-bold mb-4">Integrated Skills Lab</h2>
                    <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-8">
                        These tasks mirror real-world academic challenges by combining multiple skills. Choose a task to begin.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center items-stretch gap-6">
                        {/* Listen & Summarize Card */}
                        <div className="w-full sm:w-80 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                             <div className="flex justify-center items-center h-16 w-16 bg-blue-100 dark:bg-blue-900/50 rounded-full mx-auto mb-4">
                                <ListeningIcon className="h-8 w-8 text-blue-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold mb-2">Listen & Summarize</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 h-20">
                                    Listen to a short academic lecture, then write a concise summary. Tests comprehension and writing skills.
                                </p>
                            </div>
                            <Button onClick={() => setActiveTask('ListenSummarize')}>Start Task</Button>
                        </div>

                        {/* Read, Listen & Write Card */}
                        <div className="w-full sm:w-80 p-6 bg-white dark:bg-slate-800 rounded-lg border-2 border-blue-500 shadow-lg flex flex-col justify-between">
                             <div className="flex justify-center items-center h-16 w-16 bg-violet-100 dark:bg-violet-900/50 rounded-full mx-auto mb-4">
                                <SynthesisIcon className="h-8 w-8 text-violet-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold mb-2">Read, Listen & Write</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 h-20">
                                    Read a passage, listen to a related lecture, and write a response that synthesizes information from both.
                                </p>
                            </div>
                            <Button onClick={() => setActiveTask('ReadListenWrite')} variant="primary">Start Synthesis Task</Button>
                        </div>

                        {/* Read & Speak Card */}
                         <div className="w-full sm:w-80 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                            <div className="flex justify-center items-center h-16 w-16 bg-green-100 dark:bg-green-900/50 rounded-full mx-auto mb-4">
                                <ReadingIcon className="h-8 w-8 text-green-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold mb-2">Read & Speak</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 h-20">
                                    Read an academic passage, then discuss the key ideas and answer questions in a live conversation with an AI.
                                </p>
                            </div>
                            <Button onClick={() => setActiveTask('ReadSpeak')}>Start Task</Button>
                        </div>
                    </div>
                </div>
            );
        }

        const handleBack = () => setActiveTask(null);

        // If a task is selected, render the corresponding component.
        switch (activeTask) {
            case 'ListenSummarize':
                return <ListenSummarize onBack={handleBack} />;
            case 'ReadSpeak':
                return <ReadSpeak onBack={handleBack} />;
            case 'ReadListenWrite':
                return <ReadListenWrite onBack={handleBack} />;
            default:
                return null;
        }
    };

    return (
        <Card>
            <Suspense fallback={<div className="flex justify-center items-center h-96"><Loader text="Loading task..." /></div>}>
                {renderContent()}
            </Suspense>
        </Card>
    );
};

export default IntegratedSkillsLab;