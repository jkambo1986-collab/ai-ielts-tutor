/**
 * @file Pre-session checklist modal (C3 + A2 + A5).
 *
 * Walks the user through:
 *   1. Mic permission + a 3-second test recording (RMS visible)
 *   2. Headphone confirmation (avoid echo)
 *   3. Quiet environment confirmation
 *
 * Only after all three pass does it call onReady().
 */

import React, { useEffect, useRef, useState } from 'react';
import MicMeter from './MicMeter';

interface Props {
    open: boolean;
    onReady: () => void;
    onCancel: () => void;
}

const PreSessionChecklist: React.FC<Props> = ({ open, onReady, onCancel }) => {
    const [step, setStep] = useState<'mic' | 'headphones' | 'quiet'>('mic');
    const [permissionState, setPermissionState] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'>('idle');
    const [permissionDetail, setPermissionDetail] = useState<string | null>(null);
    const [rms, setRms] = useState(0);
    const streamRef = useRef<MediaStream | null>(null);
    const ctxRef = useRef<AudioContext | null>(null);

    // Reset on open
    useEffect(() => {
        if (!open) {
            stopMic();
            setStep('mic');
            setPermissionState('idle');
            setPermissionDetail(null);
            setRms(0);
        }
    }, [open]);

    const stopMic = () => {
        try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
        streamRef.current = null;
        if (ctxRef.current && ctxRef.current.state !== 'closed') {
            ctxRef.current.close().catch(() => undefined);
        }
        ctxRef.current = null;
    };

    const requestMic = async () => {
        if (!window.isSecureContext) {
            setPermissionState('unavailable');
            setPermissionDetail('Mic access requires HTTPS. Use https:// or localhost.');
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            setPermissionState('unavailable');
            setPermissionDetail('Your browser does not support microphone capture.');
            return;
        }
        setPermissionState('requesting');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
            streamRef.current = stream;
            const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const ctx = new Ctx({ sampleRate: 16000 });
            ctxRef.current = ctx;
            await ctx.resume();
            const source = ctx.createMediaStreamSource(stream);
            const proc = ctx.createScriptProcessor(4096, 1, 1);
            proc.onaudioprocess = (e) => {
                const data = e.inputBuffer.getChannelData(0);
                let sumSq = 0;
                for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i];
                setRms(Math.sqrt(sumSq / data.length));
            };
            source.connect(proc);
            proc.connect(ctx.destination);
            setPermissionState('granted');
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Microphone access denied.';
            setPermissionState('denied');
            setPermissionDetail(`${msg}. Click the lock icon in the address bar → Site Settings → Microphone → Allow.`);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Quick pre-session check</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        60 seconds to make sure you have a clean recording. This avoids losing a session to bad audio.
                    </p>
                </div>

                <Stepper step={step} />

                {step === 'mic' && (
                    <div className="space-y-3">
                        <p className="text-sm text-slate-700 dark:text-slate-200">
                            <strong>1. Microphone test.</strong> Click "Test microphone" and say a few words. The meter should move.
                        </p>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={requestMic}
                                disabled={permissionState === 'requesting'}
                                className="text-sm px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
                            >
                                {permissionState === 'requesting' ? 'Requesting…' : 'Test microphone'}
                            </button>
                            <MicMeter rms={rms} active={permissionState === 'granted'} />
                        </div>
                        {permissionDetail && <p className="text-xs text-rose-600 dark:text-rose-400">{permissionDetail}</p>}
                        {permissionState === 'granted' && (
                            <button
                                onClick={() => setStep('headphones')}
                                className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                Mic works — next →
                            </button>
                        )}
                    </div>
                )}

                {step === 'headphones' && (
                    <div className="space-y-3">
                        <p className="text-sm text-slate-700 dark:text-slate-200">
                            <strong>2. Headphones recommended.</strong> Without them, the AI may pick up its own voice and confuse the transcription.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setStep('quiet')}
                                className="text-sm px-3 py-2 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                                I'm wearing headphones
                            </button>
                            <button
                                onClick={() => setStep('quiet')}
                                className="text-sm px-3 py-2 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                            >
                                Continue without
                            </button>
                        </div>
                    </div>
                )}

                {step === 'quiet' && (
                    <div className="space-y-3">
                        <p className="text-sm text-slate-700 dark:text-slate-200">
                            <strong>3. Quiet environment.</strong> Background noise costs you Pronunciation marks. Find a quiet room or close the door.
                        </p>
                        <button
                            onClick={() => { stopMic(); onReady(); }}
                            className="text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded"
                        >
                            I'm ready — start session
                        </button>
                    </div>
                )}

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                    <button
                        onClick={() => { stopMic(); onCancel(); }}
                        className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

const Stepper: React.FC<{ step: 'mic' | 'headphones' | 'quiet' }> = ({ step }) => {
    const steps = [
        { id: 'mic', label: 'Mic' },
        { id: 'headphones', label: 'Headphones' },
        { id: 'quiet', label: 'Quiet' },
    ];
    const currentIdx = steps.findIndex(s => s.id === step);
    return (
        <ol className="flex items-center gap-2 text-xs">
            {steps.map((s, i) => {
                const done = i < currentIdx;
                const current = i === currentIdx;
                return (
                    <li key={s.id} className="flex items-center gap-2">
                        <span className={`
                            h-5 w-5 rounded-full flex items-center justify-center font-bold text-[10px]
                            ${done ? 'bg-emerald-500 text-white' : current ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}
                        `}>
                            {done ? '✓' : i + 1}
                        </span>
                        <span className={current ? 'text-slate-800 dark:text-slate-100 font-semibold' : 'text-slate-500'}>
                            {s.label}
                        </span>
                        {i < steps.length - 1 && <span className="text-slate-300 dark:text-slate-700">—</span>}
                    </li>
                );
            })}
        </ol>
    );
};

export default PreSessionChecklist;
