/**
 * @file A reusable Card component for wrapping content in a consistent, styled container.
 */

import React from 'react';

/**
 * Props for the Card component.
 */
interface CardProps {
  children: React.ReactNode; // The content to be rendered inside the card.
  className?: string; // Optional additional CSS classes.
}

/**
 * A styled container component.
 * @param {CardProps} props The component props.
 * @returns {React.FC<CardProps>} The rendered card.
 */
const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden ${className}`}>
      <div className="p-6 sm:p-8">
        {children}
      </div>
    </div>
  );
};

export default Card;