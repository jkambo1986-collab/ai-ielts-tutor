/**
 * @file Skeleton loader primitives (F3).
 */

import React from 'react';

const base = 'animate-pulse bg-slate-200/70 dark:bg-slate-800/70 rounded';

export const Skeleton: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...rest }) => (
    <div className={`${base} ${className}`} {...rest} />
);

export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({ lines = 3, className = '' }) => (
    <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
            <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
        ))}
    </div>
);

export const SkeletonCard: React.FC<{ rows?: number; className?: string }> = ({ rows = 3, className = '' }) => (
    <div className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 ${className}`}>
        <Skeleton className="h-4 w-1/3" />
        <SkeletonText lines={rows} />
    </div>
);

export const SkeletonStatGrid: React.FC<{ count?: number }> = ({ count = 4 }) => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-7 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
            </div>
        ))}
    </div>
);
