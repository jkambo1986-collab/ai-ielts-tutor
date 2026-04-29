/**
 * @file Dedicated profile / settings page.
 * Sections: identity card, IELTS preferences, ESL preferences, account info.
 * All edits go through context.handleProfileUpdate (PATCH /auth/me).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../App';
import {
    EnglishProficiencyLevel, NativeLanguageCode, SubscriptionPlan,
} from '../types';
import NotificationPrefsPanel from './ui/NotificationPrefs';
import PublicProfileToggle from './PublicProfileToggle';
import CertificateCard from './dashboard/CertificateCard';

const NATIVE_LANGUAGE_OPTIONS: { value: NativeLanguageCode; label: string }[] = [
    { value: '',     label: 'Prefer not to say' },
    { value: 'ar',   label: 'Arabic' },
    { value: 'bn',   label: 'Bengali' },
    { value: 'zh',   label: 'Chinese (Mandarin)' },
    { value: 'yue',  label: 'Chinese (Cantonese)' },
    { value: 'nl',   label: 'Dutch' },
    { value: 'fa',   label: 'Farsi / Persian' },
    { value: 'fil',  label: 'Filipino / Tagalog' },
    { value: 'fr',   label: 'French' },
    { value: 'de',   label: 'German' },
    { value: 'gu',   label: 'Gujarati' },
    { value: 'hi',   label: 'Hindi' },
    { value: 'id',   label: 'Indonesian' },
    { value: 'it',   label: 'Italian' },
    { value: 'ja',   label: 'Japanese' },
    { value: 'kk',   label: 'Kazakh' },
    { value: 'ko',   label: 'Korean' },
    { value: 'ms',   label: 'Malay' },
    { value: 'ne',   label: 'Nepali' },
    { value: 'pl',   label: 'Polish' },
    { value: 'pt',   label: 'Portuguese' },
    { value: 'pa',   label: 'Punjabi' },
    { value: 'ru',   label: 'Russian' },
    { value: 'es',   label: 'Spanish' },
    { value: 'ta',   label: 'Tamil' },
    { value: 'te',   label: 'Telugu' },
    { value: 'th',   label: 'Thai' },
    { value: 'tr',   label: 'Turkish' },
    { value: 'uk',   label: 'Ukrainian' },
    { value: 'ur',   label: 'Urdu' },
    { value: 'vi',   label: 'Vietnamese' },
    { value: 'other', label: 'Other' },
];

const PROFICIENCY_OPTIONS: { value: EnglishProficiencyLevel; label: string }[] = [
    { value: '',                    label: 'Not specified' },
    { value: 'beginner',            label: 'Beginner (CEFR A1–A2)' },
    { value: 'lower_intermediate',  label: 'Lower Intermediate (CEFR B1)' },
    { value: 'intermediate',        label: 'Intermediate (CEFR B1–B2)' },
    { value: 'upper_intermediate',  label: 'Upper Intermediate (CEFR B2–C1)' },
    { value: 'advanced',            label: 'Advanced (CEFR C1–C2)' },
];

const TARGET_SCORE_OPTIONS = [
    5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0,
];

const ROLE_LABEL: Record<string, string> = {
    super_admin: 'Super Admin',
    institute_admin: 'Institute Admin',
    instructor: 'Instructor',
    student: 'Student',
};

const formatDate = (iso?: string) => {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            year: 'numeric', month: 'long', day: 'numeric',
        });
    } catch {
        return iso;
    }
};

const ProfilePage: React.FC = () => {
    const { currentUser, handleProfileUpdate } = useAppContext();

    // Local form state (string-typed for selects). Initialized from currentUser
    // and reset whenever the upstream profile changes (e.g. after save).
    const [name, setName] = useState('');
    const [targetScore, setTargetScore] = useState<number>(7.0);
    const [adaptive, setAdaptive] = useState(false);
    const [nativeLanguage, setNativeLanguage] = useState<NativeLanguageCode>('');
    const [proficiency, setProficiency] = useState<EnglishProficiencyLevel>('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);

    useEffect(() => {
        if (!currentUser) return;
        setName(currentUser.name);
        setTargetScore(currentUser.targetScore);
        setAdaptive(currentUser.isAdaptiveLearningEnabled);
        setNativeLanguage(currentUser.nativeLanguage ?? '');
        setProficiency(currentUser.englishProficiencyLevel ?? '');
    }, [currentUser]);

    const isDirty = useMemo(() => {
        if (!currentUser) return false;
        return (
            name !== currentUser.name
            || targetScore !== currentUser.targetScore
            || adaptive !== currentUser.isAdaptiveLearningEnabled
            || nativeLanguage !== (currentUser.nativeLanguage ?? '')
            || proficiency !== (currentUser.englishProficiencyLevel ?? '')
        );
    }, [currentUser, name, targetScore, adaptive, nativeLanguage, proficiency]);

    if (!currentUser) return null;

    const handleSave = async () => {
        setError(null);
        setSaving(true);
        try {
            await handleProfileUpdate({
                name: name.trim(),
                targetScore,
                isAdaptiveLearningEnabled: adaptive,
                nativeLanguage,
                englishProficiencyLevel: proficiency,
            });
            setSavedAt(Date.now());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save profile.');
        } finally {
            setSaving(false);
        }
    };

    const initial = currentUser.name?.charAt(0)?.toUpperCase() || '?';

    return (
        <div className="space-y-6">
            {/* Identity card */}
            <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center text-white text-3xl font-semibold shadow-sm">
                    {initial}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate">
                            {currentUser.name || 'Your Profile'}
                        </h2>
                        {currentUser.plan === SubscriptionPlan.Pro && (
                            <span className="bg-amber-400 text-amber-900 text-xs font-bold px-2 py-0.5 rounded">
                                PRO
                            </span>
                        )}
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">
                            {ROLE_LABEL[currentUser.role] ?? currentUser.role}
                        </span>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{currentUser.email}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        Member since <span className="font-medium text-slate-700 dark:text-slate-200">{formatDate(currentUser.dateJoined)}</span>
                    </p>
                </div>
            </section>

            {error && (
                <div role="alert" className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm rounded-lg px-4 py-3">
                    {error}
                </div>
            )}

            {/* IELTS preferences */}
            <Section title="IELTS Preferences" subtitle="Set your goals and how the platform adapts to you.">
                <Field label="Display name" htmlFor="profile-name">
                    <input
                        id="profile-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </Field>

                <Field label="Target band score" htmlFor="profile-target">
                    <select
                        id="profile-target"
                        value={targetScore}
                        onChange={(e) => setTargetScore(parseFloat(e.target.value))}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {TARGET_SCORE_OPTIONS.map(s => (
                            <option key={s} value={s}>{s.toFixed(1)}</option>
                        ))}
                    </select>
                </Field>

                <Field
                    label="Adaptive learning"
                    htmlFor="profile-adaptive"
                    hint="When on, the AI tutor adjusts task difficulty based on your recent performance."
                >
                    <Toggle id="profile-adaptive" checked={adaptive} onChange={setAdaptive} />
                </Field>
            </Section>

            {/* ESL preferences */}
            <Section
                title="ESL Preferences"
                subtitle="Tell us about your language background so feedback can be tailored to common L1-influenced patterns."
            >
                <Field
                    label="Native language"
                    htmlFor="profile-l1"
                    hint="Your first / strongest language."
                >
                    <select
                        id="profile-l1"
                        value={nativeLanguage}
                        onChange={(e) => setNativeLanguage(e.target.value as NativeLanguageCode)}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {NATIVE_LANGUAGE_OPTIONS.map(o => (
                            <option key={o.value || 'unset'} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </Field>

                <Field
                    label="Current English level"
                    htmlFor="profile-cefr"
                    hint="Use this if you've taken a placement test or already know your CEFR level."
                >
                    <select
                        id="profile-cefr"
                        value={proficiency}
                        onChange={(e) => setProficiency(e.target.value as EnglishProficiencyLevel)}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {PROFICIENCY_OPTIONS.map(o => (
                            <option key={o.value || 'unset'} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </Field>
            </Section>

            {/* Account info (read-only) */}
            <Section title="Account" subtitle="Read-only details from your account record.">
                <ReadOnlyRow label="Email" value={currentUser.email} />
                <ReadOnlyRow label="Role" value={ROLE_LABEL[currentUser.role] ?? currentUser.role} />
                <ReadOnlyRow label="Plan" value={currentUser.plan} />
                <ReadOnlyRow label="Institute" value={currentUser.instituteSlug ?? '—'} />
                <ReadOnlyRow label="Date joined" value={formatDate(currentUser.dateJoined)} />
                {currentUser.subscriptionEndDate && (
                    <ReadOnlyRow label="Subscription ends" value={formatDate(currentUser.subscriptionEndDate)} />
                )}
            </Section>

            <NotificationPrefsPanel />
            <PublicProfileToggle />
            <CertificateCard />

            {/* Save bar */}
            <div className="sticky bottom-0 -mx-4 sm:-mx-6 lg:-mx-10 px-4 sm:px-6 lg:px-10 py-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
                {savedAt && !isDirty && !saving && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved.</span>
                )}
                <button
                    type="button"
                    disabled={!isDirty || saving}
                    onClick={handleSave}
                    className={`
                        px-4 py-2 rounded-md text-sm font-medium transition-colors
                        ${(!isDirty || saving)
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-500'}
                    `}
                >
                    {saving ? 'Saving…' : 'Save changes'}
                </button>
            </div>
        </div>
    );
};

// -- helpers -- //

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
    <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
        <header className="mb-4">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </header>
        <div className="space-y-5">{children}</div>
    </section>
);

const Field: React.FC<{ label: string; htmlFor: string; hint?: string; children: React.ReactNode }> = ({ label, htmlFor, hint, children }) => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-6 items-start">
        <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700 dark:text-slate-300 sm:pt-2">
            {label}
        </label>
        <div className="sm:col-span-2">
            {children}
            {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
        </div>
    </div>
);

const ReadOnlyRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-6 text-sm">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="sm:col-span-2 font-medium text-slate-800 dark:text-slate-100 break-words">{value}</span>
    </div>
);

const Toggle: React.FC<{ id: string; checked: boolean; onChange: (v: boolean) => void }> = ({ id, checked, onChange }) => (
    <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`
            relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full
            transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
            ${checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}
        `}
    >
        <span
            className={`
                inline-block h-5 w-5 mt-0.5 ml-0.5 rounded-full bg-white shadow transition-transform
                ${checked ? 'translate-x-5' : 'translate-x-0'}
            `}
        />
    </button>
);

export default ProfilePage;
