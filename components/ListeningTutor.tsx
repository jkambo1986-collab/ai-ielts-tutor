/**
 * @file The component for the Listening practice section.
 * It generates an AI-powered listening test, plays it using text-to-speech,
 * and allows users to answer questions and review an interactive transcript.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Card from './Card';
import Button from './Button';
import Loader from './Loader';
import { generateListeningTest, evaluateListeningAnswer, submitListeningSession } from '../services/geminiService';
import ConfidenceModal from './dashboard/ConfidenceModal';
import { calculateListeningSkill } from '../services/adaptiveLearningService';
import { ListeningTest, ListeningQuestion, ListeningSessionSummary, AnswerEvaluation, ListeningTestType } from '../types';
import { useAppContext } from '../App';
import { ReadingIcon, SpeakingIcon, UserIcon } from './Icons';
import WarmupBanner from './ui/WarmupBanner';

type PlaybackState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'ENDED';

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

interface ListeningTutorProps {}

/**
 * The main component for the Listening Tutor.
 */
const ListeningTutor: React.FC<ListeningTutorProps> = () => {
  const { currentUser: userProfile, listeningHistory, addListeningSession } = useAppContext();
  // Component State
  const [test, setTest] = useState<ListeningTest | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [evaluations, setEvaluations] = useState<Record<number, AnswerEvaluation | null>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [predictionModalOpen, setPredictionModalOpen] = useState(false);
  const [pendingPrediction, setPendingPrediction] = useState<number | null>(null);
  const [testStartedAt, setTestStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('IDLE');
  const [currentlySpeakingIndex, setCurrentlySpeakingIndex] = useState<number | null>(null);
  const [isExamMode, setIsExamMode] = useState<boolean>(false);
  const [wasPlaybackCompleted, setWasPlaybackCompleted] = useState<boolean>(false); // For Exam Mode: tracks if the single playthrough happened.

  // Refs for managing speech synthesis
  // NOTE: We do not store Utterance objects in ref anymore to avoid GC issues.
  // We only track the index.
  const currentlyPlayingIndexRef = useRef<number | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);

  /**
   * Cleans up any ongoing speech synthesis.
   */
  const cleanupSpeech = useCallback(() => {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    currentlyPlayingIndexRef.current = null;
  }, []);
  
  /**
   * Creates and plays utterances sequentially using Just-In-Time creation.
   * This prevents garbage collection issues common with pre-created SpeechSynthesisUtterance objects.
   */
  const playSequence = useCallback((startIndex: number) => {
    if (!test?.script) return;
    
    // Ensure we start from a clean state
    window.speechSynthesis.cancel();

    const playNext = (index: number) => {
        // Stop condition
        if (index >= test.script.length) {
            setPlaybackState('ENDED');
            setCurrentlySpeakingIndex(null);
            setWasPlaybackCompleted(true);
            currentlyPlayingIndexRef.current = null;
            return;
        }

        currentlyPlayingIndexRef.current = index;
        const part = test.script[index];
        
        // Create utterance Just-In-Time
        const utterance = new SpeechSynthesisUtterance(`${part.speaker}. ${part.text}`);
        
        // Try to set a consistent voice if available
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || voices.find(v => v.lang.startsWith('en'));
        if (preferredVoice) utterance.voice = preferredVoice;

        // Events
        utterance.onstart = () => {
            setCurrentlySpeakingIndex(index);
            setPlaybackState('PLAYING');
        };
        
        utterance.onend = () => {
            // Small delay to ensure smoother transition and event firing
            setTimeout(() => playNext(index + 1), 100);
        };

        utterance.onerror = (e) => {
            console.warn("TTS Playback error or interruption:", e);
            // If interrupted (e.g. by pause), don't automatically continue.
            // If actual error, maybe try next? For now, we stop.
            if (e.error !== 'interrupted' && e.error !== 'canceled') {
                 // Try to recover by skipping
                 playNext(index + 1);
            }
        };
        
        window.speechSynthesis.speak(utterance);
    };
    
    // Small timeout to ensure cancel() has processed
    setTimeout(() => playNext(startIndex), 50);
  }, [test]);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
    }
  }, []);
  
  const getDifficultyScore = useCallback((): number => {
    if (!userProfile || !userProfile.isAdaptiveLearningEnabled) {
        return userProfile?.targetScore || 7.0;
    }
    const adaptiveScore = calculateListeningSkill(listeningHistory);
    return adaptiveScore ?? userProfile.targetScore;
  }, [userProfile, listeningHistory]);

  const fetchTest = useCallback(async (testType: ListeningTestType) => {
    clearInactivityTimer();
    cleanupSpeech();
    setIsLoading(true);
    setError(null);
    setTest(null);
    setUserAnswers({});
    setEvaluations({});
    setIsSubmitted(false);
    setPlaybackState('IDLE');
    setCurrentlySpeakingIndex(null);
    setIsExamMode(false);
    setWasPlaybackCompleted(false);

    try {
      const difficultyScore = getDifficultyScore();
      const newTest = await generateListeningTest(difficultyScore, testType);

      if (!newTest || !newTest.title || !Array.isArray(newTest.script) || newTest.script.length === 0 || !Array.isArray(newTest.questions) || newTest.questions.length === 0) {
          throw new Error("The AI returned an incomplete or invalid test structure. Please try generating a new test.");
      }
      
      setTest(newTest);
      setTestStartedAt(Date.now());
      setPendingPrediction(null);

      // Pre-load voices to avoid delay on first play
      if (window.speechSynthesis) {
          window.speechSynthesis.getVoices();
      }

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to generate a new listening test. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [clearInactivityTimer, getDifficultyScore, cleanupSpeech]);

  const handleSessionTimeout = useCallback(() => {
    setError("Your session has timed out due to inactivity. Please select a new test.");
    cleanupSpeech();
    clearInactivityTimer();
    setTest(null);
  }, [cleanupSpeech, clearInactivityTimer]);

  const startInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    inactivityTimerRef.current = window.setTimeout(handleSessionTimeout, INACTIVITY_TIMEOUT);
  }, [clearInactivityTimer, handleSessionTimeout]);


  useEffect(() => {
      if (playbackState === 'ENDED' && !isSubmitted) {
          startInactivityTimer();
      } else if (playbackState !== 'ENDED' || isSubmitted) {
          clearInactivityTimer();
      }
  }, [playbackState, isSubmitted, startInactivityTimer, clearInactivityTimer]);

  useEffect(() => {
    return () => {
        cleanupSpeech();
        clearInactivityTimer();
    };
  }, [cleanupSpeech, clearInactivityTimer]);

  const handlePlayPause = () => {
    if (!window.speechSynthesis) {
        setError("Your browser does not support text-to-speech.");
        return;
    }

    if (playbackState === 'PLAYING') {
      window.speechSynthesis.pause();
      setPlaybackState('PAUSED');
    } else if (playbackState === 'PAUSED') {
      window.speechSynthesis.resume();
      setPlaybackState('PLAYING');
    } else {
      // Start from beginning
      playSequence(0);
    }
  };

  const speakTranscriptPart = (index: number) => {
    if (!window.speechSynthesis) return;
    playSequence(index);
  };
  
  const handleAnswerChange = (questionIndex: number, answer: string) => {
    startInactivityTimer();
    setUserAnswers(prev => ({ ...prev, [questionIndex]: answer }));
  };

  const handleSubmit = async (predicted: number | null = pendingPrediction) => {
    if (!test) return;

    clearInactivityTimer();
    setIsEvaluating(true);
    setEvaluations({}); 
    cleanupSpeech();
    setPlaybackState('ENDED');

    const answeredQuestions = Object.entries(userAnswers);
    
    try {
        const evaluationPromises = answeredQuestions.map(([indexStr, userAnswer]) => {
            const index = parseInt(indexStr, 10);
            const question = test.questions[index];
            return evaluateListeningAnswer(
                test.script,
                question.question,
                question.options,
                String(userAnswer),
                question.correctAnswer
            ).then(evaluation => ({ index, evaluation }));
        });

        const results = await Promise.all(evaluationPromises);
        
        const newEvals: Record<number, AnswerEvaluation | null> = {};
        for (const { index, evaluation } of results) {
            if (evaluation === null || typeof evaluation.isCorrect !== 'boolean') {
                throw new Error(`The AI returned an invalid evaluation. Please try submitting again.`);
            }
            newEvals[index] = evaluation;
        }

        setEvaluations(newEvals);

        let score = 0;
        for (let i = 0; i < test.questions.length; i++) {
            if (userAnswers[i] === test.questions[i].correctAnswer) {
                score++;
            }
        }
        
        let backendId: string | null = null;
        try {
            const durationSeconds = testStartedAt ? Math.round((Date.now() - testStartedAt) / 1000) : 0;
            const r = await submitListeningSession(
                score,
                test.questions.length,
                test.title,
                { durationSeconds, predictedBand: predicted },
            );
            backendId = r.session_id;
        } catch (e) {
            console.warn("Failed to persist listening session to backend:", e);
        }

        const newSummary: ListeningSessionSummary = {
            id: backendId ?? new Date().toISOString(),
            date: new Date().toISOString(),
            score,
            totalQuestions: test.questions.length,
            title: test.title,
        };
        addListeningSession(newSummary);

    } catch (err) {
        console.error("Error during answer evaluation:", err);
        setError(err instanceof Error ? err.message : "An error occurred while checking answers.");
    } finally {
        setIsSubmitted(true);
        setIsEvaluating(false);
        setIsExamMode(false);
    }
  };
  
  const handleStartNewTest = () => {
    cleanupSpeech();
    clearInactivityTimer();
    setIsLoading(false);
    setError(null);
    setTest(null);
    setUserAnswers({});
    setEvaluations({});
    setIsSubmitted(false);
    setPlaybackState('IDLE');
    setCurrentlySpeakingIndex(null);
    currentlyPlayingIndexRef.current = null;
    setIsExamMode(false);
    setWasPlaybackCompleted(false);
  }

  const getPlayButtonText = () => {
    if (playbackState === 'PLAYING') return 'Pause';
    if (playbackState === 'PAUSED') return 'Resume';
    if (isExamMode && wasPlaybackCompleted) return 'Playback Finished';
    if (playbackState === 'ENDED') return 'Play Again';
    return 'Play Audio';
  };

  if (isLoading) {
    return <Card><Loader text="Generating listening test..." /></Card>;
  }

  if (error) {
    return <Card><div role="alert" className="text-red-500 text-center p-4">{error} <Button onClick={handleStartNewTest} className="mt-4">Start New Test</Button></div></Card>;
  }
  
  if (!test) {
    return (
      <>
        <WarmupBanner sessionType="listening" />
        <Card>
            <div className="text-center">
                <h2 className="text-2xl font-bold mb-4">Listening Practice</h2>
                <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-8">
                    Manually trigger a practice session. Choose a test type to begin.
                </p>
                <div className="flex flex-col sm:flex-row justify-center items-stretch gap-6">
                    <div className="w-full sm:w-80 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                        <div className="flex justify-center items-center h-16 w-16 bg-blue-100 dark:bg-blue-900/50 rounded-full mx-auto mb-4">
                            <SpeakingIcon className="h-8 w-8 text-blue-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold mb-2">Dialogue Practice</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 h-20">
                                Practice with a conversation between two speakers on an everyday topic, similar to IELTS Part 1 or 3.
                            </p>
                        </div>
                        <Button onClick={() => fetchTest('Dialogue')}>Start Dialogue</Button>
                    </div>
                    <div className="w-full sm:w-80 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                        <div className="flex justify-center items-center h-16 w-16 bg-green-100 dark:bg-green-900/50 rounded-full mx-auto mb-4">
                            <UserIcon className="h-8 w-8 text-green-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold mb-2">Monologue Practice</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 h-20">
                                Listen to a single speaker talk about a topic, such as a guided tour, similar to IELTS Part 2.
                            </p>
                        </div>
                        <Button onClick={() => fetchTest('Monologue')}>Start Monologue</Button>
                    </div>
                    <div className="w-full sm:w-80 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                        <div className="flex justify-center items-center h-16 w-16 bg-violet-100 dark:bg-violet-900/50 rounded-full mx-auto mb-4">
                            <ReadingIcon className="h-8 w-8 text-violet-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold mb-2">Academic Lecture</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 h-20">
                                Challenge yourself with a short lecture on an academic subject, similar to IELTS Part 4.
                            </p>
                        </div>
                        <Button onClick={() => fetchTest('Lecture')}>Start Lecture</Button>
                    </div>
                </div>
            </div>
      </Card>
      </>
    );
  }

  return (
    <Card>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Listening Practice</h2>
        <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label htmlFor="exam-mode-toggle-listening" className="text-sm font-medium text-slate-600 dark:text-slate-400 cursor-pointer">Exam Mode</label>
              <button
                  role="switch"
                  aria-checked={isExamMode}
                  onClick={() => setIsExamMode(!isExamMode)}
                  disabled={isLoading || isSubmitted || playbackState !== 'IDLE'}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${isExamMode ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-700'}`}
                  id="exam-mode-toggle-listening"
              >
                  <span
                      aria-hidden="true"
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isExamMode ? 'translate-x-5' : 'translate-x-0'}`}
                  />
              </button>
            </div>
            <Button onClick={handleStartNewTest} variant="secondary" isLoading={isLoading} disabled={isExamMode}>Start New Test</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h3 className="text-xl font-semibold mb-2">{test?.title}</h3>
          <div className="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg">
             <div className="flex items-center space-x-4">
                <Button 
                    onClick={handlePlayPause} 
                    disabled={!test || isSubmitted || (isExamMode && wasPlaybackCompleted)}
                >
                    {getPlayButtonText()}
                </Button>
                <div aria-live="polite" className="text-sm font-medium text-slate-600 dark:text-slate-400 capitalize">
                    Status: {playbackState}
                </div>
             </div>
          </div>
          {isSubmitted && (
             <div className="mt-4">
                <h4 className="font-semibold mb-2">Interactive Transcript</h4>
                <div className="prose prose-slate dark:prose-invert max-w-none bg-slate-100 dark:bg-slate-800 p-4 rounded-lg h-[24rem] overflow-y-auto">
                    {test?.script.map((part, index) => (
                        <p 
                            key={index} 
                            onClick={() => speakTranscriptPart(index)}
                            className={`cursor-pointer p-1 rounded transition-colors ${currentlySpeakingIndex === index ? 'bg-blue-200 dark:bg-blue-900/50' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                        >
                           <strong className="mr-2">{part.speaker}:</strong>{part.text}
                        </p>
                    ))}
                </div>
            </div>
          )}
        </div>
        
        <div>
          <h3 className="text-xl font-semibold mb-4">Questions</h3>
          <div className="space-y-6">
             {test?.questions.map((q, index) => (
                <QuestionBlock
                    key={index}
                    question={q}
                    questionIndex={index}
                    userAnswer={userAnswers[index]}
                    isSubmitted={isSubmitted}
                    onAnswerChange={handleAnswerChange}
                    isDisabled={playbackState === 'PLAYING' || playbackState === 'PAUSED'}
                    evaluation={evaluations[index]}
                />
             ))}
          </div>
          {!isSubmitted && (
            <div className="mt-8">
                <Button 
                    onClick={() => setPredictionModalOpen(true)}
                    isLoading={isEvaluating}
                    disabled={Object.keys(userAnswers).length === 0}
                >
                    Check Answers
                </Button>
            </div>
          )}
        </div>
      </div>
      <ConfidenceModal
        open={predictionModalOpen}
        title="What band do you expect on this listening set?"
        onConfirm={(b) => { setPredictionModalOpen(false); setPendingPrediction(b); handleSubmit(b); }}
        onSkip={() => { setPredictionModalOpen(false); setPendingPrediction(null); handleSubmit(null); }}
      />
    </Card>
  );
};

// -- SUB-COMPONENTS -- //

interface QuestionBlockProps {
    question: ListeningQuestion;
    questionIndex: number;
    userAnswer: string;
    isSubmitted: boolean;
    isDisabled: boolean;
    onAnswerChange: (index: number, answer: string) => void;
    evaluation: AnswerEvaluation | null;
}

const QuestionBlock: React.FC<QuestionBlockProps> = React.memo(({ question, questionIndex, userAnswer, isSubmitted, isDisabled, onAnswerChange, evaluation }) => {
    return (
        <fieldset>
            <legend className="font-semibold mb-2">{questionIndex + 1}. {question.question}</legend>
            <div className="space-y-2">
                {question.options.map((option, optIndex) => {
                    const optionValue = option.substring(0, 1);
                    const isChecked = userAnswer === optionValue;
                    const isCorrect = question.correctAnswer === optionValue;
                    
                    let submissionClasses = '';
                    if (isSubmitted) {
                        if (isCorrect) {
                            submissionClasses = 'bg-green-100 dark:bg-green-900/50 border-green-500';
                        } else if (isChecked && !isCorrect) {
                            submissionClasses = 'bg-red-100 dark:bg-red-900/50 border-red-500';
                        }
                    }

                    return (
                        <label key={optIndex} className={`flex items-center p-3 rounded-lg border-2 transition-colors ${isChecked && !isSubmitted ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-500' : 'border-transparent'} ${submissionClasses} ${isDisabled || isSubmitted ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                            <input 
                                type="radio" 
                                name={`question-${questionIndex}`} 
                                value={optionValue}
                                checked={isChecked}
                                onChange={(e) => onAnswerChange(questionIndex, e.target.value)}
                                disabled={isDisabled || isSubmitted}
                                className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                            />
                            <span className="ml-3 text-slate-800 dark:text-slate-300">{option}</span>
                        </label>
                    );
                })}
            </div>
             {isSubmitted && evaluation && (
                 <div role="status" className={`mt-2 p-3 rounded-lg text-sm ${evaluation.isCorrect ? 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-200' : 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200'}`}>
                    <p><strong>{evaluation.isCorrect ? "Correct!" : "Incorrect."}</strong></p>
                    <p className="mt-1 whitespace-pre-wrap">{evaluation.explanation}</p>
                </div>
            )}
        </fieldset>
    );
});


export default ListeningTutor;