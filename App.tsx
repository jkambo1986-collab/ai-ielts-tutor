/**
 * @file The root component of the application.
 * It manages the main layout, active tab state, and renders the corresponding tutor component.
 */

import React, { useState, useCallback, lazy, Suspense, useEffect, createContext, useContext, ReactNode, useTransition } from 'react';
import { IELTSSection, UserProfile, IAppContext, WritingSessionSummary, ReadingSessionSummary, ListeningSessionSummary, SpeakingSessionSummary } from './types';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Today from './components/Today';
import ErrorBoundary from './components/ErrorBoundary';
import Loader from './components/Loader';
import AuthPage from './components/AuthPage';
import { authService } from './services/authService';
import { historyService } from './services/historyService';
import { ToastProvider } from './components/ui/Toast';
import { ThemeProvider, useTheme } from './components/ui/ThemeProvider';
import NotificationBell from './components/ui/NotificationBell';
import ResumePill from './components/ui/ResumePill';
import ExamCountdown from './components/ui/ExamCountdown';
import OnboardingWizard from './components/onboarding/OnboardingWizard';
import KeyboardHelp, { useKeyboardHelp } from './components/ui/KeyboardHelp';
import PublicProgressPage from './components/PublicProgressPage';

// -- APP CONTEXT -- //
const AppContext = createContext<IAppContext | null>(null);

/**
 * Custom hook to consume the AppContext.
 * Ensures the context is used within a provider.
 */
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};


// -- LAZY-LOADED COMPONENTS -- //
const SpeakingTutor = lazy(() => import('./components/SpeakingTutor'));
const WritingTutor = lazy(() => import('./components/WritingTutor'));
const ReadingTutor = lazy(() => import('./components/ReadingTutor'));
const ListeningTutor = lazy(() => import('./components/ListeningTutor'));
const IntegratedSkillsLab = lazy(() => import('./components/IntegratedSkillsLab'));
const QuizTutor = lazy(() => import('./components/QuizTutor'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));

/**
 * Renders the main content of the application based on the active tab.
 * Consumes state from AppContext.
 */
const AppContent: React.FC = () => {
    // FIX: Active tab is now managed by the global context for cross-component navigation.
    const { currentUser, isLoadingSession, view, setView, activeTab, setActiveTab } = useAppContext();
    const [showOnboard, setShowOnboard] = useState(false);

    // Sync server-side theme_pref into the ThemeProvider on profile load.
    const { setTheme } = useTheme();
    useEffect(() => {
        if (currentUser?.themePref) setTheme(currentUser.themePref);
    }, [currentUser?.themePref, setTheme]);

    // Onboarding wizard fires once when a user has no `onboardedAt`.
    useEffect(() => {
        if (currentUser && !currentUser.onboardedAt) setShowOnboard(true);
    }, [currentUser]);

    // Shift+? help overlay + g+letter quick-jump (F8)
    const navMap: Record<string, IELTSSection> = {
        d: IELTSSection.Dashboard,
        s: IELTSSection.Speaking,
        w: IELTSSection.Writing,
        r: IELTSSection.Reading,
        l: IELTSSection.Listening,
        p: IELTSSection.Profile,
        q: IELTSSection.Quiz,
    };
    const { open: helpOpen, setOpen: setHelpOpen } = useKeyboardHelp((k) => {
        const sec = navMap[k];
        if (sec) setActiveTab(sec);
    });

    const renderContent = useCallback(() => {
        if (!currentUser) return null;

        switch (activeTab) {
            case IELTSSection.Dashboard: return <><Today /><div className="my-6 border-t border-slate-200 dark:border-slate-800" /><Dashboard /></>;
            case IELTSSection.Speaking: return <SpeakingTutor />;
            case IELTSSection.Writing: return <WritingTutor />;
            case IELTSSection.Reading: return <ReadingTutor />;
            case IELTSSection.Listening: return <ListeningTutor />;
            case IELTSSection.IntegratedSkills: return <IntegratedSkillsLab />;
            case IELTSSection.Quiz: return <QuizTutor />;
            case IELTSSection.Profile: return <ProfilePage />;
            case IELTSSection.Admin: return <AdminPanel />;
            default: return null;
        }
    }, [activeTab, currentUser]);

    if (isLoadingSession) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
                <Loader text="Loading your session..." />
            </div>
        );
    }

    if (!currentUser) {
        return <AuthPage />;
    }

    return (
        <div className="min-h-screen md:flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <SectionTopBar />
                <main className="flex-1 overflow-y-auto">
                    <div
                        id="main-content"
                        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8"
                    >
                        <ResumePill />
                        <ExamCountdown />
                        <ErrorBoundary>
                            <Suspense fallback={<div className="flex justify-center items-center h-96"><Loader text="Loading section..." /></div>}>
                                {renderContent()}
                            </Suspense>
                        </ErrorBoundary>
                    </div>
                    <footer className="text-center py-6 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800">
                        Powered by Google Gemini
                    </footer>
                </main>
            </div>
            {showOnboard && (
                <OnboardingWizard
                    onComplete={() => setShowOnboard(false)}
                    onSkip={() => setShowOnboard(false)}
                />
            )}
            <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
        </div>
    );
};

/**
 * Slim top bar shown above the main content. Communicates which section is
 * active and gives the page a polished frame without competing with the
 * sidebar navigation.
 */
const SECTION_BLURBS: Partial<Record<IELTSSection, string>> = {
    [IELTSSection.Dashboard]: 'Your progress at a glance.',
    [IELTSSection.Speaking]: 'Practice with a life-like AI examiner.',
    [IELTSSection.Writing]: 'Submit an essay and get rubric-based feedback.',
    [IELTSSection.Reading]: 'Read passages and answer comprehension questions.',
    [IELTSSection.Listening]: 'Listen to audio scripts and test your understanding.',
    [IELTSSection.IntegratedSkills]: 'Combine reading, listening, and writing in one task.',
    [IELTSSection.Quiz]: 'Quick warm-ups across grammar, reading and listening.',
    [IELTSSection.Profile]: 'Account info and ESL preferences.',
    [IELTSSection.Admin]: 'Sitemap, users, and platform usage.',
};

const SectionTopBar: React.FC = () => {
    const { activeTab, isSectionLoading } = useAppContext();
    return (
        <div className="hidden md:flex h-16 px-6 lg:px-10 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm sticky top-0 z-10">
            <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {activeTab}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {SECTION_BLURBS[activeTab] ?? ''}
                </p>
            </div>
            <div className="flex items-center gap-2">
                {isSectionLoading && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                        Loading…
                    </span>
                )}
                <NotificationBell />
            </div>
        </div>
    );
};


/**
 * The provider component that manages and distributes the application's global state.
 */
const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
    const [isLoadingSession, setIsLoadingSession] = useState(true);
    const [view, setView] = useState<'tutor' | 'pricing'>('tutor');
    
    // FIX: Lifted tab state into context for global navigation control.
    const [activeTab, setActiveTab] = useState<IELTSSection>(IELTSSection.Dashboard);
    const [isPending, startTransition] = useTransition();

    // State for cross-component targeted practice sessions.
    const [targetedPractice, setTargetedPractice] = useState<{ destination: IELTSSection; payload: any; } | null>(null);

    // Centralized history states
    const [writingHistory, setWritingHistory] = useState<WritingSessionSummary[]>([]);
    const [speakingHistory, setSpeakingHistory] = useState<SpeakingSessionSummary[]>([]);
    const [readingHistory, setReadingHistory] = useState<ReadingSessionSummary[]>([]);
    const [listeningHistory, setListeningHistory] = useState<ListeningSessionSummary[]>([]);

    // Load all data on initial app load.
    // Now async: synchronously check token presence, then fetch /me + history
    // from the backend. Falls back to local cache only if the server is
    // unreachable so users at least see something on a flaky network.
    useEffect(() => {
        let cancelled = false;
        const cached = authService.checkSession();
        if (cached) setCurrentUser(cached);

        (async () => {
            const user = await authService.refreshSession();
            if (cancelled) return;
            setCurrentUser(user);

            // Hydration order:
            //   1. localStorage (instant — avoids a blank dashboard during the fetch)
            //   2. backend (source of truth — overwrites once available)
            // localStorage thus serves as a stale-while-revalidate cache.
            try {
                const wh = localStorage.getItem('writingHistory');
                const sh = localStorage.getItem('speakingHistory');
                const rh = localStorage.getItem('readingHistory');
                const lh = localStorage.getItem('listeningHistory');
                if (wh) setWritingHistory(JSON.parse(wh));
                if (sh) setSpeakingHistory(JSON.parse(sh));
                if (rh) setReadingHistory(JSON.parse(rh));
                if (lh) setListeningHistory(JSON.parse(lh));
            } catch (e) {
                console.error("Failed to load cached history", e);
            }

            // Fetch from backend if logged in. Failures are non-fatal — the
            // user just sees their cached data.
            if (user) {
                try {
                    const bundle = await historyService.fetchAll();
                    if (cancelled) return;
                    setWritingHistory(bundle.writing);
                    setSpeakingHistory(bundle.speaking);
                    setReadingHistory(bundle.reading);
                    setListeningHistory(bundle.listening);
                    // Refresh localStorage cache so next reload is fast
                    localStorage.setItem('writingHistory', JSON.stringify(bundle.writing));
                    localStorage.setItem('speakingHistory', JSON.stringify(bundle.speaking));
                    localStorage.setItem('readingHistory', JSON.stringify(bundle.reading));
                    localStorage.setItem('listeningHistory', JSON.stringify(bundle.listening));
                } catch (e) {
                    console.warn("Backend history fetch failed; using cache.", e);
                }
            }

            setIsLoadingSession(false);
        })();

        return () => { cancelled = true; };
    }, []);

    const handleSetActiveTab = useCallback((tab: IELTSSection) => {
        startTransition(() => {
            setActiveTab(tab);
        });
    }, []);

    const handleLoginSuccess = (user: UserProfile) => {
        setCurrentUser(user);
    };

    const handleLogout = () => {
        authService.logout();
        setCurrentUser(null);
    };
    
    const handleProfileUpdate = useCallback(async (updates: Partial<UserProfile>) => {
        if (currentUser) {
            const updatedUser = await authService.updateUserProfile(currentUser.id, updates);
            setCurrentUser(updatedUser);
        }
    }, [currentUser]);

    const handleUpgrade = async (userId: string) => {
        const updatedUser = await authService.upgradeUserPlan(userId);
        setCurrentUser(updatedUser);
    };
    
    // -- History Management Functions -- //
    
    const addWritingSession = (session: WritingSessionSummary) => {
        setWritingHistory(prev => {
            const updated = [session, ...prev].slice(0, 20);
            localStorage.setItem('writingHistory', JSON.stringify(updated));
            return updated;
        });
    };
    
    const addSpeakingSession = (session: SpeakingSessionSummary) => {
        setSpeakingHistory(prev => {
            // Remove the old version of the session if it's being updated (e.g., after analysis)
            const filtered = prev.filter(s => s.id !== session.id);
            const updated = [session, ...filtered].slice(0, 50);
            localStorage.setItem('speakingHistory', JSON.stringify(updated));
            return updated;
        });
    };

    const addReadingSession = (session: ReadingSessionSummary) => {
        setReadingHistory(prev => {
            const updated = [session, ...prev].slice(0, 20);
            localStorage.setItem('readingHistory', JSON.stringify(updated));
            return updated;
        });
    };
    
    const addListeningSession = (session: ListeningSessionSummary) => {
        setListeningHistory(prev => {
            const updated = [session, ...prev].slice(0, 20);
            localStorage.setItem('listeningHistory', JSON.stringify(updated));
            return updated;
        });
    };
    
    const clearAllHistories = () => {
        localStorage.removeItem('writingHistory');
        localStorage.removeItem('speakingHistory');
        localStorage.removeItem('readingHistory');
        localStorage.removeItem('listeningHistory');
        setWritingHistory([]);
        setSpeakingHistory([]);
        setReadingHistory([]);
        setListeningHistory([]);
    };

    const clearSpeakingHistory = () => {
        localStorage.removeItem('speakingHistory');
        setSpeakingHistory([]);
    };

    const contextValue: IAppContext = {
        currentUser,
        isLoadingSession,
        handleLoginSuccess,
        handleLogout,
        handleProfileUpdate,
        handleUpgrade: (userId: string) => handleUpgrade(userId).catch(console.error),
        view,
        setView,
        activeTab,
        setActiveTab: handleSetActiveTab,
        isSectionLoading: isPending,
        targetedPractice,
        setTargetedPractice,
        writingHistory,
        speakingHistory,
        readingHistory,
        listeningHistory,
        addWritingSession,
        addSpeakingSession,
        addReadingSession,
        addListeningSession,
        clearAllHistories,
        clearSpeakingHistory,
    };

    return (
        <AppContext.Provider value={contextValue}>
            {children}
        </AppContext.Provider>
    );
};

/**
 * Read URL once at app start and decide whether to render the public
 * progress profile or the authenticated app. We deliberately keep this
 * lightweight (no router dependency) — `/u/<slug>` is the only public
 * route, everything else is the authed SPA.
 */
const App: React.FC = () => {
  // Public progress profile: /u/<slug>
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const publicMatch = path.match(/^\/u\/([\w-]+)\/?$/);
  if (publicMatch) {
      return (
          <ThemeProvider>
              <PublicProgressPage slug={publicMatch[1]} />
          </ThemeProvider>
      );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <AppProvider>
            <AppContent/>
        </AppProvider>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default App;