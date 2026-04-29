/**
 * @file Live mic-level indicator (B8). Reads RMS energy from the engine
 * and renders a 5-segment LED-style meter.
 */

import React from 'react';

const MicMeter: React.FC<{ rms: number; active?: boolean }> = ({ rms, active = true }) => {
    // Map RMS (typical range 0..0.3 for normal speech) to 0..5 lit segments
    const litCount = Math.min(5, Math.floor(rms / 0.04));
    return (
        <div className="flex items-end gap-1 h-6" role="meter" aria-label="Microphone input level" aria-valuenow={Math.round(rms * 100)}>
            {[1, 2, 3, 4, 5].map(i => {
                const lit = active && i <= litCount;
                const hue = i <= 3 ? 'bg-emerald-500' : i === 4 ? 'bg-amber-500' : 'bg-rose-500';
                const idle = 'bg-slate-200 dark:bg-slate-700';
                return (
                    <span
                        key={i}
                        className={`w-1.5 rounded-sm transition-colors ${lit ? hue : idle}`}
                        style={{ height: `${i * 4 + 4}px` }}
                    />
                );
            })}
        </div>
    );
};

export default MicMeter;
