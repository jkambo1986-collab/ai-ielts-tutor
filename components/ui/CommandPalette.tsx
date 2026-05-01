/**
 * @file Global command palette (Cmd/Ctrl+K).
 *
 * Searches over: navigation sections, recent sessions (writing/speaking/
 * reading/listening), and SRS error cards. Hits the same backend the
 * dashboard already uses, so no new endpoints needed.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../../App';
import { IELTSSection } from '../../types';
import { dashboardService, ErrorCard } from '../../services/dashboardService';

type Command = {
    id: string;
    title: string;
    subtitle?: string;
    section: 'Navigate' | 'Sessions' | 'SRS' | 'Actions';
    action: () => void;
};

const NAV_TARGETS: { name: IELTSSection; alias?: string[] }[] = [
    { name: IELTSSection.Dashboard,        alias: ['home', 'overview'] },
    { name: IELTSSection.Speaking,         alias: ['speak', 'oral'] },
    { name: IELTSSection.Writing,          alias: ['write', 'essay'] },
    { name: IELTSSection.Reading,          alias: ['read', 'passage'] },
    { name: IELTSSection.Listening,        alias: ['listen', 'audio'] },
    { name: IELTSSection.IntegratedSkills, alias: ['integrated'] },
    { name: IELTSSection.Quiz,             alias: ['quiz', 'vocabulary'] },
    { name: IELTSSection.MockTests,        alias: ['mock', 'simulation'] },
    { name: IELTSSection.VoiceJournal,     alias: ['journal', 'free talk'] },
    { name: IELTSSection.DebateRooms,      alias: ['debate', 'group'] },
    { name: IELTSSection.TutorMarketplace, alias: ['tutor', 'human', 'live'] },
    { name: IELTSSection.Profile,          alias: ['settings', 'preferences'] },
];

const fuzzy = (q: string, ...fields: (string | undefined)[]) => {
    if (!q) return true;
    const lower = q.toLowerCase();
    return fields.some(f => f && f.toLowerCase().includes(lower));
};

const CommandPalette: React.FC = () => {
    const { setActiveTab, writingHistory, speakingHistory, readingHistory, listeningHistory } = useAppContext();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [errorCards, setErrorCards] = useState<ErrorCard[]>([]);
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement | null>(null);

    // Global keybind
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen(o => !o);
            } else if (e.key === 'Escape' && open) {
                setOpen(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open]);

    // Lazy-load error cards on first open
    useEffect(() => {
        if (open && errorCards.length === 0) {
            dashboardService.fetchErrorCards()
                .then(cards => setErrorCards(cards.slice(0, 30)))
                .catch(() => { /* ignore — palette still works */ });
        }
        if (open) {
            setQuery('');
            setActive(0);
            setTimeout(() => inputRef.current?.focus(), 10);
        }
    }, [open, errorCards.length]);

    const goTo = useCallback((s: IELTSSection) => {
        setActiveTab(s);
        setOpen(false);
    }, [setActiveTab]);

    const commands = useMemo<Command[]>(() => {
        const out: Command[] = [];

        // Navigate
        for (const t of NAV_TARGETS) {
            if (fuzzy(query, t.name, ...(t.alias || []))) {
                out.push({
                    id: `nav-${t.name}`,
                    title: t.name,
                    subtitle: 'Open section',
                    section: 'Navigate',
                    action: () => goTo(t.name),
                });
            }
        }

        // Sessions
        const addSessions = (
            sessions: { id: string; date: string }[],
            label: string,
            section: IELTSSection,
            getTitle: (s: any) => string,
        ) => {
            for (const s of sessions.slice(0, 10)) {
                const title = getTitle(s);
                if (fuzzy(query, title, label)) {
                    out.push({
                        id: `sess-${section}-${s.id}`,
                        title: `${label}: ${title}`,
                        subtitle: new Date(s.date).toLocaleDateString(),
                        section: 'Sessions',
                        action: () => goTo(section),
                    });
                }
            }
        };
        addSessions(writingHistory, 'Writing', IELTSSection.Writing, (s: any) => s.prompt || 'Untitled');
        addSessions(speakingHistory, 'Speaking', IELTSSection.Speaking, (s: any) => s.topic || 'Untitled');
        addSessions(readingHistory, 'Reading', IELTSSection.Reading, (s: any) => s.passageTitle || 'Untitled');
        addSessions(listeningHistory, 'Listening', IELTSSection.Listening, (s: any) => s.title || 'Untitled');

        // Error cards
        for (const card of errorCards) {
            if (fuzzy(query, card.error_text, card.category)) {
                out.push({
                    id: `card-${card.id}`,
                    title: card.error_text.slice(0, 80),
                    subtitle: `Flashcard · ${card.category}`,
                    section: 'SRS',
                    action: () => goTo(IELTSSection.Dashboard),
                });
            }
        }

        return out.slice(0, 50);
    }, [query, errorCards, writingHistory, speakingHistory, readingHistory, listeningHistory, goTo]);

    useEffect(() => {
        if (active >= commands.length) setActive(Math.max(0, commands.length - 1));
    }, [commands.length, active]);

    const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(a => Math.min(a + 1, commands.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(a => Math.max(a - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            commands[active]?.action();
        }
    };

    if (!open) return null;

    // Group commands by section for rendering.
    const grouped = commands.reduce<Record<string, Command[]>>((acc, c) => {
        (acc[c.section] = acc[c.section] || []).push(c);
        return acc;
    }, {});

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
            onClick={() => setOpen(false)}
        >
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <div
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
                <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
                    <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                        onKeyDown={onKey}
                        placeholder="Search nav, sessions, flashcards…"
                        className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                    />
                    <span className="text-[10px] font-mono text-slate-400 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded">
                        Esc
                    </span>
                </div>
                <div className="max-h-[55vh] overflow-y-auto py-2">
                    {commands.length === 0 && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 px-4 py-8 text-center">No matches.</p>
                    )}
                    {(Object.entries(grouped) as [string, Command[]][]).map(([section, items]) => (
                        <div key={section} className="px-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 mt-2 mb-1">
                                {section}
                            </p>
                            <ul>
                                {items.map((c) => {
                                    const idx = commands.indexOf(c);
                                    const isActive = idx === active;
                                    return (
                                        <li key={c.id}>
                                            <button
                                                onMouseEnter={() => setActive(idx)}
                                                onClick={() => c.action()}
                                                className={`w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded text-sm ${
                                                    isActive
                                                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100'
                                                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                }`}
                                            >
                                                <span className="truncate flex-1">{c.title}</span>
                                                {c.subtitle && (
                                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">{c.subtitle}</span>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
                <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>↑↓ to navigate · Enter to select</span>
                    <span>⌘K to toggle</span>
                </div>
            </div>
        </div>
    );
};

export default CommandPalette;
