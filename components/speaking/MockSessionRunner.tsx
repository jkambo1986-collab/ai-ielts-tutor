/**
 * @file Mock test runner — orchestrates the structured 3-part IELTS speaking
 * mock and ties together cue card, part timer, examiner notes, repeat
 * button, whisper hint, mic meter, and the pre-session checklist.
 *
 * Pipes:
 *   - Phase 1 robustness (engine hook handles all that)
 *   - B1 three-part flow, B2 cue card, B3 timer, B4 examiner-speaking state
 *   - B6 repeat-question, B8 mic meter, B9 examiner notes
 *   - D3 discourse counter, D5 whisper hint
 *   - E2 filler interrupt (opt-in)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../../App';
import { Accent, Persona, Turn, useSpeakingEngine } from '../../services/speakingEngine';
import { CueCard, ExaminerNote, speakingClient } from '../../services/speakingClient';
import { SubscriptionPlan } from '../../types';
import AccentPersonaPicker from './AccentPersonaPicker';
import CueCardView from './CueCardView';
import ExaminerNotesPane from './ExaminerNotesPane';
import MicMeter from './MicMeter';
import PartTimer from './PartTimer';
import PreSessionChecklist from './PreSessionChecklist';

type Phase = 'setup' | 'checklist' | 'part1' | 'part2-prep' | 'part2-talk' | 'part3' | 'review' | 'error';

const DISCOURSE_MARKERS = [
    'on the other hand', 'however', 'moreover', 'furthermore', 'in addition',
    'as a result', 'consequently', 'although', 'whereas', 'in contrast',
    'in my opinion', 'i would argue', 'one could argue', 'for instance',
    'for example', 'on balance', 'all things considered',
];

const FILLER_RE = /\b(um|uh|uhm|er|erm|ah|like|you know|i mean|basically|sort of|kind of)\b/gi;

interface Props {
    onClose: () => void;
}

const MockSessionRunner: React.FC<Props> = ({ onClose }) => {
    const { currentUser } = useAppContext();
    const engine = useSpeakingEngine();

    // Mock-flow state
    const [phase, setPhase] = useState<Phase>('setup');
    const [accent, setAccent] = useState<Accent>('uk');
    const [persona, setPersona] = useState<Persona>('neutral');
    const [cueCard, setCueCard] = useState<CueCard | null>(null);
    const [loadingCard, setLoadingCard] = useState(false);

    // Notes pane
    const [examinerNotes, setExaminerNotes] = useState<ExaminerNote[]>([]);

    // D3 discourse markers + E2 filler tracker
    const [markerCount, setMarkerCount] = useState(0);
    const [fillerCount, setFillerCount] = useState(0);
    const [fillerInterruptOn, setFillerInterruptOn] = useState(false);
    const lastFillerWarnRef = useRef(0);

    // B6 repeat-question rate limit (one per part)
    const [repeatsByPart, setRepeatsByPart] = useState<Record<string, number>>({});

    // D5 whisper hint
    const [whisper, setWhisper] = useState<string | null>(null);

    const isPro = currentUser?.plan === SubscriptionPlan.Pro;

    // Pull a random cue card upfront (B7).
    useEffect(() => {
        let cancelled = false;
        if (cueCard) return;
        setLoadingCard(true);
        speakingClient.fetchRandomCueCard('medium')
            .then(r => { if (!cancelled) setCueCard(r.card); })
            .catch(() => { /* the user can re-roll later */ })
            .finally(() => { if (!cancelled) setLoadingCard(false); });
        return () => { cancelled = true; };
    }, [cueCard]);

    // Watch transcript for discourse markers + fillers + AI examiner notes.
    useEffect(() => {
        let markers = 0;
        let fillers = 0;
        for (const t of engine.transcript) {
            if (t.speaker === 'user') {
                const lower = t.text.toLowerCase();
                for (const m of DISCOURSE_MARKERS) {
                    const re = new RegExp(`\\b${m.replace(/ /g, '\\s+')}\\b`, 'g');
                    markers += (lower.match(re) || []).length;
                }
                fillers += (t.text.match(FILLER_RE) || []).length;
            } else if (t.speaker === 'model') {
                // Parse "NOTE: ..." emissions as examiner notes.
                const m = t.text.match(/(?:^|\n)\/\/\s*NOTE:\s*(.+)/i);
                if (m && cueCard) {
                    const note = m[1].trim();
                    setExaminerNotes(prev =>
                        prev.find(n => n.note === note) ? prev : [...prev, { note, timestamp: t.timestamp, category: 'live', at: new Date().toISOString() }],
                    );
                }
            }
        }
        setMarkerCount(markers);
        setFillerCount(fillers);
    }, [engine.transcript, cueCard]);

    // E2 filler interrupt: gentle audio cue when filler-rate jumps.
    useEffect(() => {
        if (!fillerInterruptOn) return;
        if (fillerCount - lastFillerWarnRef.current >= 5) {
            lastFillerWarnRef.current = fillerCount;
            try {
                const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                const ctx = new Ctx();
                const o = ctx.createOscillator();
                o.frequency.value = 880;
                const g = ctx.createGain();
                g.gain.value = 0.05;
                o.connect(g); g.connect(ctx.destination);
                o.start();
                setTimeout(() => { o.stop(); ctx.close().catch(() => undefined); }, 120);
            } catch { /* ignore */ }
        }
    }, [fillerCount, fillerInterruptOn]);

    // Move from setup → checklist → part1 once mic is verified.
    const beginChecklist = () => setPhase('checklist');
    const beginPart1 = useCallback(async () => {
        setPhase('part1');
        await engine.start({ mode: 'Mock', accent, persona, part: 'part1', cueCard: cueCard ? { id: cueCard.id, topic: cueCard.topic, bullets: cueCard.bullets } : null });
    }, [accent, cueCard, engine, persona]);

    const moveToPart2Prep = () => setPhase('part2-prep');
    const moveToPart2Talk = () => setPhase('part2-talk');
    const moveToPart3 = () => setPhase('part3');
    const finish = useCallback(async () => {
        await engine.stop();
        setPhase('review');
    }, [engine]);

    const handleRepeat = async () => {
        if (!engine.sessionId) return;
        const partKey = phase.startsWith('part1') ? 'part1' : phase.startsWith('part2') ? 'part2' : 'part3';
        try {
            const r = await speakingClient.repeatQuestion(engine.sessionId, partKey as 'part1' | 'part2' | 'part3');
            setRepeatsByPart(prev => ({ ...prev, [partKey]: r.repeats_used_this_part }));
            setExaminerNotes(prev => [...prev, { note: `Repeat requested in ${partKey}: ${r.phrase}`, timestamp: '', category: 'meta', at: new Date().toISOString() }]);
        } catch { /* ignore */ }
    };

    const handleWhisper = async () => {
        if (!engine.sessionId) return;
        const lastModelTurn = [...engine.transcript].reverse().find(t => t.speaker === 'model');
        const lastUserTurn = [...engine.transcript].reverse().find(t => t.speaker === 'user');
        try {
            const r = await speakingClient.whisperHint(
                engine.sessionId,
                lastModelTurn?.text || (cueCard ? cueCard.topic : 'Tell me more.'),
                lastUserTurn?.text || '',
            );
            setWhisper(r.hint);
            setTimeout(() => setWhisper(null), 12_000);
        } catch (e) {
            setWhisper(e instanceof Error ? e.message : 'Hint unavailable.');
            setTimeout(() => setWhisper(null), 4_000);
        }
    };

    const partKey = useMemo<'part1' | 'part2' | 'part3' | null>(() => {
        if (phase === 'part1') return 'part1';
        if (phase === 'part2-prep' || phase === 'part2-talk') return 'part2';
        if (phase === 'part3') return 'part3';
        return null;
    }, [phase]);

    const repeatsUsed = partKey ? (repeatsByPart[partKey] || 0) : 0;

    return (
        <div className="space-y-5">
            <header className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">IELTS Speaking — Mock Test</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Three structured parts, exam-faithful timing, real cue card.</p>
                </div>
                <button onClick={onClose} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                    ← Back
                </button>
            </header>

            {phase === 'setup' && (
                <SetupPanel
                    accent={accent}
                    persona={persona}
                    onChange={({ accent: a, persona: p }) => { setAccent(a); setPersona(p); }}
                    cueCard={cueCard}
                    loadingCard={loadingCard}
                    onReroll={() => { setLoadingCard(true); speakingClient.fetchRandomCueCard('medium').then(r => setCueCard(r.card)).finally(() => setLoadingCard(false)); }}
                    fillerInterruptOn={fillerInterruptOn}
                    onToggleFillerInterrupt={() => setFillerInterruptOn(v => !v)}
                    onBegin={beginChecklist}
                    isPro={isPro}
                />
            )}

            <PreSessionChecklist
                open={phase === 'checklist'}
                onReady={beginPart1}
                onCancel={() => setPhase('setup')}
            />

            {(phase === 'part1' || phase === 'part2-prep' || phase === 'part2-talk' || phase === 'part3') && (
                <LiveLayout
                    phase={phase}
                    cueCard={cueCard}
                    engine={engine}
                    onMoveToPart2Prep={moveToPart2Prep}
                    onMoveToPart2Talk={moveToPart2Talk}
                    onMoveToPart3={moveToPart3}
                    onFinish={finish}
                    onRepeat={handleRepeat}
                    repeatsUsed={repeatsUsed}
                    onWhisper={handleWhisper}
                    whisper={whisper}
                    markerCount={markerCount}
                    fillerCount={fillerCount}
                    examinerNotes={examinerNotes}
                />
            )}

            {phase === 'review' && (
                <ReviewPanel sessionId={engine.sessionId} transcript={engine.transcript} onClose={onClose} />
            )}

            {engine.error && phase !== 'setup' && phase !== 'checklist' && (
                <div role="alert" className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm px-4 py-3 flex items-center justify-between">
                    <span>{engine.error}</span>
                    {engine.connection === 'ERROR' && (
                        <button
                            onClick={() => engine.reconnect()}
                            className="text-xs font-medium px-3 py-1.5 rounded bg-rose-600 text-white hover:bg-rose-500"
                        >
                            Reconnect
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

// ----- Sub-panels ----- //

const SetupPanel: React.FC<{
    accent: Accent; persona: Persona;
    onChange: (next: { accent: Accent; persona: Persona }) => void;
    cueCard: CueCard | null; loadingCard: boolean; onReroll: () => void;
    fillerInterruptOn: boolean; onToggleFillerInterrupt: () => void;
    onBegin: () => void; isPro: boolean;
}> = ({ accent, persona, onChange, cueCard, loadingCard, onReroll, fillerInterruptOn, onToggleFillerInterrupt, onBegin, isPro }) => (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Set up your mock</h3>
        <AccentPersonaPicker accent={accent} persona={persona} onChange={onChange} />

        <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Part 2 cue card</p>
            {loadingCard ? (
                <p className="text-sm text-slate-400">Picking a card…</p>
            ) : cueCard ? (
                <div className="flex items-start gap-3">
                    <div className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{cueCard.topic}</p>
                        <ul className="text-xs text-slate-600 dark:text-slate-300 list-disc list-inside mt-1 space-y-0.5">
                            {cueCard.bullets.slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}
                            {cueCard.bullets.length > 3 && <li>…</li>}
                        </ul>
                    </div>
                    <button onClick={onReroll} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        Re-roll
                    </button>
                </div>
            ) : <p className="text-sm text-slate-400">No cards available.</p>}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                    type="checkbox"
                    checked={fillerInterruptOn}
                    onChange={onToggleFillerInterrupt}
                />
                Filler-word audio cue (opt-in)
                {!isPro && <span className="text-[10px] bg-amber-400 text-amber-900 px-1 py-0.5 rounded">PRO</span>}
            </label>
            <button
                onClick={onBegin}
                disabled={!cueCard}
                className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-2 rounded-md"
            >
                Begin mock test
            </button>
        </div>
    </section>
);

const LiveLayout: React.FC<{
    phase: Phase; cueCard: CueCard | null;
    engine: ReturnType<typeof useSpeakingEngine>;
    onMoveToPart2Prep: () => void; onMoveToPart2Talk: () => void; onMoveToPart3: () => void; onFinish: () => void;
    onRepeat: () => void; repeatsUsed: number;
    onWhisper: () => void; whisper: string | null;
    markerCount: number; fillerCount: number;
    examinerNotes: ExaminerNote[];
}> = (props) => {
    const { phase, cueCard, engine } = props;
    const partLabel = phase === 'part1' ? 'Part 1 — Introduction'
                    : phase === 'part2-prep' ? 'Part 2 — Prep'
                    : phase === 'part2-talk' ? 'Part 2 — Long turn'
                    : 'Part 3 — Discussion';

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
                <div
                    className="flex items-center justify-between rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 sticky top-14 md:top-0 z-10"
                    role="status"
                    aria-live="polite"
                >
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{partLabel}</span>
                        {engine.examinerSpeaking ? (
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-500 text-white">Examiner is speaking</span>
                        ) : (
                            <span className="text-xs px-2 py-0.5 rounded bg-emerald-500 text-white">Your turn</span>
                        )}
                    </div>
                    <MicMeter rms={engine.micRms} active={engine.connection === 'CONNECTED'} />
                </div>

                {phase === 'part1' && (
                    <PartTimer label="Part 1" targetSeconds={5 * 60} mode="countdown" running onComplete={props.onMoveToPart2Prep} />
                )}
                {phase === 'part3' && (
                    <PartTimer label="Part 3" targetSeconds={5 * 60} mode="countdown" running onComplete={props.onFinish} />
                )}
                {(phase === 'part2-prep' || phase === 'part2-talk') && cueCard && (
                    <CueCardView
                        card={cueCard}
                        phase={phase === 'part2-prep' ? 'prep' : 'talk'}
                        onPrepComplete={props.onMoveToPart2Talk}
                        onTalkComplete={props.onMoveToPart3}
                    />
                )}

                {/* Live transcript */}
                <div role="log" aria-live="polite" className="bg-white dark:bg-slate-900 rounded-lg p-4 h-72 overflow-y-auto border border-slate-200 dark:border-slate-800 space-y-3">
                    {engine.transcript.length === 0 && (
                        <p className="text-xs text-slate-500">Transcript will appear here…</p>
                    )}
                    {engine.transcript.map((turn, i) => (
                        <TranscriptRow key={i} turn={turn} />
                    ))}
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={props.onRepeat}
                        disabled={props.repeatsUsed >= 1 || engine.connection !== 'CONNECTED'}
                        className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                    >
                        Could you repeat that? {props.repeatsUsed >= 1 && '(used)'}
                    </button>
                    <button
                        onClick={props.onWhisper}
                        disabled={engine.connection !== 'CONNECTED'}
                        className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                    >
                        Whisper hint
                    </button>
                    {phase === 'part1' && (
                        <button onClick={props.onMoveToPart2Prep} className="text-xs px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                            Skip to Part 2 →
                        </button>
                    )}
                    {phase === 'part3' && (
                        <button onClick={props.onFinish} className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-500">
                            Finish mock
                        </button>
                    )}
                    <button onClick={props.onFinish} className="text-xs px-3 py-1.5 rounded text-rose-600 dark:text-rose-400">
                        End early
                    </button>
                </div>

                {props.whisper && (
                    <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-3 py-2">
                        <p className="text-xs text-blue-700 dark:text-blue-300"><strong>Hint:</strong> {props.whisper}</p>
                    </div>
                )}
            </div>

            <div className="space-y-3">
                <ExaminerNotesPane notes={props.examinerNotes} />
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    <p><strong>Linkers used:</strong> {props.markerCount}</p>
                    <p><strong>Fillers detected:</strong> {props.fillerCount}</p>
                    <p className="text-[10px] text-slate-400">Aim for ≥ 5 linkers and few fillers for band-7 lexical resource.</p>
                </div>
            </div>
        </div>
    );
};

const TranscriptRow: React.FC<{ turn: Turn }> = ({ turn }) => (
    <div className={`flex ${turn.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-md p-2.5 rounded-lg text-sm ${turn.speaker === 'user' ? 'bg-blue-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100'}`}>
            <div className="flex justify-between items-center text-[10px] opacity-70 mb-1">
                <span className="capitalize font-bold">{turn.speaker}</span>
                <span>{turn.timestamp}</span>
            </div>
            <p>{turn.text}</p>
        </div>
    </div>
);

const ReviewPanel: React.FC<{ sessionId: string | null; transcript: Turn[]; onClose: () => void }> = ({ sessionId, transcript, onClose }) => {
    const downloadUrl = (fmt: 'txt' | 'pdf' | 'docx') => sessionId ? speakingClient.exportUrl(sessionId, fmt) : '#';
    return (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Mock complete</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
                {transcript.length} turn{transcript.length === 1 ? '' : 's'} captured. Open the session from the dashboard for full analysis.
            </p>
            <div className="flex flex-wrap gap-2">
                <a href={downloadUrl('pdf')} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                    Download PDF
                </a>
                <a href={downloadUrl('docx')} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                    Download DOCX
                </a>
                <a href={downloadUrl('txt')} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                    Download TXT
                </a>
                <button onClick={onClose} className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500">
                    Back to Speaking
                </button>
            </div>
        </section>
    );
};

export default MockSessionRunner;
