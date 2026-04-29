/**
 * @file This component handles the "Read, Listen & Write" integrated skills synthesis task.
 * It guides the user through reading a passage, listening to a lecture, and writing a response
 * that synthesizes information from both sources.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ReadListenWriteTask, SynthesisEvaluation, FeedbackCriterion } from '../types';
import { generateIntegratedTask, evaluateSynthesis } from '../services/geminiService';
import { calculateWritingSkill } from '../services/adaptiveLearningService';
import Loader from './Loader';
import Button from './Button';
import CollapsibleSection from './CollapsibleSection';
import { useAppContext } from '../App';

type PlaybackState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'ENDED';
type TaskStep = 'reading' | 'listening' | 'writing' | 'feedback';

interface ReadListenWriteProps {
    onBack: () => void;
}

const ReadListenWrite: React.FC<ReadListenWriteProps> = ({ onBack }) => {
    const { currentUser: userProfile, writingHistory } = useAppContext();
    // State management
    const [task, setTask] = useState<ReadListenWriteTask | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentStep, setCurrentStep] = useState<TaskStep>('reading');
    const [playbackState, setPlaybackState] = useState<PlaybackState>('IDLE');
    const [writtenResponse, setWrittenResponse] = useState('');
    const [evaluation, setEvaluation] = useState<SynthesisEvaluation | null>(null);
    const [isEvaluating, setIsEvaluating] = useState(false);

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
        setWrittenResponse('');
        setEvaluation(null);
        setCurrentStep('reading');
        setPlaybackState('IDLE');
        cleanupSpeech();

        try {
            const adaptiveScore = userProfile.isAdaptiveLearningEnabled ? calculateWritingSkill(writingHistory) : null;
            const difficulty = adaptiveScore ?? userProfile.targetScore;

            const newTask = await generateIntegratedTask('ReadListenWrite', difficulty) as ReadListenWriteTask;
            setTask(newTask);
            
            if (window.speechSynthesis) {
                window.speechSynthesis.getVoices();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to generate a new task.");
        } finally {
            setIsLoading(false);
        }
    }, [cleanupSpeech, userProfile, writingHistory]);

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
            utterance.onerror = () => playNext(index + 1);
            
            window.speechSynthesis.speak(utterance);
        };
        
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
        if (!writtenResponse.trim() || !task) return;
        setIsEvaluating(true);
        setError(null);
        try {
            const lectureScript = task.lectureScript.map(p => `${p.speaker}: ${p.text}`).join('\n');
            const result = await evaluateSynthesis(task.passage, lectureScript, writtenResponse);
            setEvaluation(result);
            setCurrentStep('feedback');
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to evaluate your response.");
        } finally {
            setIsEvaluating(false);
        }
    };
    
    const renderStepContent = () => {
        if (!task) return null;

        const readingContent = (
             <CollapsibleSection title="Reading Passage" defaultOpen>
                <div className="prose prose-slate dark:prose-invert max-w-none">
                    <h3 className="font-bold">{task.passageTitle}</h3>
                    <p className="whitespace-pre-wrap">{task.passage}</p>
                </div>
            </CollapsibleSection>
        );

        const listeningContent = (
            <CollapsibleSection title="Lecture" defaultOpen={currentStep === 'listening'}>
                 <div className="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Listen to the lecture. You can only play it once in a real exam, but you can replay it here for practice.</p>
                    <Button onClick={handlePlayPause} disabled={!task.lectureScript}>
                        {playbackState === 'PLAYING' ? 'Pause' : playbackState === 'PAUSED' ? 'Resume' : 'Play Lecture'}
                    </Button>
                </div>
            </CollapsibleSection>
        );

        const transcriptContent = (
            <CollapsibleSection title="Lecture Transcript">
                <div className="prose prose-slate dark:prose-invert max-w-none max-h-48 overflow-y-auto">
                    {task.lectureScript.map((part, index) => (
                        <p key={index}><strong>{part.speaker}:</strong> {part.text}</p>
                    ))}
                </div>
            </CollapsibleSection>
        );

        const writingContent = (
             <CollapsibleSection title="Your Response" defaultOpen>
                <p className="font-semibold mb-2">{task.writingPrompt}</p>
                <textarea
                    value={writtenResponse}
                    onChange={(e) => setWrittenResponse(e.target.value)}
                    placeholder="Write your response here, synthesizing information from both the reading and the lecture..."
                    className="w-full h-60 p-4 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                    disabled={isEvaluating}
                    aria-label="Synthesis response area"
                />
            </CollapsibleSection>
        );
        
        switch (currentStep) {
            case 'reading':
                return (
                    <div className="space-y-4">
                        {readingContent}
                        <div className="text-center">
                            <Button onClick={() => setCurrentStep('listening')}>Continue to Listening</Button>
                        </div>
                    </div>
                );
            case 'listening':
                 return (
                    <div className="space-y-4">
                        {readingContent}
                        {listeningContent}
                        <div className="text-center">
                            <Button onClick={() => setCurrentStep('writing')} disabled={playbackState !== 'ENDED'}>
                                {playbackState !== 'ENDED' ? 'Listen to the full lecture to continue' : 'Continue to Writing Task'}
                            </Button>
                        </div>
                    </div>
                );
            case 'writing':
                 return (
                     <div className="space-y-4">
                        {readingContent}
                        {transcriptContent}
                        {writingContent}
                        <div className="text-center">
                            <Button onClick={handleSubmit} isLoading={isEvaluating} disabled={!writtenResponse.trim()}>
                                Submit for Evaluation
                            </Button>
                        </div>
                    </div>
                );
            case 'feedback':
                 return (
                    <div className="space-y-6">
                        <div className="text-center bg-blue-100 dark:bg-blue-900/50 p-4 rounded-lg">
                            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">ESTIMATED BAND SCORE</p>
                            <p className="text-5xl font-bold text-blue-600 dark:text-blue-400">{evaluation?.bandScore.toFixed(1)}</p>
                        </div>
                        {evaluation && Object.entries(evaluation.feedback).map(([key, criterion]) => (
                            <FeedbackDisplay key={key} title={key} criterion={criterion as FeedbackCriterion} />
                        ))}
                        {evaluation?.suggestions && (
                             <div>
                                <h3 className="text-lg font-semibold mb-2">Suggestions for Improvement</h3>
                                <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300">
                                    {evaluation.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                                </ul>
                            </div>
                        )}
                         <div className="text-center border-t border-slate-200 dark:border-slate-700 pt-6">
                            <Button onClick={fetchTask} variant="primary">Start a New Synthesis Task</Button>
                        </div>
                    </div>
                 );
        }
    };
    
    if (isLoading) return <div className="flex justify-center items-center h-96"><Loader text="Generating Synthesis Task..." /></div>;

    return (
         <div>
            <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
                <Button onClick={onBack} variant="secondary">&larr; Back to Task Selection</Button>
                <div className="text-right">
                    <h2 className="text-xl font-bold">Read, Listen & Write</h2>
                    <p className="text-sm text-slate-500">{task?.topic}</p>
                </div>
            </div>
            {error && <div role="alert" className="mb-4 text-red-500 text-center p-4 bg-red-50 dark:bg-red-900/30 rounded-lg">{error}</div>}
            {renderStepContent()}
         </div>
    );
};

const FeedbackDisplay: React.FC<{title: string; criterion: FeedbackCriterion}> = React.memo(({title, criterion}) => (
    <div>
        <h3 className="text-lg font-semibold capitalize mb-2">{title.replace(/([A-Z])/g, ' $1')}</h3>
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg">
            <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{criterion.text}</p>
            {criterion.relevantSentences && criterion.relevantSentences.length > 0 && (
                <div className="mt-3 border-l-4 border-slate-400 dark:border-slate-600 pl-3">
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">From your response:</p>
                    <ul className="list-disc list-inside space-y-1 mt-1">
                        {criterion.relevantSentences.map((sentence, index) => (
                            <li key={index} className="italic text-slate-500 dark:text-slate-400">"{sentence}"</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    </div>
));

export default ReadListenWrite;