/**
 * @file Resume-draft banner for the writing tutor.
 *
 * On WritingTutor mount, checks for a server-side WritingDraft and offers
 * to restore it. Today, autosave runs in the background but the FE never
 * tells the user a draft exists — students restart from scratch and lose
 * progress. Closes flow gap A3.
 */

import React, { useEffect, useState } from 'react';
import { uxService, WritingDraftRow } from '../../services/uxService';

interface Props {
    /** Currently-loaded prompt — banner only shows if a matching draft exists. */
    currentPrompt: string;
    /** Whether the user has already typed anything in the editor. If so, we
     *  don't surface the banner (would be confusing). */
    editorIsEmpty: boolean;
    onResume: (essay: string, prompt: string) => void;
}

const ResumeDraftBanner: React.FC<Props> = ({ currentPrompt, editorIsEmpty, onResume }) => {
    const [draft, setDraft] = useState<WritingDraftRow | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!editorIsEmpty) return;
        let cancelled = false;
        uxService.fetchDrafts()
            .then(r => {
                if (cancelled) return;
                // Pick the most-recent non-trivial draft. If a prompt is loaded,
                // prefer the matching draft; otherwise show the latest.
                const match =
                    (r.drafts || []).find(d => d.prompt === currentPrompt && d.word_count >= 30)
                    ?? (r.drafts || []).find(d => d.word_count >= 30);
                if (match) setDraft(match);
            })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, [currentPrompt, editorIsEmpty]);

    if (dismissed || !draft || !editorIsEmpty) return null;

    const updated = new Date(draft.updated_at);
    const ago = Math.max(0, Math.floor((Date.now() - updated.getTime()) / 60000));
    const agoLabel = ago < 60
        ? `${ago} min ago`
        : ago < 1440 ? `${Math.floor(ago / 60)} hr ago`
        : `${Math.floor(ago / 1440)} day${Math.floor(ago / 1440) === 1 ? '' : 's'} ago`;

    return (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 mb-3">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                        Unfinished draft
                    </p>
                    <p className="text-sm font-semibold text-amber-950 dark:text-amber-100 mt-0.5">
                        You have a {draft.word_count}-word draft from {agoLabel}.
                    </p>
                    <p className="text-xs text-amber-900/80 dark:text-amber-200/80 mt-0.5 line-clamp-2">
                        Prompt: {draft.prompt}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => { onResume(draft.essay, draft.prompt); setDismissed(true); }}
                        className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-md"
                    >
                        Resume
                    </button>
                    <button
                        type="button"
                        onClick={() => setDismissed(true)}
                        aria-label="Discard"
                        className="text-amber-900/60 hover:text-amber-950 dark:text-amber-200/60 dark:hover:text-amber-100 px-2 text-xs"
                    >
                        Discard
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ResumeDraftBanner;
