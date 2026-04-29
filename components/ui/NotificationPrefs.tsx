/**
 * @file Notification preferences screen (P3). Used inside Profile.
 */

import React, { useEffect, useState } from 'react';
import { uxService, NotificationPrefs as PrefsShape } from '../../services/uxService';
import { useToast } from './Toast';

const EVENT_LABELS: Record<string, string> = {
    srs_due: 'Spaced-repetition cards due for review',
    streak_risk: 'My streak is about to break',
    instructor_note: 'Instructor leaves me a note',
    weekly_digest: 'Weekly summary',
    goal_reached: 'I hit a target band',
    exam_reminder: 'Exam-date countdown milestones',
};

const CHANNELS: { key: keyof PrefsShape; label: string; hint: string }[] = [
    { key: 'in_app', label: 'In-app', hint: 'Bell + inbox' },
    { key: 'browser_push', label: 'Browser push', hint: 'Native browser notifications when the app is open' },
    { key: 'email', label: 'Email', hint: 'Digests and milestone alerts' },
];

const NotificationPrefsPanel: React.FC = () => {
    const { toast } = useToast();
    const [prefs, setPrefs] = useState<PrefsShape | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        uxService.fetchPrefs()
            .then(r => { if (!cancelled) setPrefs(r.prefs); })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, []);

    const togglePush = async () => {
        if (!('Notification' in window)) {
            toast({ title: 'Browser does not support notifications', kind: 'warning' });
            return;
        }
        if (Notification.permission === 'granted') {
            new Notification('Notifications enabled', { body: 'You will hear from us when something matters.' });
            return;
        }
        const result = await Notification.requestPermission();
        if (result === 'granted') {
            toast({ title: 'Browser notifications enabled', kind: 'success' });
        } else {
            toast({ title: 'Permission denied', body: 'You can re-enable in browser settings.', kind: 'warning' });
        }
    };

    const setEvent = (channel: keyof PrefsShape, event: string, value: boolean) => {
        if (!prefs) return;
        setPrefs({ ...prefs, [channel]: { ...prefs[channel], [event]: value } });
    };

    const save = async () => {
        if (!prefs) return;
        setSaving(true);
        try {
            await uxService.savePrefs(prefs);
            toast({ title: 'Preferences saved', kind: 'success' });
        } catch (e) {
            toast({ title: 'Save failed', body: e instanceof Error ? e.message : '', kind: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (!prefs) return null;

    return (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <header>
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Notifications</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Choose which events reach you on which channel.</p>
            </header>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-xs text-slate-500 text-left border-b border-slate-200 dark:border-slate-800">
                            <th className="pb-2 pr-4 font-medium">Event</th>
                            {CHANNELS.map(c => (
                                <th key={c.key} className="pb-2 pr-2 font-medium text-center">
                                    {c.label}
                                    <p className="font-normal text-[10px] text-slate-400">{c.hint}</p>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {Object.keys(EVENT_LABELS).map(ev => (
                            <tr key={ev} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                                <td className="py-2 pr-4 text-slate-700 dark:text-slate-200">{EVENT_LABELS[ev]}</td>
                                {CHANNELS.map(c => (
                                    <td key={c.key} className="py-2 pr-2 text-center">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(prefs[c.key]?.[ev])}
                                            onChange={(e) => setEvent(c.key, ev, e.target.checked)}
                                            aria-label={`${c.label} — ${EVENT_LABELS[ev]}`}
                                            className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-blue-500"
                                        />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                    onClick={togglePush}
                    className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    Test browser permission
                </button>
                <button
                    onClick={save}
                    disabled={saving}
                    className="text-sm font-medium px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    {saving ? 'Saving…' : 'Save preferences'}
                </button>
            </div>
        </section>
    );
};

export default NotificationPrefsPanel;
