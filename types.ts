/**
 * @file This file contains all the TypeScript type definitions and enums used across the application.
 */

/**
 * Enum for the main sections of the IELTS exam practice.
 */
export enum IELTSSection {
  Dashboard = 'Dashboard', // Added new section
  Speaking = 'Speaking',
  Writing = 'Writing',
  Reading = 'Reading',
  Listening = 'Listening',
  IntegratedSkills = 'Integrated Skills',
  Quiz = 'Quiz', // Added new Quiz section
  Profile = 'Profile', // Account + ESL preferences
  Admin = 'Admin', // Admin-only — sitemap, users, usage stats
}

/**
 * Defines the types of listening tests that can be generated.
 */
export type ListeningTestType = 'Dialogue' | 'Monologue' | 'Lecture';

/**
 * Defines the types of reading tests that can be generated.
 */
export type ReadingTestType = 'Short Passage' | 'Full Passage' | 'Vocabulary Focus';


/**
 * Enum for user subscription plans.
 */
export enum SubscriptionPlan {
  Free = 'Free',
  Pro = 'Pro',
}


/**
 * Interface for a single feedback criterion in the Writing Tutor.
 */
export interface FeedbackCriterion {
  text: string; // The main feedback text.
  relevantSentences?: string[]; // Specific sentences from the user's essay this feedback applies to.
  exampleSentences?: string[]; // Generic example sentences if no specific user sentence is applicable.
}

/**
 * Interface for the complete feedback object for a writing task.
 */
export interface WritingFeedback {
  bandScore: number;
  feedback: {
    taskAchievement: FeedbackCriterion;
    coherenceAndCohesion: FeedbackCriterion;
    lexicalResource: FeedbackCriterion;
    grammaticalRangeAndAccuracy: FeedbackCriterion;
  };
  suggestions: string[];
  vocabularyEnhancements?: {
    originalSentence: string;
    suggestedSentence: string;
  }[];
}

/**
 * Interface for the AI-generated essay plan.
 */
export interface EssayPlan {
  thesisStatement: string;
  bodyParagraphs: {
    mainPoint: string;
    supportingExamples: string[];
  }[];
}

/**
 * Interface for a single question in a reading test.
 */
export interface ReadingQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
}

/**
 * Interface for a complete reading test, including the passage and questions.
 */
export interface ReadingTest {
  passageTitle: string;
  passage: string;
  questions: ReadingQuestion[];
}

/**
 * Interface for the evaluation of a user's answer in the Reading Tutor.
 */
export interface AnswerEvaluation {
  isCorrect: boolean;
  explanation: string;
}

/**
 * Interface for a turn in the speaking conversation transcript.
 */
export interface Turn {
    speaker: 'user' | 'model';
    text: string;
    timestamp: string;
}

/**
 * Interface for a single feedback point within a speaking criterion.
 */
export interface SpeakingFeedbackPoint {
    feedback: string;
    example: string; // Specific example phrase from the user's transcript.
}

/**
 * Interface for a specific, detailed point of pronunciation feedback.
 */
export interface PronunciationDetail {
    targetPhoneme: string; // The specific phoneme or sound to work on (e.g., "/θ/ as in 'think'").
    problemWords: string[]; // An array of specific words from the transcript where the user had issues.
    explanation: string; // A brief explanation of the error (e.g., "Often pronounced as /f/").
}

/**
 * Interface for the comprehensive, rubric-based analysis of a speaking session.
 */
export interface SpeakingAnalysis {
    overallBandScore: number;
    fluencyAndCoherence: SpeakingFeedbackPoint;
    lexicalResource: SpeakingFeedbackPoint;
    grammaticalRangeAndAccuracy: SpeakingFeedbackPoint;
    pronunciation: SpeakingFeedbackPoint;
    pronunciationAnalysis?: PronunciationDetail; // Detailed analysis for targeted practice.
    argumentativeSkills?: SpeakingFeedbackPoint; // Feedback for role-play mode
}

/**
 * Interface for a summary of a completed speaking practice session.
 */
export interface SpeakingSessionSummary {
  id: string; // A unique identifier for the session.
  date: string; // The start date and time in ISO string format.
  durationInSeconds: number; // The total duration of the session.
  topic: string; // A short summary or topic of the conversation.
  prompt?: { part: string; text: string }; // The specific prompt used for the session.
  transcript: Turn[]; // The full conversation transcript.
  speakingAnalysis?: SpeakingAnalysis; // Optional comprehensive analysis results.
  mode: 'Standard' | 'RolePlay'; // The practice mode used for the session.
}

/**
 * Interface for a single question in a listening test.
 */
export interface ListeningQuestion {
  question: string;
  options: string[];
  correctAnswer: string; // e.g., 'A', 'B', 'C', or 'D'
}

/**
 * Interface for a single part of the audio script (one speaker's turn).
 */
export interface ListeningScriptPart {
  speaker: string; // e.g., 'Narrator', 'John', 'Maria'
  text: string;    // The text spoken by the speaker.
}

/**
 * Interface for a complete listening test.
 */
export interface ListeningTest {
  title: string;
  script: ListeningScriptPart[];
  questions: ListeningQuestion[];
}

// -- START: Types for Quiz -- //

/**
 * Defines the possible difficulty levels for a quiz.
 */
export type QuizDifficulty = 'Easy' | 'Medium' | 'Hard';

/**
 * Interface for a single question in a quiz.
 */
export interface QuizQuestion {
  question: string; // The question text.
  options: string[]; // An array of 4 possible options (A, B, C, D).
  correctAnswer: string; // The correct option letter (e.g., 'A').
  explanation: string; // An explanation for why the answer is correct.
}

/**
 * Interface for a complete quiz.
 */
export interface Quiz {
  title: string;
  questions: QuizQuestion[];
}

// -- END: Types for Quiz -- //

// -- START: Types for Dashboard & Profile -- //

/**
 * Interface for user profile settings, stored via authService.
 */
/** Role values must mirror the backend `accounts.User.ROLE_*` constants. */
export type UserRole = 'super_admin' | 'institute_admin' | 'instructor' | 'student';

export const ADMIN_ROLES: UserRole[] = ['super_admin', 'institute_admin'];

/** ESL: ISO 639-1 codes for the learner's native language. Empty = unset. */
export type NativeLanguageCode =
    | '' | 'ar' | 'bn' | 'zh' | 'yue' | 'nl' | 'fa' | 'fil' | 'fr' | 'de'
    | 'gu' | 'hi' | 'id' | 'it' | 'ja' | 'kk' | 'ko' | 'ms' | 'ne' | 'pl'
    | 'pt' | 'pa' | 'ru' | 'es' | 'ta' | 'te' | 'th' | 'tr' | 'uk' | 'ur'
    | 'vi' | 'other';

export type EnglishProficiencyLevel =
    | '' | 'beginner' | 'lower_intermediate' | 'intermediate'
    | 'upper_intermediate' | 'advanced';

export type ThemePref = 'system' | 'light' | 'dark';

export interface UserProfile {
    id: string;
    name: string;
    email: string;
    password?: string; // Will be plain text for this simulation, optional on client
    role: UserRole;
    targetScore: number;
    isAdaptiveLearningEnabled: boolean;
    nativeLanguage: NativeLanguageCode;
    englishProficiencyLevel: EnglishProficiencyLevel;
    examDate?: string | null;             // ISO date (yyyy-mm-dd)
    dailyCommitmentMinutes?: number | null;
    publicProgressSlug?: string | null;   // X2 opt-in
    themePref?: ThemePref;
    onboardedAt?: string | null;
    plan: SubscriptionPlan;
    subscriptionEndDate?: string; // ISO string
    dateJoined?: string; // ISO string — server-supplied
    instituteSlug?: string;
}


/**
 * Interface for a summary of a completed writing session, stored in localStorage.
 */
export interface WritingSessionSummary {
    id: string;
    date: string;
    bandScore: number;
    feedback: WritingFeedback; // Store full feedback for meta-analysis
}

/**
 * Interface for a summary of a completed reading session, stored in localStorage.
 */
export interface ReadingSessionSummary {
    id: string;
    date: string;
    score: number;
    totalQuestions: number;
    passageTitle?: string; // Optional: Store the topic for context
}

/**
 * Interface for a summary of a completed listening session, stored in localStorage.
 */
export interface ListeningSessionSummary {
    id: string;
    date: string;
    score: number;
    totalQuestions: number;
    title?: string; // Optional: Store the topic for context
}

/**
 * Interface for the AI-powered weakness analysis response for writing.
 */
export interface WeaknessAnalysis {
    recurringWeaknesses: {
        weakness: string; // e.g., "Lack of varied sentence structures"
        suggestion: string; // Actionable advice to fix the weakness
    }[];
}

/**
 * Interface for the AI-powered weakness analysis response for speaking.
 */
export interface SpeakingWeaknessAnalysis {
    recurringWeaknesses: {
        weakness: string; // e.g., "Hesitation and use of fillers"
        suggestion: string; // Actionable advice to improve
    }[];
}


/**
 * Interface for the comprehensive AI coach analysis.
 */
export interface ComprehensiveAnalysis {
    analysis: string; // A single paragraph of holistic feedback.
}

/**
 * Interface for a single day's goal in a study plan.
 */
export interface DailyGoal {
    day: number;
    focus: string; // e.g., "Coherence and Cohesion"
    task: string;  // e.g., "Complete one Writing Tutor session and use the Cohesion Mapper."
}

/**
 * Interface for the AI-generated personalized study plan.
 */
export interface StudyPlan {
    plan: DailyGoal[];
}


// -- END: Types for Dashboard & Profile -- //


// -- START: Types for Cohesion Mapper -- //

/**
 * Represents a single logical idea or point within the essay's structure.
 */
export interface CohesionNode {
  id: string; // A unique identifier for the node (e.g., 'thesis', 'mp1', 'sp1.1').
  type: 'thesis' | 'mainPoint' | 'supportingPoint'; // The role of the node in the essay structure.
  text: string; // A concise summary of the point.
  originalSentence: string; // The exact sentence from the essay representing this point.
}

/**
 * Represents the connection and logical flow between two nodes (ideas).
 */
export interface CohesionLink {
  source: string; // The ID of the source node.
  target: string; // The ID of the target node.
  strength: 'strong' | 'weak' | 'missing'; // The quality of the transition.
  explanation: string; // AI's analysis of the connection and suggestion for improvement.
  linkingPhrase?: string; // The specific transitional word/phrase used (e.g., "Furthermore", "In contrast").
}

/**
 * The complete structural map of the essay's coherence and cohesion.
 */
export interface CohesionMap {
  nodes: CohesionNode[];
  links: CohesionLink[];
}

// -- END: Types for Cohesion Mapper -- //

// -- START: Types for Pronunciation Studio -- //

/**
 * Interface for a minimal pair used in pronunciation practice.
 */
export interface MinimalPair {
    wordA: string; // The word with the target sound.
    wordB: string; // The contrasting word.
}

/**
 * Interface for the complete set of AI-generated pronunciation exercises.
 */
export interface PronunciationPractice {
    targetPhoneme: string;
    minimalPairs: MinimalPair[];
    tongueTwisters: string[];
}

// -- END: Types for Pronunciation Studio -- //

// -- START: Types for Integrated Skills Lab -- //

/**
 * Interface for the AI-generated "Listen & Summarize" task.
 */
export interface ListenSummarizeTask {
  topic: string;
  lectureScript: {
    speaker: string; // e.g., 'Lecturer'
    text: string;
  }[];
}

/**
 * Interface for the AI-generated "Read & Speak" task.
 */
export interface ReadSpeakTask {
  passageTitle: string;
  passage: string;
  speakingPrompt: string; // A high-level prompt for the AI to start the conversation.
}

/**
 * Interface for the evaluation of a user's written summary.
 */
export interface SummaryEvaluation {
  bandScore: number;
  feedback: {
    content: FeedbackCriterion; // How well the main points were covered.
    conciseness: FeedbackCriterion; // How concise the summary is.
    paraphrasing: FeedbackCriterion; // How well the user used their own words.
  };
  suggestions: string[];
}

/**
 * Interface for the AI-generated "Read, Listen & Write" synthesis task.
 */
export interface ReadListenWriteTask {
  topic: string;
  passageTitle: string;
  passage: string;
  lectureScript: {
    speaker: string;
    text: string;
  }[];
  writingPrompt: string;
}

/**
 * Interface for the evaluation of a user's written synthesis.
 */
export interface SynthesisEvaluation {
  bandScore: number;
  feedback: {
    contentAccuracyReading: FeedbackCriterion;
    contentAccuracyListening: FeedbackCriterion;
    synthesisOfIdeas: FeedbackCriterion;
    paraphrasingAndLanguage: FeedbackCriterion;
  };
  suggestions: string[];
}
// -- END: Types for Integrated Skills Lab -- //

// -- START: Types for Context-Aware Prompts -- //

/**
 * Interface for a contextually generated speaking prompt.
 */
export interface ContextualSpeakingPrompt {
  part: 'Part 2' | 'Part 3';
  text: string;
  reason: string; // A short explanation of why this prompt was suggested.
}

/**
 * Interface for a contextually generated writing prompt.
 */
export interface ContextualWritingPrompt {
  text: string;
  reason: string; // A short explanation of why this prompt was suggested.
}

// -- END: Types for Context-Aware Prompts -- //

/**
 * Defines the view for the authentication page.
 */
export type AuthView = 'login' | 'signup' | 'forgotPassword';

/**
 * Interface for the global application context.
 */
export interface IAppContext {
    currentUser: UserProfile | null;
    isLoadingSession: boolean;
    handleLoginSuccess: (user: UserProfile) => void;
    handleLogout: () => void;
    handleProfileUpdate: (updates: Partial<UserProfile>) => Promise<void>;
    handleUpgrade: (userId: string) => Promise<void>;
    
    // Page/View Navigation
    setView: (view: 'tutor' | 'pricing') => void;
    view: 'tutor' | 'pricing';
    
    // Tutor/Tab Navigation
    activeTab: IELTSSection;
    setActiveTab: (tab: IELTSSection) => void;
    isSectionLoading: boolean;
    
    // Cross-Component State for Targeted Practice
    targetedPractice: { destination: IELTSSection; payload: any; } | null;
    setTargetedPractice: (practice: { destination: IELTSSection; payload: any; } | null) => void;

    // Session Histories
    writingHistory: WritingSessionSummary[];
    speakingHistory: SpeakingSessionSummary[];
    readingHistory: ReadingSessionSummary[];
    listeningHistory: ListeningSessionSummary[];

    // History Management Functions
    addWritingSession: (session: WritingSessionSummary) => void;
    addSpeakingSession: (session: SpeakingSessionSummary) => void;
    addReadingSession: (session: ReadingSessionSummary) => void;
    addListeningSession: (session: ListeningSessionSummary) => void;
    
    clearAllHistories: () => void;
    clearSpeakingHistory: () => void;
}
