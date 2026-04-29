/**
 * @file 5-step onboarding wizard (D2). Captures target band, exam date,
 * native language, daily commitment, optional Google Calendar export.
 *
 * Fired by App.tsx the first time a user lands without onboarded_at set.
 * Mobile-first single-column layout.
 */

import React, { useState } from 'react';
import { uxService } from '../../services/uxService';
import { authService } from '../../services/authService';
import { useToast } from '../ui/Toast';

const NATIVE_LANGUAGE_OPTIONS = [
    { value: '', label: 'Prefer not to say' },
    { value: 'ar', label: 'Arabic' }, { value: 'bn', label: 'Bengali' },
    { value: 'zh', label: 'Chinese (Mandarin)' }, { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' }, { value: 'hi', label: 'Hindi' },
    { value: 'id', label: 'Indonesian' }, { value: 'it', label: 'Italian' },
    { value: 'ja', label: 'Japanese' }, { value: 'ko', label: 'Korean' },
    { value: 'pt', label: 'Portuguese' }, { value: 'pa', label: 'Punjabi' },
    { value: 'ru', label: 'Russian' }, { value: 'es', label: 'Spanish' },
    { value: 'th', label: 'Thai' }, { value: 'tr', label: 'Turkish' },
    { value: 'ur', label: 'Urdu' }, { value: 'vi', label: 'Vietnamese' },
    { value: 'other', label: 'Other' },
];

const TARGET_BANDS = [5.5, 6.0, 6.5, 7.0, 7.5, 8.0];
const COMMITMENT_OPTIONS = [
    { value: 15, label: '15 minutes' },
    { value: 20, label: '20 minutes' },
    { value: 30, label: '30 minutes' },
    { value: 45, label: '45 minutes' },
    { value: 60, label: '1 hour' },
];

interface Props {
    onComplete: () => void;
    onSkip: () => void;
}

const OnboardingWizard: React.FC<Props> = ({ onComplete, onSkip }) => {
    const { toast } = useToast();
    const [step, setStep] = useState(0);
    const [targetScore, setTargetScore] = useState(7.0);
    const [examDate, setExamDate] = useState<string>('');
    const [native, setNative] = useState('');
    const [commitment, setCommitment] = useState(20);
    const [submitting, setSubmitting] = useState(false);

    const totalSteps = 4;

    const next = () => setStep(s => Math.min(totalSteps, s + 1));
    const back = () => setStep(s => Math.max(0, s - 1));

    const finish = async () => {
        setSubmitting(true);
        try {
            await uxService.completeOnboarding({
                target_score: targetScore,
                exam_date: examDate || null,
                native_language: native,
                daily_commitment_minutes: commitment,
            });
            // Refresh the cached user so onboardedAt populates.
            await authService.refreshSession();
            toast({ title: "You're all set", body: 'A personalized study plan is coming up.', kind: 'success' });
            onComplete();
        } catch (e) {
            toast({ title: 'Could not save preferences', body: e instanceof Error ? e.message : '', kind: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center">
            <div className="w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-5 pt-5 pb-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Let's set you up</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">90 seconds — skip any time.</p>
                    </div>
                    <button
                        onClick={onSkip}
                        className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        Skip
                    </button>
                </div>
                {/* Progress */}
                <div className="px-5 py-2 bg-slate-50 dark:bg-slate-950/50">
                    <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all" style={{ width: `${((step + 1) / (totalSteps + 1)) * 100}%` }} />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Step {step + 1} of {totalSteps + 1}</p>
                </div>
                {/* Body */}
                <div className="px-5 py-6 overflow-y-auto flex-1">
                    {step === 0 && (
                        <div className="space-y-4">
                            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">What band score are you aiming for?</h3>
                            <div className="grid grid-cols-3 gap-2">
                                {TARGET_BANDS.map(b => (
                                    <button
                                        key={b}
                                        onClick={() => setTargetScore(b)}
                                        className={`
                                            text-base font-bold rounded-md py-3 border transition-colors
                                            ${targetScore === b
                                                ? 'bg-blue-600 border-blue-600 text-white'
                                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-400'}
                                        `}
                                    >
                                        {b.toFixed(1)}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-slate-500">Used to calibrate task difficulty.</p>
                        </div>
                    )}
                    {step === 1 && (
                        <div className="space-y-4">
                            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">When is your exam?</h3>
                            <input
                                type="date"
                                value={examDate}
                                onChange={(e) => setExamDate(e.target.value)}
                                className="w-full text-base px-3 py-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="text-xs text-slate-500">Powers your countdown banner and daily reminders. You can leave this blank.</p>
                        </div>
                    )}
                    {step === 2 && (
                        <div className="space-y-4">
                            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Your strongest language?</h3>
                            <select
                                value={native}
                                onChange={(e) => setNative(e.target.value)}
                                className="w-full text-base px-3 py-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {NATIVE_LANGUAGE_OPTIONS.map(o => (
                                    <option key={o.value || 'unset'} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                            <p className="text-xs text-slate-500">The AI tailors feedback to common L1 patterns when you tell it.</p>
                        </div>
                    )}
                    {step === 3 && (
                        <div className="space-y-4">
                            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">How much time per day?</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {COMMITMENT_OPTIONS.map(o => (
                                    <button
                                        key={o.value}
                                        onClick={() => setCommitment(o.value)}
                                        className={`
                                            text-sm font-medium rounded-md py-3 border transition-colors
                                            ${commitment === o.value
                                                ? 'bg-blue-600 border-blue-600 text-white'
                                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-400'}
                                        `}
                                    >
                                        {o.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-slate-500">We'll size the daily plan to match.</p>
                        </div>
                    )}
                    {step === 4 && (
                        <div className="space-y-4">
                            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">You're ready</h3>
                            <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1 list-disc list-inside">
                                <li>Target band: <strong>{targetScore.toFixed(1)}</strong></li>
                                <li>Exam date: <strong>{examDate || 'not set'}</strong></li>
                                <li>Native language: <strong>{NATIVE_LANGUAGE_OPTIONS.find(o => o.value === native)?.label}</strong></li>
                                <li>Daily commitment: <strong>{commitment} minutes</strong></li>
                            </ul>
                            <p className="text-xs text-slate-500">You can change these any time in your Profile.</p>
                        </div>
                    )}
                </div>
                {/* Footer */}
                <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-white dark:bg-slate-900">
                    {step > 0 ? (
                        <button onClick={back} className="text-sm text-slate-500 dark:text-slate-400 px-3 py-2 hover:text-slate-700 dark:hover:text-slate-200">
                            Back
                        </button>
                    ) : <span />}
                    {step < totalSteps ? (
                        <button onClick={next} className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded">
                            Continue
                        </button>
                    ) : (
                        <button onClick={finish} disabled={submitting} className="text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 rounded">
                            {submitting ? 'Saving…' : 'Finish setup'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OnboardingWizard;
