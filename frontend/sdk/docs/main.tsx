/**
 * Docs Playground Entry Point
 *
 * Development entry point for running the WSTF Kit playground locally.
 *
 * Usage:
 *   npm run dev:docs
 *   # Open http://localhost:3000
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

// Mount the app
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Make sure index.html has <div id="root"></div>');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
