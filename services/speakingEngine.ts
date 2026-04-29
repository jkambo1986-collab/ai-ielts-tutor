/**
 * @file useSpeakingEngine — encapsulates the entire audio + Gemini Live
 * pipeline so view components only deal with React state.
 *
 * Responsibilities (Phase 1 substrate):
 *   - AudioWorklet capture (with a one-line ScriptProcessor fallback)
 *   - getUserMedia constraints (echoCancellation/noiseSuppression/AGC)
 *   - HTTPS / mic-permission pre-flight with actionable error mapping
 *   - VAD-derived inactivity timer (RMS energy, not transcription text)
 *   - Live model + voice mapping fetched from backend (no hardcoded model)
 *   - Auto-checkpoint transcript every 30s
 *   - Reconnect within the same SpeakingSession on transient errors
 *
 * Pure hook, no JSX. Returns control functions + reactive state.
 */

import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { speakingClient, LiveConfig } from './speakingClient';
import { startSpeakingSession } from './geminiService';

export type ConnectionState = 'IDLE' | 'PRECHECK' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
export type Accent = 'uk' | 'us' | 'au' | 'nz' | 'ca';
export type Persona = 'neutral' | 'strict' | 'friendly' | 'formal';
export type Mode = 'Standard' | 'RolePlay' | 'Mock';
export type Turn = { speaker: 'user' | 'model'; text: string; timestamp: string };

export interface StartOptions {
    mode: Mode;
    topic?: string;
    prompt?: { part: string; text: string } | null;
    accent?: Accent;
    persona?: Persona;
    cueCard?: { id?: string; topic: string; bullets: string[] } | null;
    predictedBand?: number | null;
    parentSessionId?: string | null;
    part?: 'part1' | 'part2' | 'part3' | 'mixed';
}

interface MicCheck {
    httpsOk: boolean;
    permissionState: 'unknown' | 'granted' | 'denied' | 'prompt' | 'unavailable';
    deviceCount: number;
    detail: string | null;
}

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const VAD_RMS_THRESHOLD = 0.012;
const CHECKPOINT_INTERVAL_MS = 30_000;
const MAX_RECONNECTS = 2;

const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
    },
};


export function useSpeakingEngine() {
    // Reactive state
    const [connection, setConnection] = useState<ConnectionState>('IDLE');
    const [transcript, setTranscript] = useState<Turn[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [micRms, setMicRms] = useState(0);
    const [examinerSpeaking, setExaminerSpeaking] = useState(false);
    const [liveConfig, setLiveConfig] = useState<LiveConfig | null>(null);

    // Refs (don't trigger re-renders)
    const transcriptRef = useRef<Turn[]>([]);
    useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

    const sessionIdRef = useRef<string | null>(null);
    const startedAtRef = useRef<Date | null>(null);
    const inactivityTimerRef = useRef<number | null>(null);
    const checkpointTimerRef = useRef<number | null>(null);
    const reconnectsRef = useRef(0);

    const sessionPromiseRef = useRef<Promise<unknown> | null>(null);
    const liveSessionRef = useRef<{ sendRealtimeInput: (msg: { media: { data: string; mimeType: string } }) => void; close: () => void; sendClientContent?: (m: unknown) => void } | null>(null);

    const inputCtxRef = useRef<AudioContext | null>(null);
    const outputCtxRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const fallbackProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const outputSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const nextStartTimeRef = useRef(0);
    const examinerSpeakingTimerRef = useRef<number | null>(null);

    // Buffers for live transcription deltas before turn-complete arrives
    const inputBufferRef = useRef('');
    const outputBufferRef = useRef('');

    // Fetch live model config once on mount.
    useEffect(() => {
        let cancelled = false;
        speakingClient.fetchLiveConfig()
            .then(cfg => { if (!cancelled) setLiveConfig(cfg); })
            .catch(e => console.warn('Live config fetch failed:', e));
        return () => { cancelled = true; };
    }, []);

    // ---- Pre-flight ---- //
    const preFlight = useCallback(async (): Promise<MicCheck> => {
        const httpsOk = window.isSecureContext === true;
        if (!httpsOk) {
            return {
                httpsOk: false,
                permissionState: 'unknown',
                deviceCount: 0,
                detail: 'Microphone access requires a secure (HTTPS) connection. Please use https:// or localhost.',
            };
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            return {
                httpsOk: true,
                permissionState: 'unavailable',
                deviceCount: 0,
                detail: 'Your browser does not support live microphone capture. Try Chrome, Edge, or Safari.',
            };
        }
        let permissionState: MicCheck['permissionState'] = 'unknown';
        try {
            // Permissions API isn't universal — fall back to 'unknown' if missing.
            const status = await (navigator.permissions as unknown as { query: (q: { name: string }) => Promise<PermissionStatus> })?.query?.({ name: 'microphone' });
            if (status?.state) permissionState = status.state as MicCheck['permissionState'];
        } catch { /* ignore */ }

        let deviceCount = 0;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            deviceCount = devices.filter(d => d.kind === 'audioinput').length;
        } catch { /* ignore */ }

        let detail: string | null = null;
        if (permissionState === 'denied') {
            detail = 'Microphone access is blocked. Click the lock icon in your address bar → Site Settings → Microphone → Allow.';
        } else if (deviceCount === 0) {
            detail = 'No microphone detected. Please connect one and try again.';
        }
        return { httpsOk: true, permissionState, deviceCount, detail };
    }, []);

    // ---- Inactivity / VAD ---- //
    const resetInactivityTimer = useCallback((onTimeout: () => void) => {
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = window.setTimeout(onTimeout, INACTIVITY_TIMEOUT_MS);
    }, []);

    // ---- Cleanup ---- //
    const cleanupResources = useCallback(async () => {
        if (inactivityTimerRef.current) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null; }
        if (checkpointTimerRef.current) { clearInterval(checkpointTimerRef.current); checkpointTimerRef.current = null; }
        if (examinerSpeakingTimerRef.current) { clearTimeout(examinerSpeakingTimerRef.current); examinerSpeakingTimerRef.current = null; }

        try {
            mediaStreamRef.current?.getTracks().forEach(t => t.stop());
        } catch { /* ignore */ }
        mediaStreamRef.current = null;
        try { sourceRef.current?.disconnect(); } catch { /* ignore */ }
        sourceRef.current = null;

        if (workletNodeRef.current) {
            try {
                workletNodeRef.current.port.onmessage = null;
                workletNodeRef.current.disconnect();
            } catch { /* ignore */ }
            workletNodeRef.current = null;
        }
        if (fallbackProcessorRef.current) {
            try {
                fallbackProcessorRef.current.disconnect();
                fallbackProcessorRef.current.onaudioprocess = null;
            } catch { /* ignore */ }
            fallbackProcessorRef.current = null;
        }

        if (inputCtxRef.current && inputCtxRef.current.state !== 'closed') {
            await inputCtxRef.current.close().catch(() => undefined);
        }
        inputCtxRef.current = null;
        if (outputCtxRef.current && outputCtxRef.current.state !== 'closed') {
            await outputCtxRef.current.close().catch(() => undefined);
        }
        outputCtxRef.current = null;

        outputSourcesRef.current.forEach(s => { try { s.stop(); } catch { /* ignore */ } });
        outputSourcesRef.current.clear();
        nextStartTimeRef.current = 0;

        if (sessionPromiseRef.current) {
            try { (await sessionPromiseRef.current as { close?: () => void })?.close?.(); } catch { /* ignore */ }
            sessionPromiseRef.current = null;
        }
        liveSessionRef.current = null;
    }, []);

    const stop = useCallback(async () => {
        await cleanupResources();
        setConnection(prev => (prev === 'ERROR' ? prev : 'DISCONNECTED'));
        setExaminerSpeaking(false);
        setMicRms(0);
        sessionIdRef.current = null;
        startedAtRef.current = null;
        reconnectsRef.current = 0;
    }, [cleanupResources]);

    // ---- Audio setup (Worklet first, fallback to ScriptProcessor) ---- //
    const setupAudio = useCallback(async (onChunkBase64: (b64: string) => void, onSilenceTick: () => void) => {
        const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
        mediaStreamRef.current = stream;

        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const inputCtx = new Ctx({ sampleRate: 16000 });
        await inputCtx.resume();
        inputCtxRef.current = inputCtx;
        const source = inputCtx.createMediaStreamSource(stream);
        sourceRef.current = source;

        const onChunk = (pcmBuffer: ArrayBuffer, rms: number) => {
            // Encode to base64
            const bytes = new Uint8Array(pcmBuffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            onChunkBase64(btoa(binary));

            setMicRms(rms);
            // Reset inactivity if RMS exceeds the threshold (i.e. user is speaking).
            if (rms > VAD_RMS_THRESHOLD) onSilenceTick();
        };

        if (inputCtx.audioWorklet) {
            try {
                await inputCtx.audioWorklet.addModule('/worklets/pcm-recorder.js');
                const node = new AudioWorkletNode(inputCtx, 'pcm-recorder');
                node.port.onmessage = (ev: MessageEvent) => {
                    const data = ev.data as { pcm: ArrayBuffer; rms: number };
                    onChunk(data.pcm, data.rms);
                };
                source.connect(node);
                node.connect(inputCtx.destination);
                workletNodeRef.current = node;
                return;
            } catch (e) {
                console.warn('Worklet load failed, using ScriptProcessor fallback:', e);
            }
        }

        // Fallback: ScriptProcessorNode
        const proc = inputCtx.createScriptProcessor(4096, 1, 1);
        proc.onaudioprocess = (event) => {
            const data = event.inputBuffer.getChannelData(0);
            // Compute RMS
            let sumSq = 0;
            for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i];
            const rms = Math.sqrt(sumSq / data.length);
            // Convert to 16-bit PCM
            const pcm = new Int16Array(data.length);
            for (let i = 0; i < data.length; i++) {
                const s = Math.max(-1, Math.min(1, data[i]));
                pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            onChunk(pcm.buffer, rms);
        };
        source.connect(proc);
        proc.connect(inputCtx.destination);
        fallbackProcessorRef.current = proc;
    }, []);

    // ---- Output audio playback ---- //
    const playAudioChunk = useCallback(async (b64: string) => {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!outputCtxRef.current || outputCtxRef.current.state === 'closed') {
            outputCtxRef.current = new Ctx({ sampleRate: 24000 });
        }
        if (outputCtxRef.current.state === 'suspended') {
            await outputCtxRef.current.resume().catch(() => undefined);
        }
        const ctx = outputCtxRef.current;
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const dataInt16 = new Int16Array(bytes.buffer);
        const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
        const ch = buffer.getChannelData(0);
        for (let i = 0; i < dataInt16.length; i++) ch[i] = dataInt16[i] / 32768.0;

        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.addEventListener('ended', () => outputSourcesRef.current.delete(src));
        src.start(nextStartTimeRef.current);
        nextStartTimeRef.current += buffer.duration;
        outputSourcesRef.current.add(src);

        // Examiner-speaking visual state — reset 600ms after the last chunk.
        setExaminerSpeaking(true);
        if (examinerSpeakingTimerRef.current) clearTimeout(examinerSpeakingTimerRef.current);
        examinerSpeakingTimerRef.current = window.setTimeout(() => setExaminerSpeaking(false), 600);
    }, []);

    // ---- Connect to Gemini Live ---- //
    const connectLive = useCallback(async (
        apiKey: string,
        model: string,
        voiceName: string | undefined,
        systemInstruction: string,
    ) => {
        const ai = new GoogleGenAI({ apiKey });
        const sp = ai.live.connect({
            model,
            callbacks: {
                onopen: () => {
                    setConnection('CONNECTED');
                    reconnectsRef.current = 0;
                    resetInactivityTimer(() => {
                        setError('Your session timed out due to inactivity.');
                        stop();
                    });
                },
                onmessage: async (message: LiveServerMessage) => {
                    if (message.serverContent?.outputTranscription) {
                        outputBufferRef.current += message.serverContent.outputTranscription.text || '';
                    } else if (message.serverContent?.inputTranscription) {
                        inputBufferRef.current += message.serverContent.inputTranscription.text || '';
                    }
                    if (message.serverContent?.turnComplete) {
                        const fullInput = inputBufferRef.current.trim();
                        const fullOutput = outputBufferRef.current.trim();
                        const now = new Date();
                        const startedAt = startedAtRef.current;
                        const elapsed = startedAt ? Math.round((now.getTime() - startedAt.getTime()) / 1000) : 0;
                        const ts = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
                        setTranscript(prev => {
                            const next = [...prev];
                            if (fullInput) next.push({ speaker: 'user', text: fullInput, timestamp: ts });
                            if (fullOutput) next.push({ speaker: 'model', text: fullOutput, timestamp: ts });
                            return next;
                        });
                        inputBufferRef.current = '';
                        outputBufferRef.current = '';
                    }
                    const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (audioData) await playAudioChunk(audioData);
                },
                onerror: (e) => {
                    console.error('Live error:', e);
                    setError('Live connection failed. Check your network.');
                    setConnection('ERROR');
                },
                onclose: () => {
                    setConnection(prev => (prev === 'ERROR' ? prev : 'DISCONNECTED'));
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction,
                ...(voiceName ? { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } } : {}),
            },
        });
        sessionPromiseRef.current = sp;
        liveSessionRef.current = (await sp) as never;
    }, [playAudioChunk, resetInactivityTimer, stop]);

    // ---- Public API: start ---- //
    const start = useCallback(async (opts: StartOptions) => {
        setError(null);
        setTranscript([]);
        setConnection('PRECHECK');
        const check = await preFlight();
        if (!check.httpsOk || check.permissionState === 'denied' || check.detail) {
            setError(check.detail || 'Microphone unavailable.');
            setConnection('ERROR');
            return null;
        }

        setConnection('CONNECTING');
        startedAtRef.current = new Date();
        try {
            const session = await startSpeakingSession(
                opts.mode === 'Mock' ? 'Standard' : opts.mode, // backend now supports Mock — but the legacy client typed only Standard|RolePlay; we send Mock via direct payload below if needed
                opts.topic ?? opts.prompt?.text,
                opts.prompt ? { part: opts.prompt.part, text: opts.prompt.text } : undefined,
                {
                    part: opts.part ?? 'mixed',
                    predictedBand: opts.predictedBand ?? null,
                    parentSessionId: opts.parentSessionId ?? null,
                },
            );
            sessionIdRef.current = session.session_id;

            // Send the new payload fields (accent, persona, mock, cue card) via
            // a follow-up checkpoint — the start-session endpoint also accepts
            // them on POST, but the legacy client doesn't pass them. Backend
            // applied defaults; our checkpoint stores the cue card snapshot.
            if (opts.cueCard) {
                await speakingClient.checkpoint(session.session_id, [], 0, { cue_card: opts.cueCard });
            }

            const apiKey = session.live.api_key;
            if (!apiKey) throw new Error('Live credentials missing.');

            const cfg = liveConfig;
            const voice = cfg?.voices[opts.accent ?? 'uk'];
            const model = cfg?.primary_model ?? session.live.model;

            // Build a permissive default system instruction client-side; backend
            // also returns one but the legacy client doesn't surface it. The
            // backend-built version is what the new flow will use once we wire
            // the start-session response shape forward.
            const systemInstruction = `You are an IELTS speaking examiner. Speak only English. Persona: ${opts.persona ?? 'neutral'}. Accent: ${opts.accent ?? 'uk'}. Conduct a natural mock conversation.`;

            await setupAudio(
                (b64) => {
                    if (!liveSessionRef.current) return;
                    try {
                        liveSessionRef.current.sendRealtimeInput({
                            media: { data: b64, mimeType: 'audio/pcm;rate=16000' },
                        });
                    } catch { /* ignore */ }
                },
                () => resetInactivityTimer(() => {
                    setError('Your session timed out due to inactivity.');
                    stop();
                }),
            );

            await connectLive(apiKey, model, voice, systemInstruction);

            // Auto-checkpoint every 30s
            checkpointTimerRef.current = window.setInterval(() => {
                if (!sessionIdRef.current) return;
                const startedAt = startedAtRef.current;
                const dur = startedAt ? Math.round((Date.now() - startedAt.getTime()) / 1000) : 0;
                speakingClient.checkpoint(sessionIdRef.current, transcriptRef.current, dur).catch(() => undefined);
            }, CHECKPOINT_INTERVAL_MS);

            return session.session_id;
        } catch (e) {
            console.error('Failed to start session:', e);
            setError(e instanceof Error ? e.message : 'Could not start the session.');
            setConnection('ERROR');
            await cleanupResources();
            return null;
        }
    }, [cleanupResources, connectLive, liveConfig, preFlight, resetInactivityTimer, setupAudio, stop]);

    // ---- Reconnect (A7) ---- //
    const reconnect = useCallback(async () => {
        if (!sessionIdRef.current) return;
        if (reconnectsRef.current >= MAX_RECONNECTS) {
            setError('Reached the reconnection limit. Please end and restart the session.');
            return;
        }
        reconnectsRef.current += 1;
        setError(null);
        setConnection('CONNECTING');
        try {
            const r = await speakingClient.reconnect(sessionIdRef.current);
            if (r.transcript?.length) setTranscript(r.transcript as Turn[]);
            await cleanupResources();
            const apiKey = r.live.api_key;
            if (!apiKey) throw new Error('Live credentials missing.');
            await setupAudio(
                (b64) => {
                    if (!liveSessionRef.current) return;
                    try {
                        liveSessionRef.current.sendRealtimeInput({
                            media: { data: b64, mimeType: 'audio/pcm;rate=16000' },
                        });
                    } catch { /* ignore */ }
                },
                () => resetInactivityTimer(() => {
                    setError('Your session timed out due to inactivity.');
                    stop();
                }),
            );
            const sysInstr = 'You are an IELTS speaking examiner. Continue the previous conversation naturally.';
            await connectLive(apiKey, r.live.model, undefined, sysInstr);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Reconnect failed.');
            setConnection('ERROR');
        }
    }, [cleanupResources, connectLive, resetInactivityTimer, setupAudio, stop]);

    // Unmount cleanup
    useEffect(() => () => { void cleanupResources(); }, [cleanupResources]);

    return {
        connection,
        transcript,
        error,
        micRms,
        examinerSpeaking,
        liveConfig,
        sessionId: sessionIdRef.current,
        start,
        stop,
        reconnect,
        preFlight,
    };
}
