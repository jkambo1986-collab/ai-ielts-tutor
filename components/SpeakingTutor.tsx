/**
 * @file The component for the Speaking practice section.
 * It uses the Gemini Live API for real-time, two-way audio conversation.
 * Manages microphone input, audio playback, and conversation transcription.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from "@google/genai";
import Card from './Card';
import Button from './Button';
import { SpeakingSessionSummary, SpeakingAnalysis, SpeakingFeedbackPoint, Turn, PronunciationDetail, SubscriptionPlan, ContextualSpeakingPrompt, IELTSSection } from '../types';
import { analyzeSpeakingPerformance, endSpeakingSession, generateContextualSpeakingPrompts, startSpeakingSession } from '../services/geminiService';
import { useToast } from './ui/Toast';
import WarmupBanner from './ui/WarmupBanner';
import CrossSkillChip from './ui/CrossSkillChip';
import NextStepBridge from './ui/NextStepBridge';
import ExplainabilityPane from './ui/ExplainabilityPane';
import SessionReplay from './SessionReplay';
import { calculateSpeakingSkill } from '../services/adaptiveLearningService';
import Loader from './Loader';
import { AlertTriangleIcon, MicOffIcon, PowerIcon, SpeakingIcon as MicIcon } from './Icons';
import CollapsibleSection from './CollapsibleSection';
import Modal from './Modal';
import PronunciationStudio from './PronunciationStudio';
import UpgradeModal from './UpgradeModal';
import ConfidenceModal from './dashboard/ConfidenceModal';
import PromptSelectionModal from './PromptSelectionModal';
import Pagination from './Pagination';
import { useAppContext } from '../App';
import MockSessionRunner from './speaking/MockSessionRunner';
import ShadowMode from './speaking/ShadowMode';
import Band7Rephrase from './speaking/Band7Rephrase';
import GroupDebatePlaceholder from './speaking/GroupDebatePlaceholder';
import { speakingClient } from '../services/speakingClient';
import { dashboardService } from '../services/dashboardService';

// -- AUDIO ENCODING/DECODING HELPERS -- //

/** Encodes a Uint8Array into a Base64 string. */
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decodes a Base64 string into a Uint8Array. */
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Decodes raw PCM audio data into an AudioBuffer for playback. */
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/** Converts Float32Array microphone data to a 16-bit PCM Blob for the API. */
function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const s = Math.max(-1, Math.min(1, data[i])); // Clamp to prevent clipping
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF; // Convert to 16-bit integer
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// -- COMPONENT TYPES AND STATE -- //

type ConnectionState = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
type PracticeMode = 'Standard' | 'RolePlay';
type Prompt = { part: string; text: string };

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const ITEMS_PER_PAGE = 5;

/**
 * A sub-component to provide clear visual feedback about the connection status.
 */
const StatusIndicator: React.FC<{ state: ConnectionState }> = ({ state }) => {
    const statusMap = {
        IDLE: {
            text: 'Ready to Practice',
            subtext: 'Click "Start" to begin',
            icon: <PowerIcon className="w-6 h-6" />,
            color: 'text-slate-500 dark:text-slate-400',
            bg: 'bg-slate-50 dark:bg-slate-800',
            border: 'border-slate-200 dark:border-slate-700'
        },
        CONNECTING: {
            text: 'Establishing Connection...',
            subtext: 'Please wait',
            icon: <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>,
            color: 'text-amber-600 dark:text-amber-400',
            bg: 'bg-amber-50 dark:bg-amber-900/20',
            border: 'border-amber-200 dark:border-amber-800'
        },
        CONNECTED: {
            text: 'Live Session Active',
            subtext: 'Listening...',
            icon: <div className="relative flex items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <MicIcon className="relative inline-flex rounded-full h-6 w-6" />
                  </div>,
            color: 'text-green-600 dark:text-green-400',
            bg: 'bg-green-50 dark:bg-green-900/20',
            border: 'border-green-200 dark:border-green-800'
        },
        DISCONNECTED: {
            text: 'Session Ended',
            subtext: 'Ready to start new session',
            icon: <MicOffIcon className="w-6 h-6" />,
            color: 'text-slate-500 dark:text-slate-400',
            bg: 'bg-slate-50 dark:bg-slate-800',
            border: 'border-slate-200 dark:border-slate-700'
        },
        ERROR: {
            text: 'Connection Error',
            subtext: 'Please check your internet',
            icon: <AlertTriangleIcon className="w-6 h-6" />,
            color: 'text-red-600 dark:text-red-400',
            bg: 'bg-red-50 dark:bg-red-900/20',
            border: 'border-red-200 dark:border-red-800'
        },
    };

    const current = statusMap[state];

    return (
        <div className={`flex items-center justify-between p-4 rounded-xl border ${current.bg} ${current.border} transition-all duration-300 shadow-sm w-full max-w-2xl`}>
            <div className="flex items-center space-x-4">
                <div className={`p-3 rounded-full bg-white dark:bg-slate-900/50 shadow-sm ${current.color}`}>
                    {current.icon}
                </div>
                <div>
                    <p className={`font-bold text-lg ${current.color}`}>{current.text}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{current.subtext}</p>
                </div>
            </div>
            {state === 'CONNECTED' && (
                 <div className="flex items-center space-x-1.5 px-3 py-1 bg-white dark:bg-slate-900/50 rounded-full border border-green-200 dark:border-green-800 shadow-sm">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">Live</span>
                 </div>
            )}
        </div>
    );
};


/**
 * The main component for the Speaking Tutor.
 */
const SpeakingTutor: React.FC = () => {
  const {
    currentUser: userProfile,
    speakingHistory,
    readingHistory,
    listeningHistory,
    addSpeakingSession,
    clearSpeakingHistory,
    targetedPractice,
    setTargetedPractice
  } = useAppContext();
  const { toast, update: updateToast } = useToast();
  // Component State
  const [connectionState, setConnectionState] = useState<ConnectionState>('IDLE');
  const [conversation, setConversation] = useState<Turn[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [analyzingSessionId, setAnalyzingSessionId] = useState<string | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState<boolean>(false);
  const [studioAnalysis, setStudioAnalysis] = useState<PronunciationDetail | null>(null);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeFeatureName, setUpgradeFeatureName] = useState('');
  // Confidence prediction (#25): the modal sets `predictionAnsweredRef` to
  // true and stashes the picked value (or null on skip) into
  // `pendingPredictionRef`; startSession then consumes both.
  const pendingPredictionRef = useRef<number | null>(null);
  const predictionAnsweredRef = useRef(false);
  const [predictionModal, setPredictionModal] = useState<{ mode: PracticeMode; prompt: Prompt | null } | null>(null);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [suggestedPrompts, setSuggestedPrompts] = useState<ContextualSpeakingPrompt[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  // Phase 1-5 sub-views
  const [view, setView] = useState<'main' | 'mock' | 'group'>('main');
  const [shadow, setShadow] = useState<{ questions: { id: string; text: string }[] } | null>(null);
  const [rephrase, setRephrase] = useState<{ userText: string; question: string } | null>(null);
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({});
  const [historySearch, setHistorySearch] = useState('');
  const [historyPart, setHistoryPart] = useState<'all' | 'part1' | 'part2' | 'part3'>('all');
  const [replaySession, setReplaySession] = useState<SpeakingSessionSummary | null>(null);


  // Refs to manage API sessions, audio contexts, and other persistent objects
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const activeBackendSessionIdRef = useRef<string | null>(null);
  const sessionStartTimeRef = useRef<Date | null>(null);
  const activeSessionModeRef = useRef<PracticeMode>('Standard');
  const activeSessionPromptRef = useRef<Prompt | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputSources = useRef(new Set<AudioBufferSourceNode>()).current;
  const nextStartTime = useRef(0); // Tracks playback time for seamless audio output
  const inactivityTimerRef = useRef<number | null>(null);
  
  // Performance Optimization: Use a ref to access the latest conversation state in callbacks without adding it to the dependency array.
  const conversationRef = useRef(conversation);
  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);


  // Refs for accumulating transcription text
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  /**
   * Stops the current session and cleans up all resources (microphone, audio contexts, API connection).
   */
  const stopSession = useCallback(async () => {
    // Clear inactivity timer
    if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
    }
    // Save session summary to history before cleaning up
    if (sessionStartTimeRef.current && connectionState === 'CONNECTED') {
      const endTime = new Date();
      const durationInSeconds = Math.round((endTime.getTime() - sessionStartTimeRef.current.getTime()) / 1000);

      if (durationInSeconds > 5) { // Only save sessions longer than 5 seconds
        const currentConversation = conversationRef.current;

        let topic = 'General Conversation';
        if (activeSessionPromptRef.current) {
            topic = activeSessionPromptRef.current.text.substring(0, 70) + (activeSessionPromptRef.current.text.length > 70 ? '...' : '');
        } else {
            const firstModelTurn = currentConversation.find(turn => turn.speaker === 'model');
            if (firstModelTurn) {
                topic = firstModelTurn.text.substring(0, 70) + (firstModelTurn.text.length > 70 ? '...' : '');
            }
        }

        // Persist to backend (and let it run analysis). Use the backend's
        // session_id so the row matches the one created at start-session.
        if (activeBackendSessionIdRef.current) {
            try {
                await endSpeakingSession(
                    activeBackendSessionIdRef.current,
                    currentConversation,
                    durationInSeconds,
                    true /* skip_analysis — done explicitly via Analyze button */,
                );
            } catch (e) {
                console.warn("Failed to persist speaking session to backend:", e);
            }
        }

        const newSession: SpeakingSessionSummary = {
          id: activeBackendSessionIdRef.current || `session-${endTime.toISOString()}`,
          date: sessionStartTimeRef.current.toISOString(),
          durationInSeconds,
          topic,
          prompt: activeSessionPromptRef.current || undefined,
          transcript: currentConversation,
          mode: activeSessionModeRef.current,
        };

        addSpeakingSession(newSession);
        setCurrentPage(1); // Go back to the first page to show the new session
      }
      activeBackendSessionIdRef.current = null;
    }
    sessionStartTimeRef.current = null;
    activeSessionPromptRef.current = null;

    // --- Cleanup ---
    // Stop microphone stream and disconnect audio nodes
    if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
    }
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamSourceRef.current = null;
    
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current.onaudioprocess = null;
        scriptProcessorRef.current = null;
    }

    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
         // We don't necessarily need to close it, but suspending it saves resources. 
         // Closing it is safer to prevent lingering processing.
         await inputAudioContextRef.current.close().catch(e => console.warn("Input context close error:", e));
    }
    
    // Stop and clear any playing audio output
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        await outputAudioContextRef.current.close().catch(e => console.warn("Output context close error:", e));
    }
    outputSources.forEach(source => {
        try { source.stop(); } catch(e) { /* ignore */ }
    });
    outputSources.clear();
    nextStartTime.current = 0;

    // Close the Gemini Live API session
    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        session.close();
      } catch (e) {
        console.error("Error closing session:", e);
      }
      sessionPromiseRef.current = null;
    }
    
    setConnectionState(prev => {
        // If we are already in ERROR state, don't overwrite it with DISCONNECTED
        // so the user can see the error message.
        if (prev === 'ERROR') return prev;
        return 'DISCONNECTED';
    });

    // Reset the prediction gate so the next start fires the modal again (#25).
    predictionAnsweredRef.current = false;
    pendingPredictionRef.current = null;
  }, [outputSources, connectionState, addSpeakingSession]);

  // Timeout logic
  const handleSessionTimeout = useCallback(() => {
    setError("Your session has timed out due to inactivity.");
    stopSession();
  }, [stopSession]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = window.setTimeout(handleSessionTimeout, INACTIVITY_TIMEOUT);
  }, [handleSessionTimeout]);

  // Effect to ensure cleanup runs when the component unmounts
  useEffect(() => {
    return () => {
      // We can't use stopSession here directly because it changes on every render.
      // But we can cleanup resources.
      if (sessionPromiseRef.current) {
          sessionPromiseRef.current.then(s => s.close()).catch(e => console.error(e));
      }
      if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  /**
   * Determines the appropriate difficulty score based on user settings and performance history.
   * @returns {number} The band score to use for generating content.
   */
  const getDifficultyScore = useCallback((): number => {
      if (!userProfile || !userProfile.isAdaptiveLearningEnabled) {
        return userProfile?.targetScore || 7.0;
      }
    
    // Use the history from the state, as it's already loaded
    const adaptiveScore = calculateSpeakingSkill(speakingHistory);

    return adaptiveScore ?? userProfile.targetScore;
  }, [userProfile, speakingHistory]);

  /**
   * Starts a new speaking session by connecting to the Gemini Live API.
   * NOTE: Audio Context initialization is moved here to satisfy browser autoplay policies.
   */
  const startSession = useCallback(async (mode: PracticeMode, prompt: Prompt | null = null) => {
    if (userProfile?.plan !== SubscriptionPlan.Pro && mode === 'RolePlay') {
        setUpgradeFeatureName('Role-Play Mode');
        setIsUpgradeModalOpen(true);
        return;
    }
    // Prevent starting if already connecting/connected
    if (connectionState === 'CONNECTING' || connectionState === 'CONNECTED') return;

    // First time through: open the prediction modal and bail. The modal's
    // onConfirm/onSkip flip `predictionAnsweredRef` and call startSession again
    // — which falls through this gate the second time.
    if (!predictionAnsweredRef.current) {
        setPredictionModal({ mode, prompt });
        return;
    }

    setConnectionState('CONNECTING');
    setConversation([]);
    setError(null);
    sessionStartTimeRef.current = new Date();
    activeSessionModeRef.current = mode;
    activeSessionPromptRef.current = prompt;

    // --- 1. SETUP AUDIO (Must happen synchronously with user gesture) ---
    try {
        // A. Request Microphone Access first
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        // B. Initialize & Resume Input Context (16kHz for Gemini)
        if (!inputAudioContextRef.current || inputAudioContextRef.current.state === 'closed') {
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        }
        
        // C. Initialize & Resume Output Context (24kHz for Gemini)
        if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        } 

        // CRITICAL: Resume contexts immediately within this user gesture handler
        await Promise.all([
            inputAudioContextRef.current.state === 'suspended' ? inputAudioContextRef.current.resume() : Promise.resolve(),
            outputAudioContextRef.current.state === 'suspended' ? outputAudioContextRef.current.resume() : Promise.resolve(),
        ]);

        // D. Setup Audio Processing Graph
        // Note: scriptProcessor is deprecated but widely used for raw PCM access. AudioWorklet is preferred for new apps but requires secure context and separate files.
        mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(stream);
        scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
        
        scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
            // Only send data if the session is fully established and valid
            if (!sessionPromiseRef.current) return;

            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            
            sessionPromiseRef.current.then((session) => {
               // Only send if the session is still open (some basic check)
               session.sendRealtimeInput({ media: pcmBlob });
            }).catch((err) => {
               // Ignore errors during buffer processing to avoid flooding logs
            });
        };

        // Connect graph
        mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
        scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);

    } catch (err) {
        console.error("Audio initialization failed:", err);
        setError("Could not access microphone. Please ensure you have allowed microphone permissions in your browser settings.");
        setConnectionState('ERROR');
        stopSession(); // Clean up any partial setup
        return;
    }

    // --- 2. CONNECT TO GEMINI API ---
    try {
      // Mint live-session credentials from the backend. In dev (AI Studio mode)
      // this returns the Gemini API key; in prod (Vertex) it'll be a short-lived
      // ephemeral token. Either way the FE never reads from process.env.
      // Map a prompt's part label ("Part 1" | "Part 2" | "Part 3") to the
      // backend's enum value. RolePlay mode and free-form prompts → 'mixed'.
      const partKey: 'part1' | 'part2' | 'part3' | 'mixed' = (() => {
        if (!prompt?.part) return 'mixed';
        if (prompt.part.includes('1')) return 'part1';
        if (prompt.part.includes('2')) return 'part2';
        if (prompt.part.includes('3')) return 'part3';
        return 'mixed';
      })();
      // Re-attempt parent (#21) and prediction (#25) — both consumed once.
      let parentSessionId: string | null = null;
      try { parentSessionId = localStorage.getItem('reattempt_parent_speaking'); } catch { /* ignore */ }
      const predictedBand = pendingPredictionRef.current;
      pendingPredictionRef.current = null;

      const session = await startSpeakingSession(
        mode,
        prompt?.text,
        prompt ? { part: prompt.part, text: prompt.text } : undefined,
        { part: partKey, predictedBand, parentSessionId },
      );
      if (parentSessionId) {
        try { localStorage.removeItem('reattempt_parent_speaking'); } catch { /* ignore */ }
      }
      activeBackendSessionIdRef.current = session.session_id;
      const liveApiKey = session.live.api_key;
      if (!liveApiKey) {
        throw new Error("Live session credentials not available — check backend configuration.");
      }

      const difficultyScore = getDifficultyScore();
      
      const languageDirective = `
// CRITICAL LANGUAGE INSTRUCTION:
- The user is practicing for IELTS, which is an English exam.
- You MUST speak, listen, and transcribe strictly in ENGLISH.
- Ignore any non-English speech or background noise.
- If the user's input is unclear, interpret it as English words closest to the sound.
- NEVER detect, transcribe, or respond in Hindi, Japanese, or any other language.
`;

      let systemInstruction = '';
      if (mode === 'RolePlay') {
        systemInstruction = `// SYSTEM DIRECTIVE: ACTIVATE IELTS ROLE-PLAY PROTOCOL
Persona: \`Δ-IELTS_DEBATER v1.0\`
Core Directive: You are a world-class IELTS speaking examiner named Alex, conducting a dynamic Part 3 role-play session. Your goal is to create a genuine debate, not a simple Q&A.
${languageDirective}
// PROTOCOL:
1. Initiate the conversation by setting up a scenario and stating a controversial opinion on an abstract topic.
2. Do NOT just ask a list of questions. Actively listen to the user's arguments, challenge their points politely, and provide well-reasoned counter-arguments.
// USER DATA:
Target Band Score: ${difficultyScore.toFixed(1)}`;
      } else {
        systemInstruction = `// SYSTEM DIRECTIVE: ACTIVATE IELTS TUTOR PROTOCOL
Persona: \`Δ-IELTS_MASTER v8.0\`
Core Directive: You are a world-class IELTS speaking examiner named Alex. Your purpose is to conduct a realistic, adaptive mock speaking test.
${languageDirective}
// PROTOCOL:
${prompt 
  ? `1. You MUST begin the conversation by asking the user the following IELTS ${prompt.part} question verbatim: "${prompt.text}".`
  : `1. Greet the user and start with Part 1 questions about their hometown or a familiar topic.`
}
3. Maintain a professional but encouraging tone.
// USER DATA:
Target Band Score: ${difficultyScore.toFixed(1)}`;
      }
      
      const ai = new GoogleGenAI({ apiKey: liveApiKey });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setConnectionState('CONNECTED');
            resetInactivityTimer();
          },
          onmessage: async (message: LiveServerMessage) => {
            // Process transcription
            if (message.serverContent?.outputTranscription) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            } else if (message.serverContent?.inputTranscription) {
              if (message.serverContent.inputTranscription.text) {
                  resetInactivityTimer();
              }
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
            }

            // Handle turn complete for transcript
            if (message.serverContent?.turnComplete) {
              const fullInput = currentInputTranscription.current.trim();
              const fullOutput = currentOutputTranscription.current.trim();
              
              if (fullInput || fullOutput) {
                  setConversation(prev => {
                      const newTurns: Turn[] = [];
                      const now = new Date();
                      const elapsedSeconds = sessionStartTimeRef.current ? Math.round((now.getTime() - sessionStartTimeRef.current.getTime()) / 1000) : 0;
                      const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
                      const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
                      const timestamp = `${minutes}:${seconds}`;

                      if(fullInput) newTurns.push({ speaker: 'user', text: fullInput, timestamp });
                      if(fullOutput) newTurns.push({ speaker: 'model', text: fullOutput, timestamp });
                      
                      return [...prev, ...newTurns];
                  });
              }
              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
            }

            // Handle Audio Output
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
               if(!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
                   outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
               }
               // Safety resume
               if (outputAudioContextRef.current.state === 'suspended') {
                   await outputAudioContextRef.current.resume().catch(e => console.error(e));
               }

               const audioBuffer = await decodeAudioData(decode(audioData), outputAudioContextRef.current, 24000, 1);
               nextStartTime.current = Math.max(nextStartTime.current, outputAudioContextRef.current.currentTime);
               
               const source = outputAudioContextRef.current.createBufferSource();
               source.buffer = audioBuffer;
               source.connect(outputAudioContextRef.current.destination);
               source.addEventListener('ended', () => outputSources.delete(source));
               source.start(nextStartTime.current);
               nextStartTime.current += audioBuffer.duration;
               outputSources.add(source);
            }
          },
          onclose: (e) => {
             // If we are not in ERROR state, user or server closed it cleanly.
             // If the server closed it unexpectedly, it often comes with a code.
             console.log("Session closed", e);
             // Ensure we update UI to disconnected
             setConnectionState(prev => prev === 'ERROR' ? prev : 'DISCONNECTED');
          },
          onerror: (e: ErrorEvent) => {
            console.error("Live session error:", e);
            setError(`Connection failed. Please check your internet.`);
            setConnectionState('ERROR');
            // We do NOT call stopSession here immediately to let the error state render
            // But we must clean up resources.
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(t => t.stop());
            }
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {}, 
          outputAudioTranscription: {},
          systemInstruction,
        }
      });
      
      // Assign promise to ref so audio processor can use it
      sessionPromiseRef.current = sessionPromise;

      // Wait for connection to actually establish to catch immediate failures
      await sessionPromise;
      
    } catch (err) {
      console.error("Failed to start speaking session:", err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred while starting the session.');
      setConnectionState('ERROR');
      // Ensure cleanup if initial connection throws
      if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    }
  }, [connectionState, getDifficultyScore, outputSources, resetInactivityTimer, stopSession, userProfile?.plan]);

  /**
   * Effect to handle incoming targeted practice sessions from the global context.
   */
  useEffect(() => {
    if (targetedPractice && targetedPractice.destination === IELTSSection.Speaking) {
      const { payload } = targetedPractice;
      // The payload from the function call should be { part: string, text: string }
      if (payload && payload.part && payload.text) {
        // For a better UX, one might show a confirmation modal here.
        // For this implementation, we start the session directly.
        startSession('Standard', payload as Prompt);
      }
      // Clear the targeted practice state so it doesn't trigger again on re-render.
      setTargetedPractice(null);
    }
  }, [targetedPractice, setTargetedPractice, startSession]);


  /**
   * Analyzes a session's transcript for performance feedback.
   * @param {string} sessionId - The ID of the session to analyze.
   */
  const handleAnalyzePerformance = async (sessionId: string) => {
    const sessionToAnalyze = speakingHistory.find(s => s.id === sessionId);
    if (!sessionToAnalyze) return;

    setAnalyzingSessionId(sessionId);
    setError(null);
    const progressId = toast({ title: 'Analyzing your speaking…', body: 'Examiner pass over your transcript.', kind: 'info', durationMs: 60000 });
    try {
        const userTranscript = sessionToAnalyze.transcript
            .filter(turn => turn.speaker === 'user')
            .map(turn => turn.text)
            .join(' ');

        if (!userTranscript.trim()) {
            throw new Error("No user speech was detected in this session to analyze.");
        }

        const mode = sessionToAnalyze.mode || 'Standard';
        // Pass the backend session id so the analysis is persisted on the row.
        // The session id is the backend UUID set in stopSession (or a local
        // ISO-string fallback if backend persistence failed at end-time).
        const sessionIdForBackend = /^[0-9a-f-]{36}$/i.test(sessionId) ? sessionId : undefined;
        const { analysis: feedback, cardsAdded } = await analyzeSpeakingPerformance(userTranscript, mode, sessionIdForBackend);

        // Create an updated session object with the new analysis
        const updatedSession = { ...sessionToAnalyze, speakingAnalysis: feedback };

        // Use the context's add function, which handles updates
        addSpeakingSession(updatedSession);

        if (cardsAdded > 0) {
            updateToast(progressId, {
                title: `Analysis ready · ${cardsAdded} review card${cardsAdded === 1 ? '' : 's'} added`,
                body: 'Find them under SRS in your dashboard.',
                kind: 'success',
                durationMs: 5000,
            });
        } else {
            updateToast(progressId, { title: 'Analysis ready', kind: 'success', durationMs: 2500 });
        }
    } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to get performance analysis.");
        updateToast(progressId, {
            title: 'Could not analyze',
            body: err instanceof Error ? err.message : '',
            kind: 'error',
            durationMs: 5000,
        });
    } finally {
        setAnalyzingSessionId(null);
    }
  };

  /**
   * Opens the Pronunciation Studio modal with the relevant analysis data.
   * @param {PronunciationDetail} analysis - The detailed pronunciation feedback from the AI.
   */
  const handlePracticePronunciation = (analysis: PronunciationDetail) => {
    if (userProfile?.plan !== SubscriptionPlan.Pro) {
        setUpgradeFeatureName('Pronunciation Studio');
        setIsUpgradeModalOpen(true);
        return;
    }
    setStudioAnalysis(analysis);
    setIsStudioOpen(true);
  };
  
  // New handler for opening the prompt modal and fetching suggestions
  const handleOpenPromptModal = useCallback(async () => {
    setIsPromptModalOpen(true);
    const hasHistory = readingHistory.length > 0 || listeningHistory.length > 0;
    if (hasHistory) {
      setIsLoadingSuggestions(true);
      try {
        const prompts = await generateContextualSpeakingPrompts(readingHistory, listeningHistory);
        setSuggestedPrompts(prompts);
      } catch (err) {
        console.error("Failed to fetch suggested prompts:", err);
        // Fail silently, the modal will still show standard prompts.
      } finally {
        setIsLoadingSuggestions(false);
      }
    }
  }, [readingHistory, listeningHistory]);

  // C2 history search/filter
  const filteredHistory = speakingHistory.filter(s => {
    if (historyPart !== 'all') {
        // Match against the cached SpeakingSessionSummary.mode/topic — best-effort
        // since the legacy summary doesn't have a `part` field.
        const haystack = `${s.topic ?? ''} ${s.mode ?? ''}`.toLowerCase();
        if (!haystack.includes(historyPart)) return false;
    }
    if (historySearch.trim()) {
        const q = historySearch.toLowerCase();
        if (!(s.topic ?? '').toLowerCase().includes(q) &&
            !(s.transcript || []).some(t => (t.text || '').toLowerCase().includes(q))) {
            return false;
        }
    }
    return true;
  });
  const totalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE);
  const paginatedHistory = filteredHistory.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
  );

  const generateShareLink = async (sessionId: string) => {
      try {
          const link = await dashboardService.createShareLink({ scope: 'session', period_days: 30, ttl_days: 30 });
          setShareLinks(prev => ({ ...prev, [sessionId]: link.url }));
          try { await navigator.clipboard.writeText(link.url); } catch { /* ignore */ }
      } catch (e) {
          console.warn('Share-link create failed', e);
      }
  };

  const exportTranscript = (sessionId: string, fmt: 'pdf' | 'docx' | 'txt') => {
      // Export endpoint requires JWT — we can't open a download tab without
      // re-attaching auth. Easiest: use an `<a>` to a backend endpoint that
      // reads the cookie/token. Since this app uses Bearer in localStorage,
      // we use fetch + blob to download.
      const url = speakingClient.exportUrl(sessionId, fmt);
      fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('ielts_access_token') ?? ''}`, 'X-Institute-Slug': (import.meta.env.VITE_DEFAULT_INSTITUTE_SLUG as string | undefined) ?? 'default' } })
          .then(r => r.blob())
          .then(blob => {
              const dlUrl = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = dlUrl;
              a.download = `speaking_${sessionId}.${fmt}`;
              a.click();
              URL.revokeObjectURL(dlUrl);
          })
          .catch(() => undefined);
  };

  if (!userProfile) return null;

  // Sub-views render before the main flow.
  if (view === 'mock') {
      return <MockSessionRunner onClose={() => setView('main')} />;
  }
  if (view === 'group') {
      return <GroupDebatePlaceholder onClose={() => setView('main')} />;
  }

  return (
    <>
      {connectionState === 'IDLE' && <WarmupBanner sessionType="speaking" />}
      {connectionState === 'IDLE' && (
        <CrossSkillChip
          mode="speaking"
          onSelect={() => { /* speaking starts via mode buttons; chip just nudges the topic */ }}
        />
      )}
      <Card>
        <div className="flex flex-col items-center mb-6">
            <h2 className="text-2xl font-bold mb-2">Speaking Practice</h2>
            <p className="text-slate-600 dark:text-slate-400 text-center max-w-2xl">
              Choose a practice mode below. "General" is a typical Q&A, while "Role-play" is a dynamic debate for Part 3 practice.
            </p>
        </div>

        <div className="space-y-4">
          {/* -- Session Controls -- */}
          <CollapsibleSection title="Session Controls & Status" defaultOpen>
              <div className="flex flex-col items-center space-y-6">
                  <StatusIndicator state={connectionState} />
                  {error && (
                      <div role="alert" className="w-full max-w-2xl p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-800 dark:text-red-300 text-center">
                          <p className="font-semibold">Error</p>
                          <p>{error}</p>
                      </div>
                  )}
                  <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-3 sm:space-y-0 pt-2 flex-wrap justify-center gap-2 w-full max-w-3xl">
                      <Button 
                          onClick={() => startSession('Standard')} 
                          disabled={connectionState === 'CONNECTING' || connectionState === 'CONNECTED'}
                          isLoading={connectionState === 'CONNECTING'}
                      >
                          General Conversation
                      </Button>
                       <Button 
                          onClick={handleOpenPromptModal}
                          variant="secondary"
                          disabled={connectionState === 'CONNECTING' || connectionState === 'CONNECTED'}
                      >
                          Practice with a Prompt
                      </Button>
                      <Button 
                          onClick={() => startSession('RolePlay')} 
                          variant="secondary"
                          disabled={connectionState === 'CONNECTING' || connectionState === 'CONNECTED'}
                          isLoading={connectionState === 'CONNECTING'}
                      >
                          Role-play Practice
                          {userProfile.plan !== SubscriptionPlan.Pro && <span className="ml-2 text-xs bg-amber-400 text-amber-900 font-bold px-1.5 py-0.5 rounded-full">PRO</span>}
                      </Button>
                      <Button
                          onClick={() => setView('mock')}
                          disabled={connectionState === 'CONNECTING' || connectionState === 'CONNECTED'}
                      >
                          IELTS Mock Test
                      </Button>
                      <Button
                          onClick={() => setView('group')}
                          variant="secondary"
                          disabled={connectionState === 'CONNECTING' || connectionState === 'CONNECTED'}
                      >
                          Group Debate
                      </Button>
                      <Button
                          onClick={() => stopSession()}
                          variant="danger"
                          disabled={connectionState !== 'CONNECTED' && connectionState !== 'CONNECTING'}
                      >
                          End Session
                      </Button>
                  </div>
              </div>
          </CollapsibleSection>

          {/* -- Live Transcript -- */}
          <CollapsibleSection title="Live Transcript" defaultOpen>
              <div role="log" aria-live="polite" className="bg-white dark:bg-slate-800 rounded-lg p-4 h-[32rem] overflow-y-auto border border-slate-200 dark:border-slate-700">
                  <div className="space-y-4">
                  {conversation.length === 0 && connectionState !== 'CONNECTING' && (
                      <div className="flex items-center justify-center h-full text-slate-500">
                      Your conversation will appear here...
                      </div>
                  )}
                  {connectionState === 'CONNECTING' && (
                      <div className="flex items-center justify-center h-full text-slate-500">
                      Connecting to the live session...
                      </div>
                  )}
                  {conversation.map((turn, index) => (
                      <div key={index} className={`flex ${turn.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-md p-3 rounded-lg ${turn.speaker === 'user' ? 'bg-blue-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'}`}>
                          <div className="flex justify-between items-center gap-4 mb-1">
                              <p className="font-bold text-sm capitalize">{turn.speaker}</p>
                              <p className={`text-xs ${turn.speaker === 'user' ? 'text-blue-200' : 'text-slate-500 dark:text-slate-400'}`}>{turn.timestamp}</p>
                          </div>
                          <p>{turn.text}</p>
                      </div>
                      </div>
                  ))}
                  </div>
              </div>
          </CollapsibleSection>

          {/* -- Session History -- */}
          <CollapsibleSection title="Session History">
              {speakingHistory.length > 0 && (
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                      <input
                          type="text"
                          value={historySearch}
                          onChange={(e) => setHistorySearch(e.target.value)}
                          placeholder="Search topic or transcript…"
                          className="flex-1 min-w-[180px] text-sm px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <select
                          value={historyPart}
                          onChange={(e) => setHistoryPart(e.target.value as 'all' | 'part1' | 'part2' | 'part3')}
                          className="text-sm px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                          <option value="all">All parts</option>
                          <option value="part1">Part 1</option>
                          <option value="part2">Part 2</option>
                          <option value="part3">Part 3</option>
                      </select>
                      <Button onClick={clearSpeakingHistory} variant="secondary" className="px-3 py-1.5 text-sm">Clear History</Button>
                  </div>
              )}
              <div className="bg-slate-100 dark:bg-slate-900/50 rounded-lg">
                  {speakingHistory.length === 0 ? (
                      <p className="text-center text-slate-500 p-4">Your past sessions will be shown here.</p>
                  ) : (
                      <>
                        <ul className="space-y-4 p-4">
                            {paginatedHistory.map(session => (
                                <li key={session.id} className="p-4 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                                <div className="flex justify-between items-start gap-4">
                                        <div>
                                            <p className="font-semibold">{new Date(session.date).toLocaleString()}</p>
                                            {session.prompt ? (
                                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                                    <span className="font-semibold">Prompt ({session.prompt.part}):</span> {session.topic}
                                                </p>
                                            ) : (
                                                <p className="text-sm text-slate-600 dark:text-slate-400 truncate">Topic: {session.topic}</p>
                                            )}
                                            <div className="flex items-center gap-2 mt-2">
                                                {session.speakingAnalysis && (
                                                <div className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 px-2 py-1 rounded-full inline-block">
                                                    Score: {session.speakingAnalysis.overallBandScore.toFixed(1)}
                                                </div>
                                                )}
                                                <div className="text-xs font-medium text-slate-500 bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded-full inline-block">
                                                    Mode: {session.mode || 'Standard'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0 space-y-2">
                                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{Math.floor(session.durationInSeconds / 60)}m {session.durationInSeconds % 60}s</p>
                                            {!session.speakingAnalysis && (
                                                <Button
                                                    onClick={() => handleAnalyzePerformance(session.id)}
                                                    isLoading={analyzingSessionId === session.id}
                                                    variant="secondary"
                                                    className="mt-2 px-2 py-1 text-xs"
                                                >
                                                    Analyze Performance
                                                </Button>
                                            )}
                                            <div className="flex flex-col items-end gap-1 text-[11px]">
                                                <button onClick={() => exportTranscript(session.id, 'pdf')} className="text-blue-600 dark:text-blue-400 hover:underline">Export PDF</button>
                                                <button onClick={() => exportTranscript(session.id, 'docx')} className="text-blue-600 dark:text-blue-400 hover:underline">Export DOCX</button>
                                                <button onClick={() => generateShareLink(session.id)} className="text-blue-600 dark:text-blue-400 hover:underline">
                                                    {shareLinks[session.id] ? 'Link copied ✓' : 'Share link'}
                                                </button>
                                                <button onClick={() => setReplaySession(session)} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                                                    Replay
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        try { localStorage.setItem('reattempt_parent_speaking', session.id); } catch { /* ignore */ }
                                                    }}
                                                    className="text-amber-600 dark:text-amber-400 hover:underline"
                                                >
                                                    Mark for re-attempt
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const userTurns = (session.transcript || []).filter(t => t.speaker === 'user');
                                                        const modelTurns = (session.transcript || []).filter(t => t.speaker === 'model');
                                                        const questions = modelTurns
                                                            .filter(t => /\?\s*$/.test(t.text))
                                                            .map((t, i) => ({ id: `q-${i}`, text: t.text }));
                                                        if (questions.length === 0 && userTurns.length > 0) {
                                                            questions.push({ id: 'q-0', text: session.topic || 'Re-do an answer' });
                                                        }
                                                        if (questions.length) setShadow({ questions });
                                                    }}
                                                    className="text-emerald-600 dark:text-emerald-400 hover:underline"
                                                >
                                                    Shadow mode
                                                </button>
                                            </div>
                                        </div>
                                </div>
                                {shareLinks[session.id] && (
                                    <div className="mt-2 text-[11px] text-slate-500 truncate" title={shareLinks[session.id]}>
                                        {shareLinks[session.id]}
                                    </div>
                                )}
                                {/* C1: per-turn actions */}
                                {(session.transcript || []).length > 0 && (
                                    <details className="mt-3 text-xs">
                                        <summary className="cursor-pointer text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Show transcript with actions</summary>
                                        <ul className="mt-2 space-y-2">
                                            {(session.transcript || []).filter(t => t.speaker === 'user').map((turn, idx) => (
                                                <li key={idx} className="flex items-start justify-between gap-3 border-l-2 border-blue-500 pl-3">
                                                    <p className="flex-1 text-slate-700 dark:text-slate-200"><span className="text-[10px] text-slate-400">{turn.timestamp}</span> {turn.text}</p>
                                                    <div className="flex gap-2 text-[10px] flex-shrink-0">
                                                        <button onClick={() => setRephrase({ userText: turn.text, question: '' })} className="text-emerald-600 dark:text-emerald-400 hover:underline">Band-7</button>
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    await dashboardService.createErrorCard({
                                                                        source_session_type: 'speaking',
                                                                        source_session_id: session.id,
                                                                        category: 'fluency',
                                                                        error_text: turn.text,
                                                                    });
                                                                } catch { /* ignore */ }
                                                            }}
                                                            className="text-amber-600 dark:text-amber-400 hover:underline"
                                                        >
                                                            Add to error log
                                                        </button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                )}
                                {analyzingSessionId === session.id && <div className="mt-3"><Loader text="Analyzing..." /></div>}
                                {session.speakingAnalysis && (
                                        <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-3">
                                            <h4 className="text-sm font-semibold mb-2">Performance Analysis:</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <SpeakingFeedbackBlock title="Fluency & Coherence" data={session.speakingAnalysis.fluencyAndCoherence} />
                                                <SpeakingFeedbackBlock title="Lexical Resource" data={session.speakingAnalysis.lexicalResource} />
                                                <SpeakingFeedbackBlock title="Grammatical Range & Accuracy" data={session.speakingAnalysis.grammaticalRangeAndAccuracy} />
                                                <SpeakingFeedbackBlock 
                                                    title="Pronunciation" 
                                                    data={session.speakingAnalysis.pronunciation}
                                                    pronunciationAnalysis={session.speakingAnalysis.pronunciationAnalysis}
                                                    onPracticeClick={handlePracticePronunciation}
                                                    isProUser={userProfile.plan === SubscriptionPlan.Pro}
                                                />
                                                {session.speakingAnalysis.argumentativeSkills && (
                                                    <SpeakingFeedbackBlock title="Argumentative Skills" data={session.speakingAnalysis.argumentativeSkills} />
                                                )}
                                            </div>
                                            <ExplainabilityPane
                                                skill="speaking"
                                                band={session.speakingAnalysis.overallBandScore}
                                                speaking={{ transcript: session.transcript || [] }}
                                            />
                                            <NextStepBridge
                                                fromSection={IELTSSection.Speaking}
                                                topic={session.topic}
                                            />
                                        </div>
                                )}
                                </li>
                            ))}
                        </ul>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={setCurrentPage}
                            itemsPerPage={ITEMS_PER_PAGE}
                            totalItems={speakingHistory.length}
                        />
                      </>
                  )}
              </div>
          </CollapsibleSection>
        </div>
      </Card>
      
      <PromptSelectionModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
        onSelectPrompt={(prompt) => startSession('Standard', prompt)}
        suggestedPrompts={suggestedPrompts}
        isLoadingSuggestions={isLoadingSuggestions}
      />

      {shadow && (
        <Modal isOpen={!!shadow} onClose={() => setShadow(null)} title="Shadow mode">
          <ShadowMode questions={shadow.questions} onClose={() => setShadow(null)} />
        </Modal>
      )}
      {rephrase && (
        <Modal isOpen={!!rephrase} onClose={() => setRephrase(null)} title="Band-7 rephrase">
          <Band7Rephrase userText={rephrase.userText} question={rephrase.question} onClose={() => setRephrase(null)} />
        </Modal>
      )}

      <Modal
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
        title="Pronunciation & Intonation Studio"
      >
        {studioAnalysis && <PronunciationStudio analysis={studioAnalysis} />}
      </Modal>
      
      {replaySession && (
        <SessionReplay
            open={!!replaySession}
            onClose={() => setReplaySession(null)}
            sessionId={replaySession.id}
            transcript={replaySession.transcript || []}
            title={`Replay: ${replaySession.topic}`}
        />
      )}

      <UpgradeModal
          isOpen={isUpgradeModalOpen}
          onClose={() => setIsUpgradeModalOpen(false)}
          featureName={upgradeFeatureName}
      />

      <ConfidenceModal
          open={!!predictionModal}
          title="What band do you expect on this conversation?"
          onConfirm={(b) => {
              const ctx = predictionModal;
              setPredictionModal(null);
              pendingPredictionRef.current = b;
              predictionAnsweredRef.current = true;
              if (ctx) startSession(ctx.mode, ctx.prompt);
          }}
          onSkip={() => {
              const ctx = predictionModal;
              setPredictionModal(null);
              pendingPredictionRef.current = null;
              predictionAnsweredRef.current = true;
              if (ctx) startSession(ctx.mode, ctx.prompt);
          }}
      />
    </>
  );
};

/**
 * A sub-component to display feedback for a single speaking criterion.
 */
const SpeakingFeedbackBlock: React.FC<{
    title: string; 
    data: SpeakingFeedbackPoint;
    pronunciationAnalysis?: PronunciationDetail;
    onPracticeClick?: (analysis: PronunciationDetail) => void;
    isProUser?: boolean;
}> = React.memo(({title, data, pronunciationAnalysis, onPracticeClick, isProUser}) => (
  <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded h-full flex flex-col justify-between">
    <div>
      <h5 className="font-semibold text-slate-800 dark:text-slate-200">{title}</h5>
      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{data.feedback}</p>
      {data.example && (
        <p className="text-sm text-slate-500 dark:text-slate-300 mt-2 border-l-2 border-blue-500 pl-2 italic">
          e.g., "{data.example}"
        </p>
      )}
    </div>
    {pronunciationAnalysis && onPracticeClick && (
        <div className="mt-3 text-right">
            <Button 
                variant="primary" 
                className="px-3 py-1.5 text-xs"
                onClick={() => onPracticeClick(pronunciationAnalysis)}
            >
                Practice Pronunciation
                {!isProUser && <span className="ml-2 text-xs bg-amber-400 text-amber-900 font-bold px-1.5 py-0.5 rounded-full">PRO</span>}
            </Button>
        </div>
    )}
  </div>
));


export default SpeakingTutor;