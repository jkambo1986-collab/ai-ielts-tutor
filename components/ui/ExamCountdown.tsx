/**
 * @file Exam-date countdown banner (D3).
 *
 * Sits at the top of the main content area. Shows days-to-exam, with
 * urgency tone in the last 2 weeks. Includes a "Sync to calendar" button
 * that downloads an .ics file (D3 calendar export).
 */

import React from 'react';
import { useAppContext } from '../../App';
import { uxService } from '../../services/uxService';
import { useToast } from './Toast';
import { tokenStore, apiConfig } from '../../services/apiClient';

const ExamCountdown: React.FC = () => {
    const { currentUser } = useAppContext();
    const { toast } = useToast();
    if (!currentUser?.examDate) return null;

    const exam = new Date(currentUser.examDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.ceil((exam.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (Number.isNaN(days)) return null;

    const tone = days <= 1
        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900 text-rose-900 dark:text-rose-200'
        : days <= 7
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900 text-amber-900 dark:text-amber-200'
            : days <= 30
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-900 text-blue-900 dark:text-blue-200'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200';

    const phrase = days < 0
        ? `Exam was ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
        : days === 0
            ? "Exam is today — best of luck!"
            : `${days} day${days === 1 ? '' : 's'} until your exam`;

    const downloadIcs = async () => {
        try {
            const resp = await fetch(uxService.calendarIcsUrl(), {
                headers: {
                    'Authorization': `Bearer ${tokenStore.getAccess() ?? ''}`,
                    'X-Institute-Slug': apiConfig.instituteSlug,
                },
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'ielts-practice.ics';
            a.click();
            URL.revokeObjectURL(url);
            toast({ title: 'Calendar file downloaded', body: 'Import it into Google Calendar / Apple Calendar.', kind: 'success' });
        } catch (e) {
            toast({ title: 'Could not export calendar', body: e instanceof Error ? e.message : '', kind: 'error' });
        }
    };

    return (
        <div className={`rounded-lg border ${tone} px-3 py-2 flex items-center justify-between gap-3 text-sm mb-4`}>
            <span className="font-medium truncate">{phrase}</span>
            <button
                onClick={downloadIcs}
                className="text-xs px-2 py-1 rounded bg-white/60 dark:bg-slate-900/40 border border-current/30 hover:bg-white dark:hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-current flex-shrink-0"
            >
                Sync calendar
            </button>
        </div>
    );
};

export default ExamCountdown;
