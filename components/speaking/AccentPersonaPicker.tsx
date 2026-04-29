/**
 * @file Pre-session control to pick examiner accent (B5) and persona (E1).
 */

import React from 'react';
import { Accent, Persona } from '../../services/speakingEngine';

interface Props {
    accent: Accent;
    persona: Persona;
    onChange: (next: { accent: Accent; persona: Persona }) => void;
}

const ACCENTS: { value: Accent; label: string; flag: string }[] = [
    { value: 'uk', label: 'UK', flag: '🇬🇧' },
    { value: 'us', label: 'US', flag: '🇺🇸' },
    { value: 'au', label: 'Australia', flag: '🇦🇺' },
    { value: 'nz', label: 'New Zealand', flag: '🇳🇿' },
    { value: 'ca', label: 'Canada', flag: '🇨🇦' },
];

const PERSONAS: { value: Persona; label: string; hint: string }[] = [
    { value: 'neutral', label: 'Neutral', hint: 'Default examiner' },
    { value: 'strict', label: 'Strict', hint: 'Pushes harder follow-ups' },
    { value: 'friendly', label: 'Friendly', hint: 'Encouraging tutor tone' },
    { value: 'formal', label: 'Formal', hint: 'Exam-room neutrality' },
];

const AccentPersonaPicker: React.FC<Props> = ({ accent, persona, onChange }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Examiner accent</p>
            <div className="flex flex-wrap gap-2">
                {ACCENTS.map(a => (
                    <button
                        key={a.value}
                        onClick={() => onChange({ accent: a.value, persona })}
                        className={`
                            text-xs rounded-md border px-2.5 py-1.5 transition-colors
                            ${accent === a.value
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-300'}
                        `}
                    >
                        <span className="mr-1">{a.flag}</span>{a.label}
                    </button>
                ))}
            </div>
        </div>
        <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Examiner persona</p>
            <div className="flex flex-wrap gap-2">
                {PERSONAS.map(p => (
                    <button
                        key={p.value}
                        onClick={() => onChange({ accent, persona: p.value })}
                        title={p.hint}
                        className={`
                            text-xs rounded-md border px-2.5 py-1.5 transition-colors
                            ${persona === p.value
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-300'}
                        `}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
        </div>
    </div>
);

export default AccentPersonaPicker;
