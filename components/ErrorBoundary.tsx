/**
 * @file A React Error Boundary component.
 * It catches JavaScript errors in its child component tree, logs them,
 * and displays a fallback UI instead of a crashed component tree.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  // React 19's class-component types occasionally fail to resolve `this.props`
  // when only declared via the constructor signature; declaring it explicitly
  // here keeps tsc happy under all React versions we target.
  public declare props: Props;
  public state: State = { hasError: false };

  /**
   * This lifecycle method is triggered when a descendant component throws an error.
   * It updates the state so the next render will show the fallback UI.
   * @param {Error} _: The error that was thrown.
   * @returns {State} An object representing the new state.
   */
  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  /**
   * This lifecycle method is also triggered when a descendant component throws an error.
   * It's a good place for side effects like logging the error to a service.
   * @param {Error} error - The error that was thrown.
   * @param {React.ErrorInfo} errorInfo - An object with a `componentStack` key containing information about which component threw the error.
   */
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  /**
   * Handles the reset action, typically by reloading the page.
   */
  private handleReset = () => {
    window.location.reload();
  };

  public render() {
    // If an error has been caught, render the fallback UI.
    if (this.state.hasError) {
      return (
        <div role="alert" className="flex flex-col items-center justify-center p-8 text-center bg-red-50 dark:bg-slate-800 border-2 border-dashed border-red-300 dark:border-red-700 rounded-xl">
          <div className="w-12 h-12 flex items-center justify-center bg-red-100 dark:bg-red-900/50 rounded-full mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-red-700 dark:text-red-400">Application Error</h2>
          <p className="mt-2 max-w-md text-slate-600 dark:text-slate-400">
            We've encountered an unexpected issue. Refreshing the page often solves the problem.
            Your work in other sections should be saved.
          </p>
          <button
            onClick={this.handleReset}
            className="mt-6 px-5 py-2.5 font-semibold text-white bg-red-600 rounded-lg shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    // Otherwise, render the children as normal.
    return this.props.children;
  }
}

export default ErrorBoundary;