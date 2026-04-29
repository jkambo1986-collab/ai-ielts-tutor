/**
 * @file A reusable, accessible component for creating collapsible sections.
 * It manages its own open/closed state and includes ARIA attributes for screen readers.
 */

import React, { useState, useId } from 'react';

/**
 * Props for the CollapsibleSection component.
 */
interface CollapsibleSectionProps {
  title: string; // The title displayed in the section header.
  children: React.ReactNode; // The content to be shown or hidden.
  defaultOpen?: boolean; // Whether the section should be open by default.
}

/**
 * A component that renders a title which, when clicked, expands or collapses the content area.
 * @param {CollapsibleSectionProps} props The component props.
 * @returns {React.FC<CollapsibleSectionProps>} The rendered collapsible section.
 */
const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  // Generate a unique ID for ARIA controls to link the button to the content.
  const contentId = useId();

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
      <h3 className="text-lg">
        <button
          className="w-full flex justify-between items-center p-4 text-left font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={contentId}
        >
          <span>{title}</span>
          <svg
            className={`w-5 h-5 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </h3>
      {isOpen && (
        <div id={contentId} className="p-4 border-t border-slate-200 dark:border-slate-700">
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection;
