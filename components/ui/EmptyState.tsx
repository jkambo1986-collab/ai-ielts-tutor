/**
 * @file Standard empty-state component (F4).
 */

import React from 'react';

interface Props {
    title: string;
    body?: string;
    icon?: React.ReactNode;
    primaryAction?: { label: string; onClick: () => void };
    secondaryAction?: { label: string; onClick: () => void };
    className?: string;
}

const EmptyState: React.FC<Props> = ({ title, body, icon, primaryAction, secondaryAction, className = '' }) => (
    <div className={`flex flex-col items-center text-center p-6 sm:p-10 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 ${className}`}>
        {icon && <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div>}
        <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h4>
        {body && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">{body}</p>}
        {(primaryAction || secondaryAction) && (
            <div className="flex flex-wrap gap-2 mt-4">
                {primaryAction && (
                    <button
                        onClick={primaryAction.onClick}
                        className="text-sm font-medium px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        {primaryAction.label}
                    </button>
                )}
                {secondaryAction && (
                    <button
                        onClick={secondaryAction.onClick}
                        className="text-sm font-medium px-4 py-2 rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                        {secondaryAction.label}
                    </button>
                )}
            </div>
        )}
    </div>
);

export default EmptyState;
