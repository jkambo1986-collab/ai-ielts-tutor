/**
 * @file The component for the Quiz practice section.
 * It generates an AI-powered quiz with selectable difficulty levels.
 */

import React, { useState, useCallback, useEffect } from 'react';
import Card from './Card';
import Button from './Button';
import Loader from './Loader';
import { generateQuiz, rephraseExplanation } from '../services/geminiService';
import { calculateOverallSkill, bandToDifficulty } from '../services/adaptiveLearningService';
import { Quiz, QuizDifficulty, QuizQuestion, IELTSSection } from '../types';
import { useAppContext } from '../App';
import { dashboardService } from '../services/dashboardService';
import { useToast } from './ui/Toast';
import NextStepBridge from './ui/NextStepBridge';
import ConnectionLost from './ui/ConnectionLost';

interface QuizTutorProps {}

/**
 * The main component for the Quiz Tutor.
 */
const QuizTutor: React.FC<QuizTutorProps> = () => {
    const { currentUser: userProfile, writingHistory, readingHistory, listeningHistory, speakingHistory } = useAppContext();
    const { toast } = useToast();
    // Component State
    const [difficulty, setDifficulty] = useState<QuizDifficulty | null>(null);
    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
    const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isAdaptiveMode, setIsAdaptiveMode] = useState<boolean>(false);

    /**
     * Checks for adaptive learning setting and triggers quiz generation if enabled.
     */
    useEffect(() => {
        if (userProfile?.isAdaptiveLearningEnabled) {
            setIsAdaptiveMode(true);
            handleGenerateAdaptiveQuiz();
        } else {
            setIsAdaptiveMode(false);
            // Reset to selection screen if adaptive mode is turned off
            setDifficulty(null);
            setQuiz(null);
            setIsSubmitted(false);
        }
    }, [userProfile?.isAdaptiveLearningEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Resets the quiz state to allow the user to start a new quiz.
     */
    const handleNewQuiz = useCallback(() => {
        if (isAdaptiveMode) {
            handleGenerateAdaptiveQuiz();
        } else {
            setDifficulty(null);
            setQuiz(null);
            setUserAnswers({});
            setIsSubmitted(false);
            setError(null);
            setIsLoading(false);
        }
    }, [isAdaptiveMode]); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Fetches all history, calculates overall skill, and generates a quiz of appropriate difficulty.
     */
    const handleGenerateAdaptiveQuiz = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setQuiz(null);
        setUserAnswers({});
        setIsSubmitted(false);

        try {
            const histories = { writing: writingHistory, reading: readingHistory, listening: listeningHistory, speaking: speakingHistory };
            const overallSkill = calculateOverallSkill(histories);
            // Default to Medium if not enough data
            const adaptiveDifficulty = overallSkill ? bandToDifficulty(overallSkill) : 'Medium'; 
            
            const newQuiz = await generateQuiz(adaptiveDifficulty);
            
            // Logical validation of the AI's response
            if (!newQuiz || !newQuiz.title || !Array.isArray(newQuiz.questions) || newQuiz.questions.length === 0) {
                console.error("Incomplete or invalid quiz object received from AI:", newQuiz);
                throw new Error("The AI returned an incomplete quiz. Please try generating a new one.");
            }
            for (const q of newQuiz.questions) {
                if (!q.question || !Array.isArray(q.options) || q.options.length !== 4 || !q.correctAnswer || !q.explanation) {
                    console.error("Invalid question object in quiz:", q);
                    throw new Error("The AI generated a quiz with malformed questions. Please try generating a new one.");
                }
            }

            setQuiz(newQuiz);

        } catch (err) {
             setError(err instanceof Error ? err.message : "Failed to generate an adaptive quiz. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, [writingHistory, readingHistory, listeningHistory, speakingHistory]);

    /**
     * Generates a new quiz based on the selected difficulty level.
     */
    const handleGenerateQuiz = useCallback(async () => {
        if (!difficulty) return;
        setIsLoading(true);
        setError(null);
        setQuiz(null);
        setUserAnswers({});
        setIsSubmitted(false);
        try {
            const newQuiz = await generateQuiz(difficulty);

            // Logical validation of the AI's response
            if (!newQuiz || !newQuiz.title || !Array.isArray(newQuiz.questions) || newQuiz.questions.length === 0) {
                console.error("Incomplete or invalid quiz object received from AI:", newQuiz);
                throw new Error("The AI returned an incomplete quiz. Please try generating a new one.");
            }
            for (const q of newQuiz.questions) {
                if (!q.question || !Array.isArray(q.options) || q.options.length !== 4 || !q.correctAnswer || !q.explanation) {
                    console.error("Invalid question object in quiz:", q);
                    throw new Error("The AI generated a quiz with malformed questions. Please try generating a new one.");
                }
            }
            
            setQuiz(newQuiz);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to generate a new quiz. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, [difficulty]);
    
    /**
     * Handles changes to user answers.
     */
    const handleAnswerChange = (questionIndex: number, answer: string) => {
        setUserAnswers(prev => ({ ...prev, [questionIndex]: answer }));
    };

    /**
     * Handles the submission of the quiz for grading. Wrong answers are
     * promoted to SRS error cards so they cycle back into review.
     */
    const handleSubmit = () => {
        setIsSubmitted(true);
        if (!quiz) return;

        const wrong = quiz.questions
            .map((q, i) => ({ q, i, ans: userAnswers[i] }))
            .filter(({ q, ans }) => ans && ans !== q.correctAnswer);
        if (wrong.length === 0) return;

        const lowerTitle = (quiz.title || '').toLowerCase();
        const cardCategory = lowerTitle.includes('grammar')
            ? 'grammar'
            : lowerTitle.includes('listening')
            ? 'coherence'
            : 'lexical';
        const sourceType = lowerTitle.includes('listening') ? 'listening' : 'reading';
        const sessionId =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

        Promise.all(
            wrong.map(({ q, ans }) =>
                dashboardService.createErrorCard({
                    source_session_type: sourceType,
                    source_session_id: sessionId,
                    category: cardCategory,
                    error_text: `${q.question}\nYou picked: ${ans}`,
                    correction_text: `Correct: ${q.correctAnswer}`,
                    explanation: q.explanation,
                }).catch((e) => {
                    console.warn('Failed to create error card from quiz', e);
                    return null;
                }),
            ),
        ).then((results) => {
            const created = results.filter(Boolean).length;
            if (created > 0) {
                toast({
                    kind: 'info',
                    title: `${created} flashcard${created === 1 ? '' : 's'} added`,
                    body: 'Wrong answers are queued for SRS review.',
                });
            }
        });
    };

    /**
     * Calculates and displays the final score.
     */
    const renderScore = () => {
        if (!quiz) return 0;
        const correctAnswers = quiz.questions.reduce((count, q, index) => {
            return userAnswers[index] === q.correctAnswer ? count + 1 : count;
        }, 0);
        return `${correctAnswers} / ${quiz.questions.length}`;
    };

    return (
        <Card>
            <div className="flex flex-col items-center">
                <h2 className="text-2xl font-bold mb-4">Vocabulary & Grammar Quiz</h2>

                {!quiz && !isLoading && !isAdaptiveMode && (
                    <div className="text-center">
                        <p className="text-slate-600 dark:text-slate-400 mb-6">
                            Select a difficulty level to generate a quiz tailored to your needs.
                        </p>
                        <div className="flex justify-center space-x-4 mb-6">
                            {(['Easy', 'Medium', 'Hard'] as QuizDifficulty[]).map(level => (
                                <Button
                                    key={level}
                                    variant={difficulty === level ? 'primary' : 'secondary'}
                                    onClick={() => setDifficulty(level)}
                                >
                                    {level}
                                </Button>
                            ))}
                        </div>
                        <Button
                            onClick={handleGenerateQuiz}
                            disabled={!difficulty}
                        >
                            Start Quiz
                        </Button>
                    </div>
                )}
                
                {isLoading && isAdaptiveMode && <Loader text="Generating an adaptive quiz based on your performance..." />}
                {isLoading && !isAdaptiveMode && <Loader text="Generating your quiz..." />}
                
                {error && (
                    <ConnectionLost message={error} onRetry={handleNewQuiz} />
                )}

                {quiz && !isLoading && (
                    <div className="w-full max-w-4xl">
                        <h3 className="text-xl font-semibold text-center mb-6">{quiz.title}</h3>
                        
                        {isSubmitted && (
                             <div className="text-center bg-blue-100 dark:bg-blue-900/50 p-4 rounded-lg mb-8">
                                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">YOUR SCORE</p>
                                <p className="text-5xl font-bold text-blue-600 dark:text-blue-400">{renderScore()}</p>
                            </div>
                        )}
                        
                        <div className="space-y-8">
                            {quiz.questions.map((q, index) => (
                                <QuestionBlock
                                    key={index}
                                    question={q}
                                    questionIndex={index}
                                    userAnswer={userAnswers[index]}
                                    isSubmitted={isSubmitted}
                                    onAnswerChange={handleAnswerChange}
                                />
                            ))}
                        </div>

                        <div className="mt-8 flex justify-center space-x-4">
                            {!isSubmitted ? (
                                <Button onClick={handleSubmit} disabled={Object.keys(userAnswers).length !== quiz.questions.length}>
                                    Submit Quiz
                                </Button>
                            ) : (
                                <Button onClick={handleNewQuiz} variant="primary">
                                    Start a New Quiz
                                </Button>
                            )}
                        </div>

                        {isSubmitted && (
                            <NextStepBridge
                                fromSection={IELTSSection.Quiz}
                                topic={quiz.title}
                            />
                        )}
                    </div>
                )}
            </div>
        </Card>
    );
};

// -- SUB-COMPONENTS -- //

interface QuestionBlockProps {
    question: QuizQuestion;
    questionIndex: number;
    userAnswer: string;
    isSubmitted: boolean;
    onAnswerChange: (index: number, answer: string) => void;
}

const QuestionBlock: React.FC<QuestionBlockProps> = React.memo(({ question, questionIndex, userAnswer, isSubmitted, onAnswerChange }) => {
    const [alternativeExplanation, setAlternativeExplanation] = useState<string | null>(null);
    const [isExplaining, setIsExplaining] = useState<boolean>(false);
    const [explainError, setExplainError] = useState<string | null>(null);

    const handleExplainDifferently = async () => {
        setIsExplaining(true);
        setExplainError(null);
        setAlternativeExplanation(null);
        try {
            const simplerExplanation = await rephraseExplanation(question.question, question.explanation);
            // Logical validation for the AI's response
            if (!simplerExplanation || typeof simplerExplanation !== 'string' || simplerExplanation.trim() === '') {
                console.error("Empty or invalid explanation received from AI:", simplerExplanation);
                throw new Error("The AI returned an empty explanation. Please try again.");
            }
            setAlternativeExplanation(simplerExplanation);
        } catch (err) {
            setExplainError(err instanceof Error ? err.message : "Failed to get an alternative explanation.");
        } finally {
            setIsExplaining(false);
        }
    };

    return (
        <fieldset className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <legend className="font-semibold mb-4 px-1">{questionIndex + 1}. {question.question}</legend>
            <div className="space-y-3">
                {question.options.map((option, optIndex) => {
                    const optionValue = String.fromCharCode(65 + optIndex); // A, B, C, D
                    const isChecked = userAnswer === optionValue;
                    const isCorrect = question.correctAnswer === optionValue;
                    
                    let submissionClasses = 'hover:bg-slate-200 dark:hover:bg-slate-700';
                    if (isSubmitted) {
                        if (isCorrect) {
                            submissionClasses = 'bg-green-100 dark:bg-green-900/50 border-green-500';
                        } else if (isChecked && !isCorrect) {
                            submissionClasses = 'bg-red-100 dark:bg-red-900/50 border-red-500';
                        }
                    }

                    return (
                        <label key={optIndex} className={`flex items-center p-3 rounded-lg border-2 transition-colors ${isChecked && !isSubmitted ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-500' : 'border-transparent'} ${submissionClasses} ${isSubmitted ? 'cursor-default' : 'cursor-pointer'}`}>
                            <input 
                                type="radio" 
                                name={`question-${questionIndex}`} 
                                value={optionValue}
                                checked={isChecked}
                                onChange={(e) => onAnswerChange(questionIndex, e.target.value)}
                                disabled={isSubmitted}
                                className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                            />
                            <span className="ml-3 text-slate-800 dark:text-slate-300">{option}</span>
                        </label>
                    );
                })}
            </div>
             {isSubmitted && (
                <div className="mt-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400">
                    <p className="font-semibold text-sm text-yellow-800 dark:text-yellow-300">Explanation</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{question.explanation}</p>
                    <div className="mt-3">
                        {alternativeExplanation ? (
                            <div>
                                <p className="font-semibold text-sm text-yellow-800 dark:text-yellow-300">Simpler Explanation</p>
                                <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{alternativeExplanation}</p>
                            </div>
                        ) : (
                            <Button 
                                variant="secondary" 
                                className="px-2 py-1 text-xs"
                                onClick={handleExplainDifferently}
                                isLoading={isExplaining}
                                disabled={isExplaining}
                            >
                                Explain it Differently
                            </Button>
                        )}
                        {explainError && <p role="alert" className="text-red-500 text-xs mt-1">{explainError}</p>}
                    </div>
                </div>
            )}
        </fieldset>
    );
});

export default QuizTutor;