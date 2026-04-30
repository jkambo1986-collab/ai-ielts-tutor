/**
 * @file The component for the Reading practice section.
 * It generates an academic passage with multiple-choice questions and provides instant feedback.
 */

import React, { useState, useCallback } from 'react';
import Card from './Card';
import Button from './Button';
import Loader from './Loader';
import { generateReadingTest, evaluateReadingAnswer, submitReadingSession } from '../services/geminiService';
import ConfidenceModal from './dashboard/ConfidenceModal';
import { calculateReadingSkill } from '../services/adaptiveLearningService';
import { ReadingTest, ReadingQuestion, AnswerEvaluation, ReadingSessionSummary, ReadingTestType } from '../types';
import { useAppContext } from '../App';
import { ClockIcon, ReadingIcon, SearchIcon } from './Icons';
import WarmupBanner from './ui/WarmupBanner';

interface ReadingTutorProps {}

/**
 * The main component for the Reading Tutor.
 */
const ReadingTutor: React.FC<ReadingTutorProps> = () => {
  const { currentUser: userProfile, readingHistory, addReadingSession } = useAppContext();
  // Component State
  const [test, setTest] = useState<ReadingTest | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({}); // { questionIndex: 'A' }
  const [evaluations, setEvaluations] = useState<Record<number, AnswerEvaluation | null>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false); // True only when checking answers
  const [predictionModalOpen, setPredictionModalOpen] = useState(false);
  const [pendingPrediction, setPendingPrediction] = useState<number | null>(null);
  const [testStartedAt, setTestStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Determines the appropriate difficulty score based on user settings and performance history.
   */
  const getDifficultyScore = useCallback((): number => {
    if (!userProfile || !userProfile.isAdaptiveLearningEnabled) {
        return userProfile?.targetScore || 7.0;
    }
    
    const adaptiveScore = calculateReadingSkill(readingHistory);
    
    return adaptiveScore ?? userProfile.targetScore;
  }, [userProfile, readingHistory]);

  /**
   * Fetches a new reading test from the Gemini API and resets the component's state.
   */
  const fetchTest = useCallback(async (testType: ReadingTestType) => {
    setIsLoading(true);
    setError(null);
    setTest(null);
    setUserAnswers({});
    setEvaluations({});
    try {
      const difficultyScore = getDifficultyScore();
      const newTest = await generateReadingTest(difficultyScore, testType);
      
      // Add a logical check to ensure the response object has the expected structure
      if (!newTest || !newTest.passageTitle || !newTest.passage || !Array.isArray(newTest.questions) || newTest.questions.length === 0) {
          console.error("Incomplete or invalid reading test object received from AI:", newTest);
          throw new Error("The AI returned an incomplete or invalid test structure. Please try generating a new test.");
      }
      
      setTest(newTest);
      setTestStartedAt(Date.now());
      setPendingPrediction(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to generate a new reading test. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [getDifficultyScore]);

  /**
   * Resets the state to show the test selection screen.
   */
  const handleStartNewTest = () => {
    setTest(null);
    setUserAnswers({});
    setEvaluations({});
    setError(null);
    setIsLoading(false);
  };

  /**
   * Updates the state when a user selects an answer for a question.
   * @param {number} questionIndex - The index of the question being answered.
   * @param {string} answer - The selected option (e.g., 'A', 'B').
   */
  const handleAnswerChange = (questionIndex: number, answer: string) => {
    setUserAnswers(prev => ({ ...prev, [questionIndex]: answer }));
    // Clear any previous evaluation for this question if the user changes their answer.
    if (evaluations[questionIndex]) {
        setEvaluations(prev => ({...prev, [questionIndex]: null}));
    }
  };

  /**
   * Submits the user's answers to the API for evaluation with detailed distractor analysis.
   */
  const checkAnswers = async (predicted: number | null = pendingPrediction) => {
    if (!test) return;
    setIsEvaluating(true);
    setEvaluations({}); // Clear previous evaluations

    const answeredQuestions = Object.entries(userAnswers);

    try {
        const evaluationPromises = answeredQuestions.map(([indexStr, userAnswer]) => {
            const index = parseInt(indexStr, 10);
            const question = test.questions[index];
            return evaluateReadingAnswer(
                test.passage,
                question.question,
                question.options,
                String(userAnswer),
                question.correctAnswer
            ).then(evaluation => ({ index, evaluation }));
        });

        const results = await Promise.all(evaluationPromises);

        const newEvals: Record<number, AnswerEvaluation | null> = {};
        let correctCount = 0;
        
        for (const { index, evaluation } of results) {
            // Logical validation for each evaluation object from the AI
            if (evaluation === null || typeof evaluation.isCorrect !== 'boolean' || typeof evaluation.explanation !== 'string') {
                console.error(`Incomplete or invalid evaluation object received for question ${index}:`, evaluation);
                throw new Error(`The AI returned an invalid evaluation for one of the answers. Please try submitting again.`);
            }
            newEvals[index] = evaluation;
            if (evaluation.isCorrect) {
                correctCount++;
            }
        }

        setEvaluations(newEvals);

        if (test.questions.length > 0) {
            // Persist to backend (source of truth) and update local cache.
            // We use the backend session id locally so refreshes from the
            // server can reconcile against the same row.
            let backendId: string | null = null;
            try {
                const durationSeconds = testStartedAt ? Math.round((Date.now() - testStartedAt) / 1000) : 0;
                const r = await submitReadingSession(
                    correctCount,
                    test.questions.length,
                    test.passageTitle,
                    { durationSeconds, predictedBand: predicted },
                );
                backendId = r.session_id;
            } catch (e) {
                console.warn("Failed to persist reading session to backend:", e);
            }

            const newSummary: ReadingSessionSummary = {
                id: backendId ?? new Date().toISOString(),
                date: new Date().toISOString(),
                score: correctCount,
                totalQuestions: test.questions.length,
                passageTitle: test.passageTitle,
            };
            addReadingSession(newSummary);
        }

    } catch (err) {
        console.error("Error during answer evaluation:", err);
        setError(err instanceof Error ? err.message : "An error occurred while checking answers.");
    } finally {
        setIsEvaluating(false);
    }
  };
  
  /**
   * Helper function to format the option label consistently.
   */
  const getOptionLabel = (option: string) => {
    return option.startsWith('A)') || option.startsWith('B)') || option.startsWith('C)') || option.startsWith('D)') 
      ? option 
      : ` ${option}`;
  };

  // Render a loading state while fetching the test.
  if (isLoading) {
    return <Card><Loader text="Generating reading test..." /></Card>;
  }

  // Render an error state if the test fails to load.
  if (error) {
    return <Card><div role="alert" className="text-red-500 text-center p-4">{error} <Button onClick={handleStartNewTest} className="mt-4">Try Again</Button></div></Card>;
  }

  // Render test selection screen if no test is active
  if (!test) {
    return (
      <>
        <WarmupBanner sessionType="reading" />
        <Card>
            <div className="text-center">
                <h2 className="text-2xl font-bold mb-4">Reading Practice</h2>
                <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-8">
                    Choose a practice type to begin. Each mode is designed to test different aspects of your reading skills.
                </p>
                <div className="flex flex-col sm:flex-row justify-center items-stretch gap-6">
                    {/* Short Passage */}
                    <div className="w-full sm:w-80 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                        <div className="flex justify-center items-center h-16 w-16 bg-blue-100 dark:bg-blue-900/50 rounded-full mx-auto mb-4">
                            <ClockIcon className="h-8 w-8 text-blue-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold mb-2">Short Passage Practice</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 h-20">
                                A quick-fire round with a shorter text and fewer questions. Perfect for warming up or when you're short on time.
                            </p>
                        </div>
                        <Button onClick={() => fetchTest('Short Passage')}>Start Quick Practice</Button>
                    </div>
                    {/* Full Passage */}
                    <div className="w-full sm:w-80 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                        <div className="flex justify-center items-center h-16 w-16 bg-green-100 dark:bg-green-900/50 rounded-full mx-auto mb-4">
                            <ReadingIcon className="h-8 w-8 text-green-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold mb-2">Full Passage Practice</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 h-20">
                                A complete, exam-style passage with multiple questions to test your comprehension, inference, and attention to detail.
                            </p>
                        </div>
                        <Button onClick={() => fetchTest('Full Passage')}>Start Full Test</Button>
                    </div>
                    {/* Vocabulary Focus */}
                    <div className="w-full sm:w-80 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                        <div className="flex justify-center items-center h-16 w-16 bg-violet-100 dark:bg-violet-900/50 rounded-full mx-auto mb-4">
                            <SearchIcon className="h-8 w-8 text-violet-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold mb-2">Vocabulary Focus</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 h-20">
                                This passage comes with questions specifically designed to test your understanding of advanced vocabulary in context.
                            </p>
                        </div>
                        <Button onClick={() => fetchTest('Vocabulary Focus')}>Start Vocabulary Drill</Button>
                    </div>
                </div>
            </div>
      </Card>
      </>
    );
  }

  return (
    <Card>
      <ConfidenceModal
        open={predictionModalOpen}
        title="What band do you expect on this reading set?"
        onConfirm={(b) => { setPredictionModalOpen(false); setPendingPrediction(b); checkAnswers(b); }}
        onSkip={() => { setPredictionModalOpen(false); setPendingPrediction(null); checkAnswers(null); }}
      />
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Reading Practice</h2>
        <Button onClick={handleStartNewTest} variant="secondary">Start New Test</Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left side: Reading passage */}
        <div>
          <h3 className="text-xl font-semibold mb-2">{test?.passageTitle}</h3>
          <div className="prose prose-slate dark:prose-invert max-w-none bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg h-[32rem] overflow-y-auto">
            <p className="whitespace-pre-wrap">{test?.passage}</p>
          </div>
        </div>
        {/* Right side: Questions */}
        <div>
          <h3 className="text-xl font-semibold mb-4">Questions</h3>
          <div className="space-y-6">
            {test?.questions.map((q, index) => (
              <QuestionBlock 
                key={index}
                question={q}
                questionIndex={index}
                userAnswer={userAnswers[index]}
                evaluation={evaluations[index]}
                onAnswerChange={handleAnswerChange}
                getOptionLabel={getOptionLabel}
              />
            ))}
          </div>
          <div className="mt-8">
            <Button
                onClick={() => setPredictionModalOpen(true)}
                isLoading={isEvaluating}
                disabled={Object.keys(userAnswers).length === 0}
            >
                Check Answers
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};

/**
 * Props for the QuestionBlock component.
 */
interface QuestionBlockProps {
    question: ReadingQuestion;
    questionIndex: number;
    userAnswer: string;
    evaluation: AnswerEvaluation | null;
    onAnswerChange: (index: number, answer: string) => void;
    getOptionLabel: (option: string) => string;
}

/**
 * A sub-component to display a single question, its options, and its evaluation.
 * @param {QuestionBlockProps} props The component props.
 * @returns {React.FC<QuestionBlockProps>} The rendered question block.
 */
const QuestionBlock: React.FC<QuestionBlockProps> = React.memo(({ question, questionIndex, userAnswer, evaluation, onAnswerChange, getOptionLabel }) => {
    return (
        <fieldset>
            <legend className="font-semibold mb-2">{questionIndex + 1}. {question.question}</legend>
            <div className="space-y-2">
                {question.options.map((option, optIndex) => {
                    const optionValue = option.substring(0, 1);
                    const isChecked = userAnswer === optionValue;
                    return (
                        <label key={optIndex} className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-colors ${isChecked ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-500' : 'bg-white dark:bg-slate-700 border-transparent dark:border-slate-600'}`}>
                            <input 
                                type="radio" 
                                name={`question-${questionIndex}`} 
                                value={optionValue}
                                checked={isChecked}
                                onChange={(e) => onAnswerChange(questionIndex, e.target.value)}
                                className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                            />
                            <span className="ml-3 text-slate-800 dark:text-slate-300">{getOptionLabel(option)}</span>
                        </label>
                    );
                })}
            </div>
            {/* Display the evaluation result after checking answers */}
            {evaluation && (
                <div role="status" className={`mt-2 p-3 rounded-lg text-sm ${evaluation.isCorrect ? 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-200' : 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200'}`}>
                    <p><strong>{evaluation.isCorrect ? "Correct!" : "Incorrect."}</strong></p>
                    <p className="mt-1 whitespace-pre-wrap">{evaluation.explanation}</p>
                </div>
            )}
        </fieldset>
    );
});

export default ReadingTutor;
