/**
 * @file A component to visualize recurring writing weaknesses as a simple bar chart.
 * It helps users quickly identify their main areas for improvement.
 */

import React from 'react';
import { WeaknessAnalysis } from '../types';

interface WeaknessVisualizationProps {
  analysis: WeaknessAnalysis;
}

/**
 * A bar chart visualization for writing weaknesses.
 * @param {WeaknessVisualizationProps} props - The component props.
 * @returns {React.FC} The rendered visualization.
 */
const WeaknessVisualization: React.FC<WeaknessVisualizationProps> = ({ analysis }) => {
  const weaknesses = analysis.recurringWeaknesses;
  const maxWeaknesses = weaknesses.length > 0 ? weaknesses.length : 1;

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 h-full">
      <h4 className="font-semibold text-center mb-4 text-slate-700 dark:text-slate-300">Weakness Priority</h4>
      <div className="space-y-4">
        {weaknesses.map((item, index) => {
          // The first item is the highest priority, so it gets the longest bar.
          const barWidth = 100 - (index / maxWeaknesses) * 40; // e.g., for 3 items: 100%, 86.6%, 73.3%

          return (
            <div key={index} title={`Suggestion: ${item.suggestion}`} className="group cursor-help">
              <p className="text-sm text-slate-600 dark:text-slate-300 truncate mb-1" title={item.weakness}>
                {item.weakness}
              </p>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-orange-500 to-amber-400 h-4 rounded-full transition-all duration-500 ease-out group-hover:opacity-80"
                  style={{ width: `${barWidth}%` }}
                  role="progressbar"
                  aria-valuenow={barWidth}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Weakness: ${item.weakness}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeaknessVisualization;
