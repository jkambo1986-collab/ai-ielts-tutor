/**
 * @file Notification bell + inbox drawer (P2).
 *
 * Polls /analytics/notifications every 60s for the unread count. Click
 * opens a slide-over with the latest 50 notifications and inline actions
 * (read / dismiss / CTA).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { uxService, AppNotification } from '../../services/uxService';
import { useAppContext } from '../../App';
import { IELTSSection } from '../../types';

const POLL_MS = 60_000;

const NotificationBell: React.FC = () => {
    const { setActiveTab } = useAppContext();
    const [open, setOpen] = useState(false);
    const [list, setList] = useState<AppNotification[]>([]);
    const [unread, setUnread] = useState(0);
    const pollRef = useRef<number | null>(null);

    const reload = useCallback(async () => {
        try {
            const r = await uxService.fetchNotifications();
            setList(r.notifications);
            setUnread(r.unread_count);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        reload();
        pollRef.current = window.setInterval(reload, POLL_MS);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [reload]);

    const dismiss = async (id: string) => {
        setList(prev => prev.filter(n => n.id !== id));
        try { await uxService.dismissNotification(id); } catch { /* ignore */ }
    };

    const markRead = async (n: AppNotification) => {
        if (n.read_at) return;
        setList(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
        setUnread(u => Math.max(0, u - 1));
        try { await uxService.markNotificationRead(n.id); } catch { /* ignore */ }
    };

    const handleCta = (n: AppNotification) => {
        markRead(n);
        const tgt = n.cta_target || '';
        const sectionMap: Record<string, IELTSSection | undefined> = {
            Today: IELTSSection.Dashboard,
            Dashboard: IELTSSection.Dashboard,
            Speaking: IELTSSection.Speaking,
            Writing: IELTSSection.Writing,
            Reading: IELTSSection.Reading,
            Listening: IELTSSection.Listening,
            Profile: IELTSSection.Profile,
        };
        if (sectionMap[tgt]) setActiveTab(sectionMap[tgt]!);
        setOpen(false);
    };

    return (
        <div className="relative">
            <button
                aria-label={`Notifications (${unread} unread)`}
                onClick={() => setOpen(o => !o)}
                className="relative p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unread > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40 sm:hidden bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden />
                    <div className="fixed sm:absolute z-50 inset-x-0 bottom-0 sm:inset-auto sm:right-0 sm:top-12 sm:bottom-auto sm:w-96 max-h-[80vh] sm:max-h-[70vh] bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-lg shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
                        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notifications</span>
                            <button onClick={() => setOpen(false)} aria-label="Close" className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">✕</button>
                        </header>
                        <div className="flex-1 overflow-y-auto">
                            {list.length === 0 ? (
                                <p className="text-sm text-slate-500 text-center p-6">You're all caught up.</p>
                            ) : (
                                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {list.map(n => (
                                        <li key={n.id} className={`px-4 py-3 ${n.read_at ? 'bg-white dark:bg-slate-900' : 'bg-blue-50 dark:bg-blue-950/30'}`}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{n.title}</p>
                                                    {n.body && <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{n.body}</p>}
                                                    <p className="text-[10px] text-slate-400 mt-1">
                                                        {new Date(n.created_at).toLocaleString()}
                                                    </p>
                                                </div>
                                                <button onClick={() => dismiss(n.id)} aria-label="Dismiss" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1">✕</button>
                                            </div>
                                            {n.cta_label && (
                                                <button
                                                    onClick={() => handleCta(n)}
                                                    className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                >
                                                    {n.cta_label} →
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default NotificationBell;
