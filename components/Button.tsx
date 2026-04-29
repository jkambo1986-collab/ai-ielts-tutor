/**
 * @file A generic, reusable Button component with different visual styles and a loading state.
 */

import React from 'react';

/**
 * Props for the Button component, extending standard HTML button attributes.
 */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger'; // Visual style of the button.
  isLoading?: boolean; // If true, shows a loading spinner and disables the button.
}

/**
 * The reusable Button component.
 * @param {ButtonProps} props The component props.
 * @returns {React.FC<ButtonProps>} The rendered button.
 */
const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', isLoading = false, className = '', ...props }) => {
  // Base CSS classes for all button variants.
  const baseClasses = "inline-flex items-center justify-center px-5 py-2.5 font-semibold rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-transform transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";

  // CSS classes specific to each button variant.
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-slate-200 text-slate-800 hover:bg-slate-300 focus:ring-slate-400 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {/* Show loading spinner if isLoading is true */}
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  );
};

export default Button;