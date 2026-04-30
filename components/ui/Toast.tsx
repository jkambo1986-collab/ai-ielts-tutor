/**
 * @file Global toast / snackbar system (F1).
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast({ title: 'Saved', kind: 'success' });
 *   toast({ title: 'Cleared', body: 'History wiped.', undo: () => restore() });
 *
 * Mount <Toaster /> once at the app root (already done in App.tsx).
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type ToastKind = 'info' | 'success' | 'warning' | 'error';
interface ToastInput {
    title: string;
    body?: string;
    kind?: ToastKind;
    durationMs?: number;
    undo?: () => void;
}
interface ToastItem extends Required<Omit<ToastInput, 'undo' | 'body'>> {
    id: string;
    undo?: () => void;
    body?: string;
}

interface Ctx {
    toast: (t: ToastInput) => string;
    dismiss: (id: string) => void;
    /**
     * Replace an existing toast in-place — used for two-stage progress
     * notifications (e.g. "Submitting…" → "Analyzing…" → "Done"). If the
     * toast no longer exists (e.g. user dismissed it), this is a no-op.
     * Resets the auto-dismiss timer with the new duration.
     */
    update: (id: string, t: Partial<ToastInput>) => void;
}

const ToastContext = createContext<Ctx | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [items, setItems] = useState<ToastItem[]>([]);
    const timers = useRef<Map<string, number>>(new Map());

    const dismiss = useCallback((id: string) => {
        setItems(prev => prev.filter(t => t.id !== id));
        const handle = timers.current.get(id);
        if (handle) {
            clearTimeout(handle);
            timers.current.delete(id);
        }
    }, []);

    const toast = useCallback((t: ToastInput) => {
        const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const item: ToastItem = {
            id,
            title: t.title,
            body: t.body,
            kind: t.kind ?? 'info',
            durationMs: t.durationMs ?? (t.undo ? 6000 : 3500),
            undo: t.undo,
        };
        setItems(prev => [...prev, item]);
        const handle = window.setTimeout(() => dismiss(id), item.durationMs);
        timers.current.set(id, handle);
        return id;
    }, [dismiss]);

    const update = useCallback((id: string, t: Partial<ToastInput>) => {
        setItems(prev => {
            const idx = prev.findIndex(x => x.id === id);
            if (idx < 0) return prev;
            const merged: ToastItem = {
                ...prev[idx],
                title: t.title ?? prev[idx].title,
                body: t.body !== undefined ? t.body : prev[idx].body,
                kind: t.kind ?? prev[idx].kind,
                durationMs: t.durationMs ?? prev[idx].durationMs,
                undo: t.undo !== undefined ? t.undo : prev[idx].undo,
            };
            const copy = [...prev];
            copy[idx] = merged;
            return copy;
        });
        // Reset the auto-dismiss timer so the updated message gets its
        // full duration; otherwise a 3.5s "Submitting…" would close right
        // as it became "Analyzing…".
        const old = timers.current.get(id);
        if (old) clearTimeout(old);
        const ms = t.durationMs ?? 3500;
        const handle = window.setTimeout(() => dismiss(id), ms);
        timers.current.set(id, handle);
    }, [dismiss]);

    return (
        <ToastContext.Provider value={{ toast, dismiss, update }}>
            {children}
            <Toaster items={items} dismiss={dismiss} />
        </ToastContext.Provider>
    );
};

export function useToast(): Ctx {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        // Soft fallback so accidental usage outside provider doesn't crash.
        return {
            toast: (t) => { console.info('[toast]', t.title, t.body ?? ''); return ''; },
            dismiss: () => undefined,
            update: () => undefined,
        };
    }
    return ctx;
}

const Toaster: React.FC<{ items: ToastItem[]; dismiss: (id: string) => void }> = ({ items, dismiss }) => (
    <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed z-50 inset-x-0 bottom-4 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end pointer-events-none"
    >
        {items.map(item => (
            <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
    </div>
);

const TONE: Record<ToastKind, string> = {
    info: 'bg-slate-800 text-white border-slate-700',
    success: 'bg-emerald-600 text-white border-emerald-700',
    warning: 'bg-amber-500 text-amber-950 border-amber-600',
    error: 'bg-rose-600 text-white border-rose-700',
};

const ToastCard: React.FC<{ item: ToastItem; onDismiss: () => void }> = ({ item, onDismiss }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => { ref.current?.focus(); }, []);
    return (
        <div
            ref={ref}
            tabIndex={-1}
            role="status"
            className={`
                pointer-events-auto w-full max-w-sm rounded-lg border shadow-lg
                px-4 py-3 ${TONE[item.kind]}
                animate-in slide-in-from-bottom duration-150
            `}
        >
            <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight">{item.title}</p>
                    {item.body && <p className="text-xs opacity-90 mt-0.5">{item.body}</p>}
                </div>
                <div className="flex items-center gap-2">
                    {item.undo && (
                        <button
                            onClick={() => { item.undo?.(); onDismiss(); }}
                            className="text-xs font-bold underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                            Undo
                        </button>
                    )}
                    <button
                        onClick={onDismiss}
                        aria-label="Dismiss"
                        className="text-sm opacity-80 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        ✕
                    </button>
                </div>
            </div>
        </div>
    );
};
