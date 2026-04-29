/**
 * @file Theme provider (F5). Three modes: system / light / dark.
 *
 * - On mount, reads the user's stored preference from localStorage; if
 *   missing, falls back to `system` (and tracks `prefers-color-scheme`).
 * - Applies/removes the `dark` class on <html>.
 * - When a logged-in user has a server-side `theme_pref`, the AppProvider
 *   syncs that on profile load by calling `setTheme(...)` once.
 *
 * Keep tailwind dark mode = "class" (default in this project).
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type ThemePref = 'system' | 'light' | 'dark';

interface Ctx {
    theme: ThemePref;
    resolved: 'light' | 'dark';
    setTheme: (t: ThemePref) => void;
    toggle: () => void;
}

const ThemeContext = createContext<Ctx | null>(null);
const STORAGE_KEY = 'ielts_theme_pref';

const getSystemTheme = (): 'light' | 'dark' =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<ThemePref>(() => {
        if (typeof window === 'undefined') return 'system';
        return (localStorage.getItem(STORAGE_KEY) as ThemePref) || 'system';
    });
    const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
        typeof window === 'undefined' ? 'light' : (theme === 'system' ? getSystemTheme() : theme),
    );

    // Apply class + listen for system changes when in 'system' mode.
    useEffect(() => {
        const apply = (t: 'light' | 'dark') => {
            setResolved(t);
            const root = document.documentElement;
            if (t === 'dark') root.classList.add('dark');
            else root.classList.remove('dark');
        };
        if (theme === 'system') {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            const handler = () => apply(mq.matches ? 'dark' : 'light');
            apply(mq.matches ? 'dark' : 'light');
            mq.addEventListener('change', handler);
            return () => mq.removeEventListener('change', handler);
        }
        apply(theme);
        return undefined;
    }, [theme]);

    const setTheme = useCallback((t: ThemePref) => {
        setThemeState(t);
        try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
    }, []);

    const toggle = useCallback(() => {
        setTheme(resolved === 'dark' ? 'light' : 'dark');
    }, [resolved, setTheme]);

    return (
        <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>
            {children}
        </ThemeContext.Provider>
    );
};

export function useTheme(): Ctx {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
    return ctx;
}

export const ThemeToggle: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    const { theme, setTheme } = useTheme();
    const opts: { value: ThemePref; label: string; icon: string }[] = [
        { value: 'light', label: 'Light', icon: '☀' },
        { value: 'dark', label: 'Dark', icon: '☾' },
        { value: 'system', label: 'System', icon: '◐' },
    ];
    return (
        <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-md bg-slate-100 dark:bg-slate-800 p-0.5">
            {opts.map(o => {
                const active = theme === o.value;
                return (
                    <button
                        key={o.value}
                        role="radio"
                        aria-checked={active}
                        onClick={() => setTheme(o.value)}
                        title={o.label}
                        className={`
                            text-xs px-2 py-1 rounded transition-colors
                            ${active ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}
                        `}
                    >
                        <span aria-hidden>{o.icon}</span>{!compact && <span className="ml-1">{o.label}</span>}
                    </button>
                );
            })}
        </div>
    );
};
