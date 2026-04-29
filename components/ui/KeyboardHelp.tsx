/**
 * @file Shift+? keyboard cheat sheet overlay (F8).
 *
 * Listens globally; opens an overlay listing the platform shortcuts.
 */

import React, { useEffect, useState } from 'react';

interface Shortcut {
    keys: string;
    description: string;
}

const SHORTCUTS: Shortcut[] = [
    { keys: 'Shift + ?', description: 'Show this cheat sheet' },
    { keys: 'Esc', description: 'Close modals / overlays' },
    { keys: 'Tab', description: 'Move focus to the next interactive element' },
    { keys: 'Shift + Tab', description: 'Move focus backwards' },
    { keys: 'Enter', description: 'Activate the focused button' },
    { keys: 'g d', description: 'Go to Dashboard / Today' },
    { keys: 'g s', description: 'Go to Speaking' },
    { keys: 'g w', description: 'Go to Writing' },
    { keys: 'g r', description: 'Go to Reading' },
    { keys: 'g l', description: 'Go to Listening' },
    { keys: 'g p', description: 'Go to Profile' },
];

export const useKeyboardHelp = (onNav?: (key: string) => void) => {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        let lastG = 0;
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName;
            // Don't intercept inside text inputs.
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

            if (e.shiftKey && e.key === '?') {
                e.preventDefault();
                setOpen(o => !o);
                return;
            }
            if (e.key === 'Escape' && open) {
                setOpen(false);
                return;
            }
            if (onNav) {
                if (e.key === 'g') {
                    lastG = Date.now();
                    return;
                }
                if (Date.now() - lastG < 1500 && /^[a-z]$/i.test(e.key)) {
                    onNav(e.key.toLowerCase());
                    lastG = 0;
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onNav, open]);
    return { open, setOpen };
};

const KeyboardHelp: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
            <div
                role="dialog"
                aria-label="Keyboard shortcuts"
                onClick={e => e.stopPropagation()}
                className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5"
            >
                <header className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Keyboard shortcuts</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Close">✕</button>
                </header>
                <ul className="space-y-2">
                    {SHORTCUTS.map(s => (
                        <li key={s.keys} className="flex items-center justify-between text-sm">
                            <span className="text-slate-600 dark:text-slate-300">{s.description}</span>
                            <kbd className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded text-slate-700 dark:text-slate-200">
                                {s.keys}
                            </kbd>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default KeyboardHelp;
