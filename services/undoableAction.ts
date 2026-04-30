/**
 * @file useUndoableAction — generic undo wrapper around any action that
 * mutates server state.
 *
 * Pattern:
 *   const undoable = useUndoableAction();
 *   undoable({
 *     do: () => api.archive(id),
 *     undo: () => api.unarchive(id),
 *     toastTitle: 'Card archived',
 *     undoLabel: 'Undo',
 *   });
 *
 * The toast appears for 5 seconds with an Undo button. If the user clicks
 * Undo, we run `undo()` and surface a confirmation toast. Otherwise the
 * action stands. Failure on either path surfaces an error toast.
 */

import { useToast } from '../components/ui/Toast';

interface UndoableConfig {
    do: () => Promise<unknown> | unknown;
    undo: () => Promise<unknown> | unknown;
    toastTitle: string;
    toastBody?: string;
    undoLabel?: string;
    durationMs?: number;
}

export function useUndoableAction() {
    const { toast } = useToast();
    return async (cfg: UndoableConfig) => {
        try {
            await cfg.do();
        } catch (e) {
            toast({
                title: 'Action failed',
                body: e instanceof Error ? e.message : '',
                kind: 'error',
            });
            throw e;
        }
        toast({
            title: cfg.toastTitle,
            body: cfg.toastBody,
            kind: 'info',
            durationMs: cfg.durationMs ?? 5000,
            undo: async () => {
                try {
                    await cfg.undo();
                    toast({ title: 'Reverted', kind: 'success', durationMs: 2000 });
                } catch (e) {
                    toast({
                        title: 'Undo failed',
                        body: e instanceof Error ? e.message : '',
                        kind: 'error',
                    });
                }
            },
        });
    };
}
