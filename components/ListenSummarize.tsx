/**
 * @file This component handles the "Listen & Summarize" integrated skills task.
 * It manages AI-generated lecture playback and evaluates a user's written summary.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ListenSummarizeTask, SummaryEvaluation, FeedbackCriterion } from '../types';
import { generateIntegratedTask, evaluateSummary } from '../services/geminiService';
import { calculateListeningSkill } from '../services/adaptiveLearningService';
import Loader from './Loader';
import Button from './Button';
import { useAppContext } from '../App';

type PlaybackState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'ENDED';

interface ListenSummarizeProps {
    onBack: () => void;
}

/**
 * The main component for the "Listen & Summarize" task.
 * @param {ListenSummarizeProps} props - Component props, including a callback to return to the task selection screen.
 * @returns {React.FC} The rendered component.
 */
const ListenSummarize: React.FC<ListenSummarizeProps> = ({ onBack }) => {
    const { currentUser: userProfile, listeningHistory } = useAppContext();
    const [task, setTask] = useState<ListenSummarizeTask | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState('');
    const [evaluation, setEvaluation] = useState<SummaryEvaluation | null>(null);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [playbackState, setPlaybackState] = useState<PlaybackState>('IDLE');
    
    // We no longer store utterances in ref to avoid GC issues
    const currentPartIndexRef = useRef<number>(0);
    
    const cleanupSpeech = useCallback(() => {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    }, []);

    const fetchTask = useCallback(async () => {
        if (!userProfile) return;
        setIsLoading(true);
        setError(null);
        setTask(null);
        setSummary('');
        setEvaluation(null);
        setPlaybackState('IDLE');
        cleanupSpeech();

        try {
            const adaptiveScore = userProfile.isAdaptiveLearningEnabled ? calculateListeningSkill(listeningHistory) : null;
            const difficulty = adaptiveScore ?? userProfile.targetScore;

            const newTask = await generateIntegratedTask('ListenSummarize', difficulty) as ListenSummarizeTask;
            
            if (!newTask || !newTask.topic || !Array.isArray(newTask.lectureScript) || newTask.lectureScript.length === 0) {
                throw new Error("The AI returned an incomplete task. Please try generating a new one.");
            }
            
            setTask(newTask);
            
            // Pre-load voices
            if (window.speechSynthesis) {
                window.speechSynthesis.getVoices();
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to generate a new task.");
        } finally {
            setIsLoading(false);
        }
    }, [cleanupSpeech, userProfile, listeningHistory]);

    useEffect(() => {
        fetchTask();
        return () => cleanupSpeech();
    }, [fetchTask, cleanupSpeech]);
    
    const playSequence = useCallback((startIndex: number) => {
        if (!task?.lectureScript) return;
        window.speechSynthesis.cancel();

        const playNext = (index: number) => {
            if (index >= task.lectureScript.length) {
                setPlaybackState('ENDED');
                return;
            }
            currentPartIndexRef.current = index;
            const part = task.lectureScript[index];
            const utterance = new SpeechSynthesisUtterance(part.text);
            
            // Set voice preference
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || voices.find(v => v.lang.startsWith('en'));
            if (preferredVoice) utterance.voice = preferredVoice;

            utterance.onstart = () => setPlaybackState('PLAYING');
            utterance.onend = () => setTimeout(() => playNext(index + 1), 50);
            utterance.onerror = () => {
                 // Try to recover
                 playNext(index + 1);
            };
            
            window.speechSynthesis.speak(utterance);
        };

        // Small delay to ensure cancel processes
        setTimeout(() => playNext(startIndex), 50);
    }, [task]);

    const handlePlayPause = () => {
        if (playbackState === 'PLAYING') {
            window.speechSynthesis.pause();
            setPlaybackState('PAUSED');
        } else if (playbackState === 'PAUSED') {
            window.speechSynthesis.resume();
            setPlaybackState('PLAYING');
        } else if (playbackState === 'IDLE' || playbackState === 'ENDED') {
            playSequence(0);
        }
    };
    
    const handleSubmit = async () => {
        if (!summary.trim() || !task) return;
        setIsEvaluating(true);
        setError(null);
        try {
            const fullScript = task.lectureScript.map(p => p.text).join('\n');
            const result = await evaluateSummary(fullScript, summary);

            if (!result || typeof result.bandScore !== 'number' || !result.feedback || !Array.isArray(result.suggestions)) {
                 throw new Error("The AI returned an incomplete evaluation. Please try submitting again.");
            }

            setEvaluation(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to evaluate summary.");
        } finally {
            setIsEvaluating(false);
        }
    };
    
    if (isLoading) return <div className="flex justify-center items-center h-96"><Loader text="Generating 'Listen & Summarize' task..." /></div>;
    
    return (
        <div>
            <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
                <Button onClick={onBack} variant="secondary">&larr; Back to Task Selection</Button>
                <Button onClick={fetchTask} variant="secondary">Generate New Task</Button>
            </div>
            
            <h2 className="text-xl font-bold mb-2">Listen & Summarize: {task?.topic}</h2>
            <div className="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg mb-4">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Listen to the lecture, then write a summary below.</p>
                <Button onClick={handlePlayPause} disabled={!task?.lectureScript}>
                    {playbackState === 'PLAYING' ? 'Pause' : playbackState === 'PAUSED' ? 'Resume' : playbackState === 'ENDED' ? 'Play Again' : 'Play Lecture'}
                </Button>
            </div>

            <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Write your summary here after listening to the lecture..."
                className="w-full h-48 p-4 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                disabled={isEvaluating || !!evaluation}
                aria-label="Summary input area"
            />
            <Button onClick={handleSubmit} isLoading={isEvaluating} disabled={!summary.trim() || !!evaluation} className="mt-4">
                Evaluate Summary
            </Button>

            {error && <div role="alert" className="mt-4 text-red-500">{error}</div>}

            {isEvaluating && <div className="mt-4"><Loader text="Evaluating your summary..." /></div>}

            {evaluation && (
                <div className="mt-6 space-y-6">
                     <div className="text-center bg-blue-100 dark:bg-blue-900/50 p-4 rounded-lg">
                        <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">ESTIMATED BAND SCORE</p>
                        <p className="text-5xl font-bold text-blue-600 dark:text-blue-400">{evaluation.bandScore.toFixed(1)}</p>
                    </div>
                    {Object.entries(evaluation.feedback).map(([key, criterion]) => (
                        <FeedbackSection key={key} title={key} criterion={criterion as FeedbackCriterion} />
                    ))}
                     <div>
                        <h3 className="text-lg font-semibold mb-2">Suggestions for Improvement</h3>
                        <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300">
                            {evaluation.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
};

const FeedbackSection: React.FC<{title: string; criterion: FeedbackCriterion}> = React.memo(({title, criterion}) => (
    <div>
        <h3 className="text-lg font-semibold capitalize mb-2">{title}</h3>
        <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{criterion.text}</p>
        {criterion.relevantSentences && criterion.relevantSentences.length > 0 && (
            <div className="mt-3 bg-slate-200/50 dark:bg-slate-800/50 border-l-4 border-slate-400 dark:border-slate-600 p-3 rounded-r-lg">
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">From your summary:</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                    {criterion.relevantSentences.map((sentence, index) => (
                        <li key={index} className="italic text-slate-500 dark:text-slate-400">"{sentence}"</li>
                    ))}
                </ul>
            </div>
        )}
    </div>
));


export default ListenSummarize;