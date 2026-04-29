/**
 * @file This component handles the "Read & Speak" integrated skills task.
 * It displays an academic passage and facilitates a live conversation about it with an AI.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ReadSpeakTask, Turn, SpeakingAnalysis } from '../types';
import { generateIntegratedTask, analyzeSpeakingPerformance } from '../services/geminiService';
import { calculateReadingSkill } from '../services/adaptiveLearningService';
import Loader from './Loader';
import Button from './Button';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from "@google/genai";
import { useAppContext } from '../App';

// -- AUDIO ENCODING/DECODING HELPERS (Adapted from SpeakingTutor) -- //
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
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
function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

type ConnectionState = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

interface ReadSpeakProps {
    onBack: () => void;
}

/**
 * The main component for the "Read & Speak" task.
 * @param {ReadSpeakProps} props - Component props.
 * @returns {React.FC} The rendered component.
 */
const ReadSpeak: React.FC<ReadSpeakProps> = ({ onBack }) => {
    const { currentUser: userProfile, readingHistory } = useAppContext();
    const [task, setTask] = useState<ReadSpeakTask | null>(null);
    const [isLoadingTask, setIsLoadingTask] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Speaking-related state
    const [connectionState, setConnectionState] = useState<ConnectionState>('IDLE');
    const [conversation, setConversation] = useState<Turn[]>([]);
    const [analysis, setAnalysis] = useState<SpeakingAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Refs for API and audio management
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    // FIX: Add ref to track session start time for timestamps.
    const sessionStartTimeRef = useRef<Date | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const outputSources = useRef(new Set<AudioBufferSourceNode>()).current;
    const nextStartTime = useRef(0);
    const currentInputTranscription = useRef('');
    const currentOutputTranscription = useRef('');

    /**
     * Fetches a new reading passage and speaking prompt from the AI.
     */
    const fetchTask = useCallback(async () => {
        if (!userProfile) return;
        setIsLoadingTask(true);
        setError(null);
        setTask(null);
        setConversation([]);
        setAnalysis(null);
        try {
            const adaptiveScore = userProfile.isAdaptiveLearningEnabled ? calculateReadingSkill(readingHistory) : null;
            const difficulty = adaptiveScore ?? userProfile.targetScore;

            const newTask = await generateIntegratedTask('ReadSpeak', difficulty) as ReadSpeakTask;
            setTask(newTask);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to generate a new task.");
        } finally {
            setIsLoadingTask(false);
        }
    }, [userProfile, readingHistory]);

    useEffect(() => {
        fetchTask();
    }, [fetchTask]);
    
    /**
     * Stops the live session and cleans up all audio and API resources.
     */
    const stopSession = useCallback(async (shouldAnalyze: boolean = false) => {
        if (shouldAnalyze) await handleAnalysis();

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
             await inputAudioContextRef.current.close().catch(e => console.warn(e));
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            await outputAudioContextRef.current.close().catch(e => console.warn(e));
        }
        outputSources.forEach(source => {
            try { source.stop() } catch(e) {/* ignore */}
        });
        outputSources.clear();

        if (sessionPromiseRef.current) {
            try {
                const session = await sessionPromiseRef.current;
                session.close();
            } catch (e) { console.error("Error closing session:", e); }
            sessionPromiseRef.current = null;
        }
        
        setConnectionState(prev => prev === 'ERROR' ? prev : 'DISCONNECTED');
    }, [outputSources]);

    // Cleanup on unmount
    useEffect(() => {
      return () => { stopSession(false) };
    }, []);
    
    /**
     * Starts a new live conversation with the AI based on the current task.
     * NOTE: Audio initialization is moved here to satisfy browser autoplay policies.
     */
    const startSession = useCallback(async () => {
        if (!task || connectionState === 'CONNECTED' || connectionState === 'CONNECTING') return;
        setConnectionState('CONNECTING');
        setConversation([]);
        setAnalysis(null);
        setError(null);
        sessionStartTimeRef.current = new Date();
        
        // --- 1. SETUP AUDIO (Must happen synchronously with user gesture) ---
        try {
            // A. Request Microphone Access
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

            // Resume both contexts immediately
            await Promise.all([
                 inputAudioContextRef.current.state === 'suspended' ? inputAudioContextRef.current.resume() : Promise.resolve(),
                 outputAudioContextRef.current.state === 'suspended' ? outputAudioContextRef.current.resume() : Promise.resolve()
            ]);

            // D. Setup Audio Processing Graph
            mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(stream);
            scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                if (!sessionPromiseRef.current) return;
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                
                sessionPromiseRef.current.then((session) => {
                    session.sendRealtimeInput({ media: createBlob(inputData) });
                }).catch(() => {});
            };

            mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputAudioContextRef.current.destination); // Keep processor alive

        } catch (err) {
            console.error("Audio initialization failed:", err);
            setError("Could not access microphone. Please allow permissions and try again.");
            setConnectionState('ERROR');
            stopSession(false);
            return;
        }

        // --- 2. CONNECT TO GEMINI API ---
        try {
            if (!process.env.API_KEY) throw new Error("API Key not found.");
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const systemInstruction = `You are an IELTS examiner named Alex. Your goal is to have a conversation with the user based *only* on the provided reading passage.
            
// CRITICAL LANGUAGE INSTRUCTION:
- The user is practicing for IELTS, which is an English exam.
- You MUST speak, listen, and transcribe strictly in ENGLISH.
- Ignore any non-English speech.
- Interpret all user audio as English.

${task.speakingPrompt}. Do not ask questions unrelated to the passage. Start the conversation naturally based on your prompt.`;

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: async () => {
                        setConnectionState('CONNECTED');
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.outputTranscription) currentOutputTranscription.current += message.serverContent.outputTranscription.text;
                        if (message.serverContent?.inputTranscription) currentInputTranscription.current += message.serverContent.inputTranscription.text;

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

                                    if (fullInput) newTurns.push({ speaker: 'user', text: fullInput, timestamp });
                                    if (fullOutput) newTurns.push({ speaker: 'model', text: fullOutput, timestamp });
                                    return [...prev, ...newTurns];
                                });
                            }
                            currentInputTranscription.current = '';
                            currentOutputTranscription.current = '';
                        }

                        const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (audioData) {
                            if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
                                outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                            }
                            // Attempt to resume if suspended
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
                    onclose: () => { 
                         // Check connection state to avoid overwriting ERROR
                         setConnectionState(prev => prev === 'ERROR' ? prev : 'DISCONNECTED');
                    },
                    onerror: (e) => {
                        console.error("Session error", e);
                        setError(`A connection error occurred. Please try again.`);
                        setConnectionState('ERROR');
                        // Do not immediately stopSession so error persists
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
            
            sessionPromiseRef.current = sessionPromise;
            await sessionPromise;

        } catch (err) {
            console.error("Error starting session:", err);
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            setConnectionState('ERROR');
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(t => t.stop());
            }
        }
    }, [task, connectionState, stopSession, outputSources]);

    /**
     * Analyzes the conversation transcript for speaking performance feedback.
     */
    const handleAnalysis = async () => {
        const userTranscript = conversation.filter(t => t.speaker === 'user').map(t => t.text).join(' ');
        if (!userTranscript.trim()) {
            setError("No user speech was detected to analyze.");
            return;
        }
        setIsAnalyzing(true);
        setError(null);
        try {
            const result = await analyzeSpeakingPerformance(userTranscript, 'Standard');
            setAnalysis(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to get analysis.");
        } finally {
            setIsAnalyzing(false);
        }
    };
    
    if (isLoadingTask) return <div className="flex justify-center items-center h-96"><Loader text="Generating 'Read & Speak' task..." /></div>;
    
    return (
        <div>
            <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
                <Button onClick={onBack} variant="secondary">&larr; Back to Task Selection</Button>
                <Button onClick={fetchTask} variant="secondary" disabled={connectionState === 'CONNECTED'}>Generate New Task</Button>
            </div>
             {error && <div role="alert" className="mb-4 text-red-500 text-center">{error}</div>}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Reading Passage */}
                <div>
                     <h2 className="text-xl font-bold mb-2">{task?.passageTitle}</h2>
                     <div className="prose prose-slate dark:prose-invert max-w-none bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg h-[40rem] overflow-y-auto">
                        <p className="whitespace-pre-wrap">{task?.passage}</p>
                    </div>
                </div>
                {/* Right Column: Speaking Interaction */}
                <div>
                    <h2 className="text-xl font-bold mb-2">Conversation</h2>
                    <div className="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg mb-4">
                        <div className="flex items-center space-x-4">
                            <Button 
                                onClick={startSession} 
                                disabled={connectionState === 'CONNECTED' || connectionState === 'CONNECTING'} 
                                isLoading={connectionState === 'CONNECTING'}
                            >
                                Start Session
                            </Button>
                            <Button onClick={() => stopSession(true)} variant="danger" disabled={connectionState !== 'CONNECTED'}>End & Analyze</Button>
                             <p className="text-sm font-medium text-slate-600 dark:text-slate-400 capitalize">Status: {connectionState}</p>
                        </div>
                    </div>
                    <div role="log" className="bg-white dark:bg-slate-800 rounded-lg p-4 h-96 overflow-y-auto border border-slate-200 dark:border-slate-700">
                        <div className="space-y-4">
                        {conversation.length === 0 && <div className="text-slate-500">Your conversation will appear here...</div>}
                        {conversation.map((turn, index) => (
                            <div key={index} className={`flex ${turn.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-md p-3 rounded-lg ${turn.speaker === 'user' ? 'bg-blue-500 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>
                                    <p>{turn.text}</p>
                                </div>
                            </div>
                        ))}
                        </div>
                    </div>
                     {isAnalyzing && <Loader text="Analyzing performance..." />}
                     {analysis && (
                         <div className="mt-4">
                            <h3 className="text-lg font-semibold">Performance Analysis</h3>
                             <p>Overall Band Score: {analysis.overallBandScore.toFixed(1)}</p>
                            {/* Simple analysis display for now */}
                         </div>
                     )}
                </div>
            </div>
        </div>
    );
};

export default ReadSpeak;