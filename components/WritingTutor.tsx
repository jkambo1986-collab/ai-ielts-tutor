/**
 * @file The component for the Writing practice section.
 * Allows users to write an essay based on a prompt, submit it for AI evaluation,
 * and view detailed, highlighted feedback.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Card from './Card';
import Button from './Button';
import Loader from './Loader';
import { evaluateWriting, generateEssayPlan, analyzeCohesion, generateContextualWritingPrompts, generatePracticeForVocabulary } from '../services/geminiService';
import ConfidenceModal from './dashboard/ConfidenceModal';
import { uxService } from '../services/uxService';
import { useToast } from './ui/Toast';
import WarmupBanner from './ui/WarmupBanner';
import CrossSkillChip from './ui/CrossSkillChip';
import CalibrationBadge from './ui/CalibrationBadge';
import ReattemptDiffStrip from './ui/ReattemptDiffStrip';
import PostSessionBridge from './ui/PostSessionBridge';
import ResumeDraftBanner from './ui/ResumeDraftBanner';
import FeedbackThumbs from './ui/FeedbackThumbs';
import { useAutosave } from '../services/autosaveHook';
import SaveIndicator from './ui/SaveIndicator';
import NextStepBridge from './ui/NextStepBridge';
import ExplainabilityPane from './ui/ExplainabilityPane';
import { calculateWritingSkill } from '../services/adaptiveLearningService';
import { WritingFeedback, FeedbackCriterion, WritingSessionSummary, EssayPlan, CohesionMap, SubscriptionPlan, ContextualWritingPrompt, IELTSSection } from '../types';
import { WRITING_TASK_2_PROMPTS } from '../constants';
import Modal from './Modal';
import CohesionMapper from './CohesionMapper';
import UpgradeModal from './UpgradeModal';
import WritingPromptSelectionModal from './WritingPromptSelectionModal';
import { useAppContext } from '../App';

type FeedbackCategory = 'taskAchievement' | 'coherenceAndCohesion' | 'lexicalResource' | 'grammaticalRangeAndAccuracy';

// Color mapping for highlighting different feedback categories in the essay.
const feedbackColors: Record<FeedbackCategory, { bg: string, text: string, border: string }> = {
    taskAchievement: { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-800 dark:text-blue-200', border: 'border-blue-500' },
    coherenceAndCohesion: { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-800 dark:text-yellow-200', border: 'border-yellow-500' },
    lexicalResource: { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-800 dark:text-green-200', border: 'border-green-500' },
    grammaticalRangeAndAccuracy: { bg: 'bg-red-100 dark:bg-red-900/50', text: 'text-red-800 dark:text-red-200', border: 'border-red-500' },
};

/**
 * A component that displays the user's essay with relevant sentences highlighted
 * based on the AI's feedback.
 * @param {object} props - Component props.
 * @param {string} props.essay - The user's essay text.
 * @param {WritingFeedback} props.feedback - The AI feedback object.
 * @returns {React.FC} The rendered highlighted essay.
 */
const HighlightedEssay: React.FC<{ essay: string; feedback: WritingFeedback }> = ({ essay, feedback }) => {
    // Memoize the mapping of sentences to feedback categories for performance.
    const sentenceMap = useMemo(() => {
        const newMap = new Map<string, FeedbackCategory[]>();
        if (!feedback) return newMap;

        // Iterate through each feedback category and map its relevant sentences.
        for (const key in feedback.feedback) {
            const category = key as FeedbackCategory;
            const criterion = feedback.feedback[category];
            criterion.relevantSentences?.forEach(sentence => {
                const trimmedSentence = sentence.trim();
                if (!newMap.has(trimmedSentence)) {
                    newMap.set(trimmedSentence, []);
                }
                newMap.get(trimmedSentence)?.push(category);
            });
        }
        return newMap;
    }, [feedback]);

    // Split the essay into sentences for individual processing.
    const sentences = useMemo(() => essay.match(/[^.!?]+[.!?]*\s*/g) || [essay], [essay]);

    return (
        <div className="w-full h-96 p-4 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 overflow-y-auto">
            <p className="whitespace-pre-wrap leading-relaxed">
                {sentences.map((sentence, index) => {
                    const trimmedSentence = sentence.trim();
                    const categories = sentenceMap.get(trimmedSentence);
                    // If a sentence is linked to feedback, wrap it in a styled span.
                    if (categories && categories.length > 0) {
                        const primaryCategory = categories[0];
                        const color = feedbackColors[primaryCategory];
                        return (
                            <span key={index} className={`${color.bg} ${color.text} rounded p-0.5`}>
                                {sentence}
                            </span>
                        );
                    }
                    return <span key={index}>{sentence}</span>;
                })}
            </p>
        </div>
    );
};

/**
 * The main component for the Writing Tutor.
 */
const WritingTutor: React.FC = () => {
  const { 
      currentUser: userProfile, 
      writingHistory, 
      readingHistory, 
      listeningHistory, 
      addWritingSession,
      setActiveTab,
      setTargetedPractice 
  } = useAppContext();
  const { toast, update: updateToast } = useToast();
  // Component State
  const [prompt, setPrompt] = useState<string>('');
  const [essay, setEssay] = useState<string>('');
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [drafts, setDrafts] = useState<{ prompt_hash: string; prompt: string; essay: string; word_count: number; updated_at: string }[]>([]);
  // Snapshot of the parent session id active at submission time (used to render
  // ReattemptDiffStrip after the result lands).
  const [diffOriginalId, setDiffOriginalId] = useState<string | null>(null);
  const [diffReattemptId, setDiffReattemptId] = useState<string | null>(null);
  // One Skill Retake toggle — when on, the AI returns an osrDiagnostic
  // block with concrete moves to lift the band by 0.5.
  const [osrMode, setOsrMode] = useState<boolean>(false);

  const autosaveStatus = useAutosave(
      essay,
      async (v) => {
          if (!prompt || !v.trim() || feedback) return;
          await uxService.upsertDraft(prompt, v, 'task2');
      },
      Boolean(prompt) && !feedback,
  );

  // Load drafts on first open of the drafts shelf.
  React.useEffect(() => {
      if (!draftsOpen) return;
      let cancelled = false;
      uxService.fetchDrafts()
          .then(r => { if (!cancelled) setDrafts(r.drafts); })
          .catch(() => undefined);
      return () => { cancelled = true; };
  }, [draftsOpen]);
  // Confidence prediction (#25) — modal shown before submit, value piggy-backed on the request.
  const [predictionModalOpen, setPredictionModalOpen] = useState(false);
  const [predictedBand, setPredictedBand] = useState<number | null>(null);
  // Track when the user started writing for #18 quality scoring.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExamMode, setIsExamMode] = useState<boolean>(false);
  const [wasExamModeActive, setWasExamModeActive] = useState<boolean>(false);
  const [timer, setTimer] = useState(40 * 60); // 40 minutes in seconds

  // State for AI Essay Planner
  const [isPlannerVisible, setIsPlannerVisible] = useState<boolean>(false);
  const [plannerIdeas, setPlannerIdeas] = useState<string>('');
  const [essayPlan, setEssayPlan] = useState<EssayPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState<boolean>(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);

  // State for Cohesion Mapper
  const [cohesionMap, setCohesionMap] = useState<CohesionMap | null>(null);
  const [isAnalyzingCohesion, setIsAnalyzingCohesion] = useState<boolean>(false);
  const [cohesionError, setCohesionError] = useState<string | null>(null);
  const [isCohesionMapVisible, setIsCohesionMapVisible] = useState<boolean>(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  
  // State for Prompt Selection Modal
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [suggestedPrompts, setSuggestedPrompts] = useState<ContextualWritingPrompt[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  
  // State for Cross-Skill Vocabulary Reinforcer
  const [isGeneratingPractice, setIsGeneratingPractice] = useState(false);

  // Load a new prompt when the component first mounts.
  useEffect(() => {
    resetWithNewRandomPrompt();
  }, []);

  // Timer effect for Exam Mode
  useEffect(() => {
    let interval: number | undefined;
    if (isExamMode && !feedback) {
      interval = window.setInterval(() => {
        setTimer((prevTimer) => {
          if (prevTimer <= 1) {
            clearInterval(interval);
            // Optionally, auto-submit or notify user
            return 0;
          }
          return prevTimer - 1;
        });
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isExamMode, feedback]);

  /**
   * Generates a new random prompt and resets the component state.
   */
  const resetWithNewRandomPrompt = () => {
    const randomIndex = Math.floor(Math.random() * WRITING_TASK_2_PROMPTS.length);
    setPrompt(WRITING_TASK_2_PROMPTS[randomIndex]);
    setEssay('');
    setFeedback(null);
    setError(null);
    setWasExamModeActive(false);
    setIsExamMode(false);
    setTimer(40 * 60); // Reset timer
    // Reset planner state
    setIsPlannerVisible(false);
    setPlannerIdeas('');
    setEssayPlan(null);
    setIsPlanning(false);
    setPlannerError(null);
    // Reset cohesion state
    setCohesionMap(null);
    setIsAnalyzingCohesion(false);
    setCohesionError(null);
    setIsCohesionMapVisible(false);
  };
  
  /**
   * Determines the appropriate difficulty score based on user settings and performance history.
   * @returns {Promise<number>} The band score to use for generating content.
   */
  const getDifficultyScore = useCallback((): number => {
      if (!userProfile || !userProfile.isAdaptiveLearningEnabled) {
          return userProfile?.targetScore || 7.0;
      }
      
      const adaptiveScore = calculateWritingSkill(writingHistory);
      
      // Fallback to user's target score if not enough data for an adaptive score
      return adaptiveScore ?? userProfile.targetScore; 
  }, [userProfile, writingHistory]);

  /**
   * Triggered by the "Get Feedback" button. Opens the prediction modal first;
   * the actual evaluate call runs from `runEvaluation` once the user picks
   * (or skips) a band prediction.
   */
  const handleSubmit = () => {
    if (!essay.trim() || !prompt) return;
    setPredictionModalOpen(true);
  };

  const runEvaluation = async (predicted: number | null) => {
    setPredictionModalOpen(false);
    setPredictedBand(predicted);

    // Reset cohesion map on new submission
    setCohesionMap(null);
    setIsCohesionMapVisible(false);
    setCohesionError(null);

    setIsLoading(true);
    setError(null);
    setFeedback(null);
    setDiffOriginalId(null);
    setDiffReattemptId(null);
    if (isExamMode) {
      setWasExamModeActive(true);
    }
    // Two-stage progress toast — replaces the silent "press button, wait" UX.
    const progressId = toast({ title: 'Submitting essay…', kind: 'info', durationMs: 60000 });
    try {
      const difficultyScore = getDifficultyScore();
      // Pull a re-attempt parent (#21) if the user marked one from the dashboard.
      let parentSessionId: string | null = null;
      try { parentSessionId = localStorage.getItem('reattempt_parent_writing'); } catch { /* ignore */ }
      const durationSeconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;

      updateToast(progressId, { title: 'Analyzing your writing…', body: 'IELTS examiner pass in progress.', durationMs: 60000 });

      const { feedback: result, sessionId, cardsAdded } = await evaluateWriting(
        prompt,
        essay,
        difficultyScore,
        {
          taskType: 'task2',
          durationSeconds,
          predictedBand: predicted,
          parentSessionId,
          osr: osrMode,
        },
      );

      // Re-attempt is consumed; clear the localStorage flag.
      if (parentSessionId) {
        try { localStorage.removeItem('reattempt_parent_writing'); } catch { /* ignore */ }
        setDiffOriginalId(parentSessionId);
        setDiffReattemptId(sessionId);
      }

      // Final stage: success message; if the auto-extractor created cards,
      // tell the user instead of leaving it silent.
      if (cardsAdded && cardsAdded > 0) {
        updateToast(progressId, {
          title: `Feedback ready · ${cardsAdded} review card${cardsAdded === 1 ? '' : 's'} added`,
          body: 'Find them under SRS in your dashboard.',
          kind: 'success',
          durationMs: 5000,
        });
      } else {
        updateToast(progressId, {
          title: 'Feedback ready',
          kind: 'success',
          durationMs: 2500,
        });
      }

      // Add a logical check to ensure the response object has the expected structure
      if (!result || typeof result.bandScore !== 'number' || !result.feedback || !result.suggestions) {
          console.error("Incomplete or invalid feedback object received from AI:", result);
          throw new Error("The AI returned an incomplete evaluation. Please try submitting your essay again.");
      }

      setFeedback(result);

      const newSummary: WritingSessionSummary = {
          id: sessionId,
          date: new Date().toISOString(),
          bandScore: result.bandScore,
          feedback: result,
      };
      addWritingSession(newSummary);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred. Please try again.');
      updateToast(progressId, {
        title: 'Could not get feedback',
        body: err instanceof Error ? err.message : '',
        kind: 'error',
        durationMs: 5000,
      });
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsExamMode(false); // Always disable exam mode after submission.
      setStartedAt(null);
    }
  };

  /**
   * Handles the request to generate an essay plan from the AI.
   */
  const handleGeneratePlan = async () => {
    if (!plannerIdeas.trim()) return;
    setIsPlanning(true);
    setPlannerError(null);
    setEssayPlan(null);
    try {
        const plan = await generateEssayPlan(prompt, plannerIdeas);

        // Add a logical check for the response structure
        if (!plan || !plan.thesisStatement || !Array.isArray(plan.bodyParagraphs) || plan.bodyParagraphs.length === 0) {
            console.error("Incomplete or invalid essay plan object received from AI:", plan);
            throw new Error("The AI returned an incomplete essay plan. Please try again.");
        }
        
        setEssayPlan(plan);
    } catch (err) {
        setPlannerError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
        setIsPlanning(false);
    }
  };

  /**
   * Handles the request to generate a cohesion map from the AI.
   */
  const handleAnalyzeCohesion = async () => {
    if (userProfile?.plan !== SubscriptionPlan.Pro) {
        setIsUpgradeModalOpen(true);
        return;
    }
    if (!essay.trim()) return;
    setIsAnalyzingCohesion(true);
    setCohesionError(null);
    try {
        const map = await analyzeCohesion(prompt, essay);
        
        // Add a logical check for the response structure
        if (!map || !Array.isArray(map.nodes) || !Array.isArray(map.links) || map.nodes.length === 0) {
            console.error("Incomplete or invalid cohesion map object received from AI:", map);
            throw new Error("The AI returned an incomplete cohesion map. This can happen with very short essays. Please try again with a more complete essay.");
        }

        setCohesionMap(map);
        setIsCohesionMapVisible(true);
    } catch (err) {
        setCohesionError(err instanceof Error ? err.message : 'An unknown error occurred while analyzing cohesion.');
    } finally {
        setIsAnalyzingCohesion(false);
    }
  };
  
  const handleOpenPromptModal = useCallback(async () => {
    setIsPromptModalOpen(true);
    const hasHistory = readingHistory.length > 0 || listeningHistory.length > 0;
    if (hasHistory) {
      setIsLoadingSuggestions(true);
      try {
        const prompts = await generateContextualWritingPrompts(readingHistory, listeningHistory);
        setSuggestedPrompts(prompts);
      } catch (err) {
        console.error("Failed to fetch suggested writing prompts:", err);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }
  }, [readingHistory, listeningHistory]);

  const handleSelectPrompt = (newPrompt: string) => {
    setPrompt(newPrompt);
    setEssay('');
    setFeedback(null);
    setError(null);
    setIsPromptModalOpen(false);
  };
  
  /**
   * Handles the "Practice This Vocabulary" action, using AI function calling
   * to create a targeted practice session in another tutor.
   */
  const handlePracticeVocabulary = async () => {
      if (!feedback?.vocabularyEnhancements || feedback.vocabularyEnhancements.length === 0) return;

      setIsGeneratingPractice(true);
      setError(null);

      // Extract only the new words from the suggested sentences
      const vocabularyToPractice = feedback.vocabularyEnhancements.map(item => {
          // A simple way to find the "new" word is to see what's in the suggestion but not the original
          const originalWords = new Set(item.originalSentence.toLowerCase().match(/\b\w+\b/g));
          const suggestedWords = item.suggestedSentence.toLowerCase().match(/\b\w+\b/g) || [];
          return suggestedWords.find(word => !originalWords.has(word));
      }).filter((word): word is string => !!word);

      if (vocabularyToPractice.length === 0) {
          setError("Could not identify specific new words to practice.");
          setIsGeneratingPractice(false);
          return;
      }
      
      try {
          const response = await generatePracticeForVocabulary(vocabularyToPractice);
          const functionCall = response.functionCalls?.[0];
          
          if (functionCall?.name === 'createSpeakingPrompt' && functionCall.args) {
              const { part, text } = functionCall.args;
              if (part && text) {
                  // Set the targeted practice data in the global context
                  setTargetedPractice({
                      destination: IELTSSection.Speaking,
                      payload: { part, text }
                  });
                  // Navigate the user to the Speaking Tutor
                  setActiveTab(IELTSSection.Speaking);
              } else {
                 throw new Error("AI returned an incomplete speaking prompt.");
              }
          } else {
              throw new Error("The AI could not generate a practice session for this vocabulary.");
          }
      } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to create practice session.");
      } finally {
          setIsGeneratingPractice(false);
      }
  };


  // Calculate the word count of the essay.
  const wordCount = essay.trim().split(/\s+/).filter(Boolean).length;

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };
  
  if (!userProfile) return null;

  return (
    <>
      <ConfidenceModal
        open={predictionModalOpen}
        title="What band do you expect on this essay?"
        onConfirm={(b) => runEvaluation(b)}
        onSkip={() => runEvaluation(null)}
      />
      {!feedback && <WarmupBanner sessionType="writing" />}
      {!feedback && (
        <ResumeDraftBanner
          currentPrompt={prompt}
          editorIsEmpty={!essay.trim()}
          onResume={(essayText, draftPrompt) => {
            if (!prompt) setPrompt(draftPrompt);
            setEssay(essayText);
          }}
        />
      )}
      {!feedback && !essay.trim() && (
        <CrossSkillChip mode="writing" onSelect={(p) => setPrompt(p)} />
      )}
      <Card className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left side: Prompt, Essay Input/Display */}
        <div>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 className="text-2xl font-bold flex items-center gap-3">
                Writing Task 2 Practice
                <SaveIndicator status={autosaveStatus} />
            </h2>
            <button
                onClick={() => setDraftsOpen(true)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
                Drafts
            </button>
            <div className="flex items-center space-x-4">
              {/* OSR Toggle — One Skill Retake practice mode */}
              <div className="flex items-center space-x-2" title="Retaking only Writing on the official exam? Get a focused 'what would change your band' diagnostic.">
                <label htmlFor="osr-toggle" className="text-sm font-medium text-slate-600 dark:text-slate-400 cursor-pointer">OSR</label>
                <button
                    role="switch"
                    aria-checked={osrMode}
                    onClick={() => setOsrMode(v => !v)}
                    disabled={isLoading || !!feedback}
                    id="osr-toggle"
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${osrMode ? 'bg-rose-600' : 'bg-gray-200 dark:bg-slate-700'}`}
                >
                    <span aria-hidden="true" className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${osrMode ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              {/* Exam Mode Toggle */}
              <div className="flex items-center space-x-2">
                <label htmlFor="exam-mode-toggle" className="text-sm font-medium text-slate-600 dark:text-slate-400 cursor-pointer">Exam Mode</label>
                <button
                    role="switch"
                    aria-checked={isExamMode}
                    onClick={() => setIsExamMode(!isExamMode)}
                    disabled={isLoading || !!feedback}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${isExamMode ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-700'}`}
                    id="exam-mode-toggle"
                >
                    <span
                        aria-hidden="true"
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isExamMode ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                </button>
              </div>
              {/* Action Buttons: Revise Essay, New Prompt, etc. */}
              {feedback ? (
                <div className="flex items-center space-x-2">
                    <Button onClick={handleAnalyzeCohesion} isLoading={isAnalyzingCohesion} variant="primary">
                        Analyze Cohesion
                        {userProfile.plan !== SubscriptionPlan.Pro && <span className="ml-2 text-xs bg-amber-400 text-amber-900 font-bold px-1.5 py-0.5 rounded-full">PRO</span>}
                    </Button>
                    {wasExamModeActive ? (
                        <Button onClick={resetWithNewRandomPrompt} variant="secondary">Start New Practice</Button>
                    ) : (
                        <Button onClick={() => {
                            setFeedback(null);
                            setIsCohesionMapVisible(false); // Hide map when revising
                        }} variant="secondary">Revise Essay</Button>
                    )}
                </div>
              ) : (
                  <div className="flex items-center space-x-2">
                      <Button onClick={() => setIsPlannerVisible(!isPlannerVisible)} variant="secondary">
                          {isPlannerVisible ? 'Hide Planner' : 'Plan Your Essay'}
                      </Button>
                      <Button onClick={handleOpenPromptModal} variant="secondary" disabled={isExamMode}>Select Prompt</Button>
                      <Button onClick={resetWithNewRandomPrompt} variant="secondary" disabled={isExamMode}>New Random Prompt</Button>
                  </div>
              )}
            </div>
          </div>
          <div id="essay-prompt" className="bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg mb-4 relative">
            <p className="font-semibold text-slate-800 dark:text-slate-200">{prompt}</p>
            {isExamMode && !feedback && (
              <div className={`absolute top-2 right-2 px-3 py-1 text-sm font-bold rounded-full ${timer < 300 ? 'text-red-800 bg-red-200 dark:text-red-200 dark:bg-red-800/50' : 'text-slate-800 bg-slate-200 dark:text-slate-200 dark:bg-slate-800/50'}`}>
                  {formatTime(timer)}
              </div>
            )}
          </div>

          {/* -- START: AI Essay Planner -- */}
          {isPlannerVisible && !feedback && (
              <div className="my-4 p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                  <h3 className="text-lg font-semibold mb-2">AI Essay Planner</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                      Enter some keywords or your initial thoughts below, and the AI will help you structure your essay.
                  </p>
                  <textarea
                      value={plannerIdeas}
                      onChange={(e) => setPlannerIdeas(e.target.value)}
                      placeholder="e.g., agree with compulsory service, teaches responsibility, helps community, but takes time from studies..."
                      className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                      rows={3}
                      disabled={isPlanning}
                      aria-label="Your initial ideas for the essay plan"
                  />
                  <Button onClick={handleGeneratePlan} isLoading={isPlanning} disabled={!plannerIdeas.trim()} className="mt-2">
                      Generate Plan
                  </Button>

                  {isPlanning && <div className="mt-4"><Loader text="Generating your plan..." /></div>}
                  {plannerError && <div className="mt-4 text-red-500">{plannerError}</div>}
                  {essayPlan && (
                      <div className="mt-4 space-y-4 text-sm">
                          <div>
                              <p className="font-semibold text-slate-800 dark:text-slate-200">Thesis Statement:</p>
                              <p className="italic bg-white dark:bg-slate-800 p-2 rounded">{essayPlan.thesisStatement}</p>
                          </div>
                          <div>
                              <p className="font-semibold text-slate-800 dark:text-slate-200">Body Paragraphs:</p>
                              <ul className="space-y-3">
                                  {essayPlan.bodyParagraphs.map((para, index) => (
                                      <li key={index} className="bg-white dark:bg-slate-800 p-2 rounded">
                                          <p className="font-medium"><strong>Main Point {index + 1}:</strong> {para.mainPoint}</p>
                                          <p className="font-semibold text-xs uppercase text-slate-500 mt-1">Supporting Examples:</p>
                                          <ul className="list-disc list-inside pl-2 text-slate-600 dark:text-slate-400">
                                              {para.supportingExamples.map((ex, exIndex) => <li key={exIndex}>{ex}</li>)}
                                          </ul>
                                      </li>
                                  ))}
                              </ul>
                          </div>
                      </div>
                  )}
              </div>
          )}
          {/* -- END: AI Essay Planner -- */}

          {/* Conditionally render the essay input or the highlighted feedback view */}
          {feedback ? (
              <div>
                  <HighlightedEssay essay={essay} feedback={feedback} />
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                      <span className="font-bold">Legend:</span>
                      {Object.entries(feedbackColors).map(([key, value]) => (
                          <div key={key} className="flex items-center">
                              <span className={`w-3 h-3 rounded-full ${value.bg} mr-1.5 border ${value.border}`}></span>
                              <span className="capitalize text-slate-600 dark:text-slate-400">{key.replace(/([A-Z])/g, ' $1').replace('And', '&')}</span>
                          </div>
                      ))}
                  </div>
              </div>
          ) : (
              <textarea
                value={essay}
                onChange={(e) => {
                  setEssay(e.target.value);
                  if (e.target.value && !startedAt) setStartedAt(Date.now());
                }}
                placeholder="Start writing your essay here... Aim for at least 250 words."
                className="w-full h-96 p-4 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                disabled={isLoading}
                aria-label="Essay input area"
                aria-describedby="essay-prompt"
              />
          )}
          
          {/* Footer for the input area: Submit button and word count */}
          {!feedback && (
            <div className="flex justify-between items-center mt-4">
                <Button onClick={handleSubmit} isLoading={isLoading} disabled={!essay.trim()}>Get Feedback</Button>
                <p className={`text-sm font-medium ${wordCount < 250 ? 'text-orange-500' : 'text-green-500'}`}>
                    Word Count: {wordCount}
                </p>
            </div>
          )}
        </div>
        {/* Right side: Feedback Display */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Feedback</h2>
          <div className="bg-slate-100 dark:bg-slate-900/50 rounded-lg p-4 h-[30rem] lg:h-[32rem] overflow-y-auto">
            {isLoading && <Loader text="Analyzing your essay..." />}
            {error && <div role="alert" className="text-red-500 text-center p-4">{error}</div>}
            {cohesionError && <div role="alert" className="text-red-500 text-center p-4">{cohesionError}</div>}
            {feedback && (
              <div className="space-y-6">
                {diffOriginalId && diffReattemptId && (
                  <ReattemptDiffStrip
                    kind="writing"
                    originalId={diffOriginalId}
                    reattemptId={diffReattemptId}
                  />
                )}
                <div className="text-center bg-blue-100 dark:bg-blue-900/50 p-4 rounded-lg">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">ESTIMATED BAND SCORE</p>
                  <p className="text-5xl font-bold text-blue-600 dark:text-blue-400">{feedback.bandScore.toFixed(1)}</p>
                  <CalibrationBadge predicted={predictedBand} actual={feedback.bandScore} />
                </div>
                <PostSessionBridge
                  fromSkill="writing"
                  promptText={prompt}
                  onBridge={(section, seed) => {
                    try { localStorage.setItem('bridge_seed_prompt', seed); } catch { /* ignore */ }
                    setActiveTab(section);
                  }}
                />
                <FeedbackThumbs agent="writing_eval" />

                {/* Render feedback for each criterion */}
                <FeedbackSection title="Task Achievement" criterion={feedback.feedback.taskAchievement} />
                <FeedbackSection title="Coherence & Cohesion" criterion={feedback.feedback.coherenceAndCohesion} />
                <FeedbackSection title="Lexical Resource" criterion={feedback.feedback.lexicalResource} />
                <FeedbackSection title="Grammatical Range & Accuracy" criterion={feedback.feedback.grammaticalRangeAndAccuracy} />
                
                {/* Render vocabulary enhancement suggestions */}
                {feedback.vocabularyEnhancements && feedback.vocabularyEnhancements.length > 0 && (
                  <div>
                      <h3 className="text-lg font-semibold mb-2">Vocabulary Enhancements</h3>
                      <div className="space-y-4">
                          {feedback.vocabularyEnhancements.map((item, index) => (
                              <div key={index} className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Original:</p>
                                  <p className="italic text-slate-600 dark:text-slate-300 mb-3">"{item.originalSentence}"</p>
                                  <p className="text-sm text-green-600 dark:text-green-400 font-semibold mb-2">Suggestion:</p>
                                  <p className="font-medium text-slate-800 dark:text-slate-200">"{item.suggestedSentence}"</p>
                              </div>
                          ))}
                      </div>
                      <div className="mt-4">
                        <Button 
                            onClick={handlePracticeVocabulary}
                            isLoading={isGeneratingPractice}
                        >
                            Practice This Vocabulary &rarr;
                        </Button>
                      </div>
                  </div>
                )}

                {/* Render general suggestions */}
                <div>
                  <h3 className="text-lg font-semibold mb-2 mt-4">Suggestions for Improvement</h3>
                  <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300">
                    {feedback.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}
                  </ul>
                </div>

              </div>
            )}
            {/* Placeholder when no feedback is available */}
            {!isLoading && !feedback && !error && (
              <div className="flex items-center justify-center h-full text-slate-500">
                Your feedback will appear here after you submit your essay.
              </div>
            )}
          </div>
        </div>
      </Card>

      <WritingPromptSelectionModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
        onSelectPrompt={handleSelectPrompt}
        standardPrompts={WRITING_TASK_2_PROMPTS}
        suggestedPrompts={suggestedPrompts}
        isLoadingSuggestions={isLoadingSuggestions}
      />

      <Modal
          isOpen={isCohesionMapVisible && cohesionMap !== null}
          onClose={() => setIsCohesionMapVisible(false)}
          title="Interactive Cohesion Map"
      >
          {cohesionMap && <CohesionMapper data={cohesionMap} />}
      </Modal>

      <UpgradeModal
          isOpen={isUpgradeModalOpen}
          onClose={() => setIsUpgradeModalOpen(false)}
          featureName="Cohesion Mapper"
      />

      <Modal
          isOpen={draftsOpen}
          onClose={() => setDraftsOpen(false)}
          title="Drafts"
      >
          {drafts.length === 0 ? (
              <p className="text-sm text-slate-500">No saved drafts yet. Start writing — your progress is saved automatically.</p>
          ) : (
              <ul className="space-y-2 max-h-96 overflow-y-auto">
                  {drafts.map(d => (
                      <li key={d.prompt_hash} className="rounded border border-slate-200 dark:border-slate-800 p-3">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-2">{d.prompt}</p>
                          <p className="text-xs text-slate-500 mt-1">
                              {d.word_count} words · {new Date(d.updated_at).toLocaleString()}
                          </p>
                          <div className="flex gap-2 mt-2">
                              <button
                                  onClick={() => {
                                      setPrompt(d.prompt);
                                      setEssay(d.essay);
                                      setDraftsOpen(false);
                                  }}
                                  className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded px-3 py-1.5"
                              >
                                  Resume
                              </button>
                              <button
                                  onClick={async () => {
                                      await uxService.deleteDraft(d.prompt_hash).catch(() => undefined);
                                      setDrafts(prev => prev.filter(x => x.prompt_hash !== d.prompt_hash));
                                  }}
                                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                              >
                                  Delete
                              </button>
                          </div>
                      </li>
                  ))}
              </ul>
          )}
      </Modal>

      {feedback && (
          <>
            <ExplainabilityPane
                skill="writing"
                band={feedback.bandScore}
                writing={{ prompt, essay }}
            />
            <NextStepBridge fromSection={IELTSSection.Writing} topic={prompt} />
          </>
      )}
    </>
  );
};

/**
 * A sub-component to render a single section of feedback.
 * @param {object} props - Component props.
 * @param {string} props.title - The title of the feedback section.
 * @param {FeedbackCriterion} props.criterion - The feedback data for this section.
 * @returns {React.FC} The rendered feedback section.
 */
const FeedbackSection: React.FC<{title: string; criterion: FeedbackCriterion}> = React.memo(({title, criterion}) => (
    <div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{criterion.text}</p>
        
        {/* Display specific sentences from the user's essay */}
        {criterion.relevantSentences && criterion.relevantSentences.length > 0 && (
            <div className="mt-3 bg-slate-200/50 dark:bg-slate-800/50 border-l-4 border-slate-400 dark:border-slate-600 p-3 rounded-r-lg">
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">From your essay:</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                    {criterion.relevantSentences.map((sentence, index) => (
                        <li key={index} className="italic text-slate-500 dark:text-slate-400">"{sentence}"</li>
                    ))}
                </ul>
            </div>
        )}
        {/* Display generic example sentences */}
        {criterion.exampleSentences && criterion.exampleSentences.length > 0 && (
             <div className="mt-3 bg-blue-100/50 dark:bg-blue-900/40 border-l-4 border-blue-400 dark:border-blue-500 p-3 rounded-r-lg">
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-200">For example:</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                    {criterion.exampleSentences.map((sentence, index) => (
                        <li key={index} className="italic text-slate-600 dark:text-slate-300">"{sentence}"</li>
                    ))}
                </ul>
            </div>
        )}
    </div>
));

export default WritingTutor;