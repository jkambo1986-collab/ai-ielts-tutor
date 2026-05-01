import React from 'react';

interface Props {
    message?: string;
    onRetry: () => void;
    busy?: boolean;
}

const ConnectionLost: React.FC<Props> = ({ message, onRetry, busy = false }) => (
    <div role="alert" className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-5 py-6 text-center">
        <div className="mx-auto h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-700 dark:text-amber-300 mb-3">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 1l22 22" />
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
        </div>
        <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100">Connection lost</h4>
        <p className="text-xs text-amber-800 dark:text-amber-200 mt-1 max-w-md mx-auto">
            {message || "We couldn't reach the server. Check your network and try again."}
        </p>
        <button
            onClick={onRetry}
            disabled={busy}
            className="mt-4 text-sm font-medium px-4 py-2 rounded-md bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
            {busy ? 'Retrying…' : 'Try again'}
        </button>
    </div>
);

export default ConnectionLost;
