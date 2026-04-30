/**
 * @file Cross-skill connection chip on the writing/speaking landing screens.
 *
 * Pulls one contextual prompt from the existing /writing/contextual-prompts
 * or /speaking/contextual-prompts endpoint (Pro-gated; degrades silently
 * for free users). Surfaces a single chip "Try a prompt linked to [topic]
 * you saw recently" — clicking emits onSelect with the suggested prompt.
 *
 * Cooldown: dismissed for 24h via localStorage so the chip isn't naggy.
 */

import React, { useEffect, useState } from 'react';
import { generateContextualWritingPrompts, generateContextualSpeakingPrompts } from '../../services/geminiService';

type Mode = 'writing' | 'speaking';

interface Suggestion {
    prompt: string;
    reason: string;
}

const cooldownKey = (mode: Mode) => `xskill_chip_dismissed_${mode}`;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const CrossSkillChip: React.FC<{ mode: Mode; onSelect: (prompt: string) => void }> = ({ mode, onSelect }) => {
    const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        try {
            const ts = localStorage.getItem(cooldownKey(mode));
            if (ts && Date.now() - Number(ts) < COOLDOWN_MS) {
                setDismissed(true);
                return;
            }
        } catch { /* ignore */ }

        let cancelled = false;
        const fetcher = mode === 'writing'
            ? generateContextualWritingPrompts([], [])
            : generateContextualSpeakingPrompts([], []);
        fetcher
            .then(prompts => {
                if (cancelled) return;
                if (Array.isArray(prompts) && prompts.length > 0) {
                    const p = prompts[0] as { prompt?: string; text?: string; reason?: string };
                    const text = p.prompt || p.text || '';
                    if (text) setSuggestion({ prompt: text, reason: p.reason || '' });
                }
            })
            .catch(() => { /* free users 402 here — silent is correct */ });
        return () => { cancelled = true; };
    }, [mode]);

    const dismiss = () => {
        setDismissed(true);
        try { localStorage.setItem(cooldownKey(mode), String(Date.now())); } catch { /* ignore */ }
    };

    if (dismissed || !suggestion) return null;

    return (
        <div
            className="mb-3 flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-800 px-3 py-2 text-sm"
            role="status"
        >
            <span className="text-violet-700 dark:text-violet-300 text-xs font-bold uppercase tracking-wide shrink-0 mt-0.5">
                Linked
            </span>
            <div className="flex-1 min-w-0">
                <p className="text-violet-900 dark:text-violet-100 font-medium leading-snug">
                    {suggestion.reason || `Try this ${mode} prompt linked to your recent practice.`}
                </p>
                <p className="text-xs text-violet-800/80 dark:text-violet-200/80 mt-1 line-clamp-2">
                    {suggestion.prompt}
                </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <button
                    onClick={() => { onSelect(suggestion.prompt); dismiss(); }}
                    className="text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 px-2 py-1 rounded"
                >
                    Use
                </button>
                <button
                    onClick={dismiss}
                    aria-label="Dismiss"
                    className="text-violet-700/60 hover:text-violet-900 dark:text-violet-200/60 dark:hover:text-violet-100 px-1"
                >
                    ✕
                </button>
            </div>
        </div>
    );
};

export default CrossSkillChip;
