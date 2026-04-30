/**
 * @file Post-session cross-skill bridge.
 *
 * Shown after a writing or speaking session result lands. Suggests a
 * matched session in the OPPOSITE skill while the topic is still fresh —
 * different from CrossSkillChip, which fires before a session starts.
 *
 * Closes flow gap A2: today, sessions end in a dead-end. The bridge
 * transfers momentum into a 90-second follow-up that's much cheaper to
 * commit to than a full new session.
 */

import React from 'react';
import { IELTSSection } from '../../types';

interface Props {
    /** The session that just finished. */
    fromSkill: 'writing' | 'speaking';
    /** The original prompt text — used to seed the next session. */
    promptText: string;
    /** Called with target section + a string to prefill there. */
    onBridge: (section: IELTSSection, seed: string) => void;
}

const PostSessionBridge: React.FC<Props> = ({ fromSkill, promptText, onBridge }) => {
    const targetSkill: 'speaking' | 'writing' = fromSkill === 'writing' ? 'speaking' : 'writing';
    const targetSection = targetSkill === 'speaking' ? IELTSSection.Speaking : IELTSSection.Writing;
    const targetLabel = targetSkill === 'speaking' ? 'Speaking' : 'Writing';
    const microcopy = targetSkill === 'speaking'
        ? `Talk about this for 90 seconds while it's fresh — speaking the same ideas you just wrote locks in vocabulary roughly 3× faster than reading them.`
        : `Write 150 words on this same topic now — committing your spoken ideas to writing surfaces gaps your transcript hides.`;

    return (
        <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 px-4 py-3 mt-4">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                        Cross-skill bridge
                    </p>
                    <p className="text-sm font-semibold text-violet-950 dark:text-violet-100 mt-1">
                        Try a {targetLabel.toLowerCase()} version of this prompt
                    </p>
                    <p className="text-xs text-violet-900/80 dark:text-violet-200/80 mt-1">
                        {microcopy}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => onBridge(targetSection, promptText)}
                    className="shrink-0 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 px-3 py-1.5 rounded-md"
                >
                    Bridge to {targetLabel}
                </button>
            </div>
        </div>
    );
};

export default PostSessionBridge;
