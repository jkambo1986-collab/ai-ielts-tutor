/**
 * @file Inline panel for the Profile page that lets the user opt in/out of
 * a public progress profile (X2).
 */

import React, { useState } from 'react';
import { uxService } from '../services/uxService';
import { authService } from '../services/authService';
import { useAppContext } from '../App';
import { useToast } from './ui/Toast';

const PublicProfileToggle: React.FC = () => {
    const { currentUser, handleLoginSuccess } = useAppContext();
    const { toast } = useToast();
    const [busy, setBusy] = useState(false);
    if (!currentUser) return null;

    const enabled = !!currentUser.publicProgressSlug;
    const url = enabled && currentUser.publicProgressSlug ? uxService.publicProfileUrl(currentUser.publicProgressSlug) : null;

    const toggle = async () => {
        setBusy(true);
        try {
            await uxService.togglePublicProfile(!enabled);
            const fresh = await authService.refreshSession();
            if (fresh) handleLoginSuccess(fresh);
            toast({ title: !enabled ? 'Public profile enabled' : 'Public profile disabled', kind: 'success' });
        } catch (e) {
            toast({ title: 'Could not save', body: e instanceof Error ? e.message : '', kind: 'error' });
        } finally {
            setBusy(false);
        }
    };

    const copyUrl = async () => {
        if (!url) return;
        try { await navigator.clipboard.writeText(url); toast({ title: 'Link copied', kind: 'success' }); } catch { /* ignore */ }
    };

    return (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <header>
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Public progress profile</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    A read-only page showing your target band, streak, and last 5 sessions. No transcripts. Useful for tutors and visa records.
                </p>
            </header>
            <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700 dark:text-slate-200">
                    {enabled ? 'Enabled' : 'Disabled'}
                </span>
                <button
                    role="switch"
                    aria-checked={enabled}
                    disabled={busy}
                    onClick={toggle}
                    className={`relative inline-flex h-6 w-11 cursor-pointer rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'} disabled:opacity-50`}
                >
                    <span className={`h-5 w-5 mt-0.5 ml-0.5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
                </button>
            </div>
            {enabled && url && (
                <div className="flex items-center gap-2">
                    <input readOnly value={url} className="flex-1 text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1.5 rounded" onClick={(e) => (e.target as HTMLInputElement).select()} />
                    <button onClick={copyUrl} className="text-xs px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600">Copy</button>
                </div>
            )}
        </section>
    );
};

export default PublicProfileToggle;
