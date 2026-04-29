/**
 * @file Prompt library client.
 *
 * Lazily loads prompts from the backend and caches them per-skill in memory
 * for the lifetime of the page. Falls back to the hardcoded constants when
 * the API returns no prompts (e.g. an institute that hasn't been seeded
 * yet, or transient backend errors).
 */

import { SPEAKING_PROMPTS as FALLBACK_SPEAKING, WRITING_TASK_2_PROMPTS as FALLBACK_WRITING } from '../constants';
import { apiClient } from './apiClient';

interface BackendPrompt {
    id: string;
    skill: 'writing' | 'speaking';
    part: '' | 'Part 1' | 'Part 2' | 'Part 3';
    text: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

let writingCache: string[] | null = null;
let speakingCache: typeof FALLBACK_SPEAKING | null = null;

const fetchPrompts = async (skill: 'writing' | 'speaking'): Promise<BackendPrompt[]> => {
    try {
        const data = await apiClient.get<{ prompts: BackendPrompt[] }>(`/content/prompts?skill=${skill}`);
        return data.prompts ?? [];
    } catch {
        return [];
    }
};

export const contentService = {
    /** Returns Writing Task 2 prompts. Falls back to hardcoded list if backend is empty. */
    getWritingPrompts: async (): Promise<string[]> => {
        if (writingCache) return writingCache;
        const remote = await fetchPrompts('writing');
        writingCache = remote.length > 0 ? remote.map((p) => p.text) : FALLBACK_WRITING;
        return writingCache;
    },

    /** Returns speaking prompts grouped by part. Same fallback semantics. */
    getSpeakingPrompts: async (): Promise<typeof FALLBACK_SPEAKING> => {
        if (speakingCache) return speakingCache;
        const remote = await fetchPrompts('speaking');
        if (remote.length === 0) {
            speakingCache = FALLBACK_SPEAKING;
            return speakingCache;
        }
        const grouped: typeof FALLBACK_SPEAKING = {
            'Part 1': [], 'Part 2': [], 'Part 3': [],
        };
        for (const p of remote) {
            if (p.part === 'Part 1' || p.part === 'Part 2' || p.part === 'Part 3') {
                grouped[p.part].push(p.text);
            }
        }
        // If any part is empty, fill from the fallback
        (Object.keys(grouped) as Array<keyof typeof grouped>).forEach((k) => {
            if (grouped[k].length === 0) grouped[k] = FALLBACK_SPEAKING[k];
        });
        speakingCache = grouped;
        return speakingCache;
    },

    /** Force a re-fetch — useful after admin changes prompts. */
    invalidateCache: () => {
        writingCache = null;
        speakingCache = null;
    },
};
