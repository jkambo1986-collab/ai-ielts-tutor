/**
 * @file Part 2 cue card (B2). Renders topic + bullets with optional
 * preparation countdown. The parent flow controls visibility.
 */

import React from 'react';
import PartTimer from './PartTimer';
import { CueCard } from '../../services/speakingClient';

interface Props {
    card: CueCard;
    phase: 'prep' | 'talk' | 'done';
    prepSeconds?: number;
    talkSeconds?: number;
    onPrepComplete?: () => void;
    onTalkComplete?: () => void;
}

const CueCardView: React.FC<Props> = ({ card, phase, prepSeconds = 60, talkSeconds = 120, onPrepComplete, onTalkComplete }) => (
    <div className="rounded-xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-5 space-y-3">
        <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-400">IELTS Speaking — Part 2</span>
            <span className="text-xs text-slate-500">{card.category} · {card.difficulty}</span>
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{card.topic}</h3>
        <p className="text-xs text-slate-600 dark:text-slate-300 mb-1">You should say:</p>
        <ul className="list-disc list-inside text-sm text-slate-800 dark:text-slate-100 space-y-1">
            {card.bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
        {phase === 'prep' && (
            <div className="pt-2">
                <p className="text-xs text-amber-800 dark:text-amber-300 mb-1">Preparation time — make notes if you wish.</p>
                <PartTimer
                    label="Prep"
                    targetSeconds={prepSeconds}
                    mode="countdown"
                    running
                    onComplete={onPrepComplete}
                    resetKey={card.id}
                />
            </div>
        )}
        {phase === 'talk' && (
            <div className="pt-2">
                <p className="text-xs text-amber-800 dark:text-amber-300 mb-1">Speak now — aim for 1–2 minutes.</p>
                <PartTimer
                    label="Speaking"
                    targetSeconds={talkSeconds}
                    mode="countup"
                    running
                    onComplete={onTalkComplete}
                    resetKey={card.id}
                />
            </div>
        )}
    </div>
);

export default CueCardView;
