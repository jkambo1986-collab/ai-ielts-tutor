/**
 * @file useAutosave — debounced server autosave hook used by Writing (P4).
 *
 * Calls `save()` 1.2s after the value stops changing. Returns a status
 * string the UI can render in the connection indicator (F7).
 */

import { useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'saving' | 'saved' | 'error';

export function useAutosave(
    value: string,
    save: (v: string) => Promise<void>,
    enabled = true,
    debounceMs = 1200,
) {
    const [status, setStatus] = useState<Status>('idle');
    const timerRef = useRef<number | null>(null);
    const lastSavedRef = useRef('');

    useEffect(() => {
        if (!enabled) return;
        if (value === lastSavedRef.current) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(async () => {
            setStatus('saving');
            try {
                await save(value);
                lastSavedRef.current = value;
                setStatus('saved');
                window.setTimeout(() => setStatus(prev => (prev === 'saved' ? 'idle' : prev)), 2000);
            } catch {
                setStatus('error');
            }
        }, debounceMs);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [value, save, enabled, debounceMs]);

    // Warn on unload if there are unsynced edits
    useEffect(() => {
        if (!enabled) return;
        const handler = (e: BeforeUnloadEvent) => {
            if (value !== lastSavedRef.current) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [value, enabled]);

    return status;
}
