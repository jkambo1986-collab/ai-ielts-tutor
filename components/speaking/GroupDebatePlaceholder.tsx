/**
 * @file Two-student Part 3 group debate (E4) — placeholder UI.
 *
 * The full implementation requires a multi-tenant WebSocket room server,
 * shared transcripts across users, and an AI moderator that hears both
 * participants. That is significant infrastructure (probably a Django
 * Channels app + a routing layer) and warrants its own scoped sprint.
 *
 * This component is the entry point + clear documentation of what's
 * planned, so the feature is discoverable in the UI rather than secretly
 * unimplemented. When the room server lands, swap this for the real flow
 * without touching SpeakingTutor.tsx.
 */

import React from 'react';

interface Props {
    onClose: () => void;
}

const GroupDebatePlaceholder: React.FC<Props> = ({ onClose }) => (
    <section className="rounded-xl border border-purple-200 dark:border-purple-900 bg-purple-50 dark:bg-purple-950/30 p-5 space-y-3">
        <header className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-purple-900 dark:text-purple-200">
                Group debate (Part 3) — coming soon
            </h3>
            <button onClick={onClose} className="text-xs text-purple-700 dark:text-purple-300 hover:underline">Close</button>
        </header>
        <p className="text-sm text-purple-900 dark:text-purple-100">
            Two students join the same room. The AI examiner moderates a Part 3 discussion: poses a topic,
            invites each speaker to take a position, and runs a structured debate.
        </p>
        <p className="text-xs text-purple-700 dark:text-purple-300">
            Status: schema + UI are scoped. Backend room server (Django Channels + ASGI) is the next sprint.
            If you want priority on this, let us know — your queue position helps us schedule it.
        </p>
        <div className="flex gap-2 text-xs">
            <button
                disabled
                className="px-3 py-1.5 rounded bg-purple-300 dark:bg-purple-800 text-purple-900 dark:text-purple-200 opacity-60 cursor-not-allowed"
            >
                Join a room
            </button>
            <button
                disabled
                className="px-3 py-1.5 rounded border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 opacity-60 cursor-not-allowed"
            >
                Create a room
            </button>
        </div>
    </section>
);

export default GroupDebatePlaceholder;
