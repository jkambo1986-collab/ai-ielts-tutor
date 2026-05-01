/**
 * @file Persistent left-pane navigation with full mobile responsive
 * behaviour (F2). Below the `md` breakpoint, the sidebar collapses into
 * a top bar + slide-over drawer triggered by a hamburger.
 */

import React, { useEffect, useState } from 'react';
import { ADMIN_ROLES, IELTSSection, SubscriptionPlan } from '../types';
import {
    SpeakingIcon, WritingIcon, ReadingIcon, ListeningIcon,
    DashboardIcon, QuizIcon, IntegratedSkillsIcon, UserIcon,
} from './Icons';
import { useAppContext } from '../App';
import { ThemeToggle } from './ui/ThemeProvider';

interface NavItem {
    name: IELTSSection;
    icon: React.FC<{ className?: string }>;
    description: string;
}

const PRIMARY_NAV: NavItem[] = [
    { name: IELTSSection.Dashboard,        icon: DashboardIcon,        description: 'Progress overview' },
    { name: IELTSSection.Speaking,         icon: SpeakingIcon,         description: 'AI conversation practice' },
    { name: IELTSSection.Writing,          icon: WritingIcon,          description: 'Essay scoring + feedback' },
    { name: IELTSSection.Reading,          icon: ReadingIcon,          description: 'Comprehension drills' },
    { name: IELTSSection.Listening,        icon: ListeningIcon,        description: 'Audio comprehension' },
    { name: IELTSSection.IntegratedSkills, icon: IntegratedSkillsIcon, description: 'Multi-skill tasks' },
    { name: IELTSSection.Quiz,             icon: QuizIcon,             description: 'Quick quizzes' },
];

const MORE_PRACTICE_NAV: NavItem[] = [
    { name: IELTSSection.MockTests,        icon: DashboardIcon,        description: 'Full-length simulations' },
    { name: IELTSSection.VoiceJournal,     icon: SpeakingIcon,         description: 'Free-talk speaking' },
    { name: IELTSSection.DebateRooms,      icon: SpeakingIcon,         description: 'Group debate practice' },
    { name: IELTSSection.TutorMarketplace, icon: UserIcon,             description: '1-on-1 human tutors' },
];

const ACCOUNT_NAV: NavItem[] = [
    { name: IELTSSection.Profile, icon: UserIcon, description: 'Account & ESL preferences' },
];

function renderNavButton(
    item: NavItem,
    activeTab: IELTSSection,
    isSectionLoading: boolean,
    collapsed: boolean,
    handleNavClick: (n: IELTSSection) => void,
) {
    const Icon = item.icon;
    const isActive = activeTab === item.name;
    return (
        <button
            key={item.name}
            role="tab"
            aria-selected={isActive}
            aria-controls="main-content"
            id={`tab-${item.name}`}
            onClick={() => handleNavClick(item.name)}
            disabled={isSectionLoading}
            title={collapsed ? item.name : undefined}
            className={`
                group w-full flex items-center gap-3 rounded-lg px-3 py-3 md:py-2.5
                text-sm font-medium transition-colors duration-150
                focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
                ${isActive
                    ? 'bg-gradient-to-r from-blue-500 to-teal-400 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }
                ${isSectionLoading ? 'opacity-70 cursor-not-allowed' : ''}
            `}
        >
            <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-blue-500'}`} />
            {!collapsed && <span className="flex-1 text-left truncate">{item.name}</span>}
            {!collapsed && isActive && (
                <span className="h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden />
            )}
        </button>
    );
}

const Sidebar: React.FC = () => {
    const {
        activeTab, setActiveTab, isSectionLoading,
        currentUser, handleLogout,
    } = useAppContext();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    // Close mobile drawer on viewport widening to desktop.
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 768px)');
        const handler = () => mq.matches && setMobileOpen(false);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // Lock body scroll while drawer is open.
    useEffect(() => {
        if (mobileOpen) {
            const prev = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = prev; };
        }
        return undefined;
    }, [mobileOpen]);

    const [moreOpen, setMoreOpen] = useState(true);

    if (!currentUser) return null;
    const isAdmin = ADMIN_ROLES.includes(currentUser.role);
    const isInstructor = currentUser.role === 'instructor';

    const morePracticeItems: NavItem[] = [
        ...MORE_PRACTICE_NAV,
        ...(isAdmin || isInstructor
            ? [{ name: IELTSSection.MarkerQueue, icon: UserIcon, description: 'Marker review queue' } as NavItem]
            : []),
    ];

    const handleNavClick = (name: IELTSSection) => {
        setActiveTab(name);
        setMobileOpen(false);
    };

    return (
        <>
            {/* MOBILE TOP BAR (visible below md) */}
            <div className="md:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-3 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm">
                <button
                    aria-label="Open navigation"
                    aria-expanded={mobileOpen}
                    onClick={() => setMobileOpen(true)}
                    className="p-2 -ml-2 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {activeTab}
                </span>
                <button
                    onClick={() => setActiveTab(IELTSSection.Profile)}
                    aria-label="Open profile"
                    className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 text-white text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    {currentUser.name?.charAt(0)?.toUpperCase() || '?'}
                </button>
            </div>

            {/* MOBILE DRAWER OVERLAY */}
            {mobileOpen && (
                <div
                    className="md:hidden fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm"
                    onClick={() => setMobileOpen(false)}
                    aria-hidden
                />
            )}

            {/* SIDEBAR (desktop persistent / mobile slide-over) */}
            <aside
                role="navigation"
                aria-label="Primary"
                className={`
                    fixed md:sticky md:top-0 inset-y-0 left-0 z-40
                    ${collapsed ? 'md:w-20' : 'md:w-64'}
                    w-72 max-w-[85vw]
                    transition-transform duration-200 ease-in-out
                    ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                    bg-white dark:bg-slate-900
                    border-r border-slate-200 dark:border-slate-800
                    flex flex-col h-screen
                `}
            >
                {/* Brand */}
                <div className="h-14 md:h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center space-x-3 overflow-hidden">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-7 w-7 md:h-8 md:w-8 shrink-0 text-blue-500"
                            viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        >
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            <path d="M12 11.5l3.5 3.5" />
                            <path d="M12 8v8" />
                            <path d="M8.5 15L12 11.5" />
                        </svg>
                        {!collapsed && (
                            <div className="flex flex-col leading-tight">
                                <span className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">
                                    AI IELTS Tutor
                                </span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    Personalized practice
                                </span>
                            </div>
                        )}
                    </div>
                    <button
                        className="md:hidden p-2 -mr-2 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        aria-label="Close navigation"
                        onClick={() => setMobileOpen(false)}
                    >
                        ✕
                    </button>
                </div>

                {/* Nav */}
                <nav role="tablist" aria-label="IELTS Sections" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
                    {PRIMARY_NAV.map((item) => renderNavButton(item, activeTab, isSectionLoading, collapsed, handleNavClick))}

                    {/* Secondary "More practice" group */}
                    {!collapsed && (
                        <button
                            type="button"
                            onClick={() => setMoreOpen(o => !o)}
                            aria-expanded={moreOpen}
                            className="w-full flex items-center justify-between mt-4 mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 focus:outline-none"
                        >
                            <span>More practice</span>
                            <span aria-hidden className={`transition-transform ${moreOpen ? 'rotate-90' : ''}`}>›</span>
                        </button>
                    )}
                    {moreOpen && morePracticeItems.map((item) => renderNavButton(item, activeTab, isSectionLoading, collapsed, handleNavClick))}

                    {!collapsed && <div className="my-3 border-t border-slate-200 dark:border-slate-800" />}
                    {ACCOUNT_NAV.map((item) => renderNavButton(item, activeTab, isSectionLoading, collapsed, handleNavClick))}
                    {isAdmin && renderNavButton(
                        { name: IELTSSection.Admin, icon: UserIcon, description: 'Sitemap & users' },
                        activeTab, isSectionLoading, collapsed, handleNavClick,
                    )}
                </nav>

                {/* Theme toggle (F5) */}
                <div className="px-3 pb-2 hidden md:flex md:flex-col md:items-stretch gap-2">
                    {!collapsed && <ThemeToggle />}
                </div>

                {/* Collapse toggle (desktop only) */}
                <button
                    onClick={() => setCollapsed(c => !c)}
                    className="hidden md:flex mx-3 mb-2 items-center justify-center h-9 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    >
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                    {!collapsed && <span className="ml-2 text-xs">Collapse</span>}
                </button>

                {/* User footer */}
                <div className="border-t border-slate-200 dark:border-slate-800 p-3">
                    <div className="md:hidden mb-3">
                        <ThemeToggle compact />
                    </div>
                    <button
                        type="button"
                        onClick={() => handleNavClick(IELTSSection.Profile)}
                        title={collapsed ? 'Open profile' : undefined}
                        className={`
                            w-full flex items-center rounded-md p-1.5 -m-1.5
                            hover:bg-slate-100 dark:hover:bg-slate-800
                            focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
                            transition-colors
                            ${collapsed ? 'justify-center' : 'gap-3'}
                        `}
                    >
                        <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center text-white text-sm font-semibold">
                            {currentUser.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        {!collapsed && (
                            <div className="flex-1 min-w-0 text-left">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                                        {currentUser.name}
                                    </span>
                                    {currentUser.plan === SubscriptionPlan.Pro && (
                                        <span className="bg-amber-400 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                            PRO
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs text-slate-500 dark:text-slate-400 truncate block">
                                    {currentUser.email}
                                </span>
                            </div>
                        )}
                    </button>
                    {!collapsed && (
                        <button
                            onClick={handleLogout}
                            className="mt-3 w-full px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-colors"
                        >
                            Sign out
                        </button>
                    )}
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
