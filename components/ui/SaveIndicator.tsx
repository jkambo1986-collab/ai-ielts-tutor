/**
 * @file Saved / Reconnecting indicator (F7).
 */

import React from 'react';

type Status = 'idle' | 'saving' | 'saved' | 'error' | 'connected' | 'reconnecting' | 'disconnected';

const TONE: Record<Status, string> = {
    idle: 'text-slate-400',
    saving: 'text-blue-500',
    saved: 'text-emerald-500',
    error: 'text-rose-500',
    connected: 'text-emerald-500',
    reconnecting: 'text-amber-500',
    disconnected: 'text-slate-400',
};

const LABEL: Record<Status, string> = {
    idle: '',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
    connected: 'Online',
    reconnecting: 'Reconnecting…',
    disconnected: 'Offline',
};

const SaveIndicator: React.FC<{ status: Status }> = ({ status }) => {
    if (!LABEL[status]) return null;
    return (
        <span className={`text-xs flex items-center gap-1 ${TONE[status]}`} aria-live="polite">
            <span className={`h-1.5 w-1.5 rounded-full ${
                status === 'saving' || status === 'reconnecting' ? 'bg-current animate-pulse'
                    : status === 'error' ? 'bg-rose-500'
                    : 'bg-current'
            }`} />
            {LABEL[status]}
        </span>
    );
};

export default SaveIndicator;
