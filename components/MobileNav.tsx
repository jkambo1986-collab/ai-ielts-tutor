/**
 * @file Fixed bottom-tab navigation for narrow viewports (< 768px).
 *
 * Hidden on md and up; the existing Sidebar handles desktop. Five tabs:
 * Today, Writing, Speaking, Reading, More (which includes Listening +
 * Profile). On a phone, this is the natural touch target — sidebars
 * collapse to a hamburger that students consistently miss in usage data.
 */

import React from 'react';
import { useAppContext } from '../App';
import { IELTSSection } from '../types';

interface TabDef {
    section: IELTSSection;
    label: string;
    glyph: string; // Single character so we don't pull a new icon dep
}

const TABS: TabDef[] = [
    { section: IELTSSection.Dashboard, label: 'Today', glyph: '◐' },
    { section: IELTSSection.Writing, label: 'Writing', glyph: '✎' },
    { section: IELTSSection.Speaking, label: 'Speaking', glyph: '◉' },
    { section: IELTSSection.Reading, label: 'Reading', glyph: '☰' },
    { section: IELTSSection.Profile, label: 'Profile', glyph: '◯' },
];

const MobileNav: React.FC = () => {
    const { activeTab, setActiveTab } = useAppContext();

    return (
        <nav
            aria-label="Primary"
            className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)]"
        >
            <ul className="flex items-stretch justify-between">
                {TABS.map(t => {
                    const active = activeTab === t.section;
                    return (
                        <li key={t.section} className="flex-1">
                            <button
                                type="button"
                                onClick={() => setActiveTab(t.section)}
                                aria-current={active ? 'page' : undefined}
                                className={`w-full flex flex-col items-center justify-center py-2 text-[10px] font-medium ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
                            >
                                <span aria-hidden className="text-base leading-none">{t.glyph}</span>
                                <span className="mt-0.5">{t.label}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};

export default MobileNav;
