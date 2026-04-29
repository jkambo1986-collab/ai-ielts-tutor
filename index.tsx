/**
 * @file This is the main entry point for the React application.
 * It renders the root <App /> component into the DOM.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';

// Initialize Sentry only when a DSN is configured. We deliberately don't ship
// a hardcoded DSN — set VITE_SENTRY_DSN at build time on Vercel and unset
// locally to keep dev errors out of the prod project.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
    Sentry.init({
        dsn: sentryDsn,
        environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? 'dev',
        integrations: [Sentry.browserTracingIntegration()],
        tracesSampleRate: 0.1,
        // Don't capture user IPs or query strings by default — privacy first.
        sendDefaultPii: false,
    });
}

// Find the root DOM element where the React app will be mounted.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Create a React root for concurrent mode rendering.
const root = ReactDOM.createRoot(rootElement);

// Render the main App component within React's StrictMode.
// StrictMode helps with highlighting potential problems in an application.
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
