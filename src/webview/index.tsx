import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

console.log('[quick-repomix] ===== REACT APP ENTRY POINT =====');
console.log('[quick-repomix] Looking for root element...');

const container = document.getElementById('root');
if (container) {
  console.log('[quick-repomix] Root element found, creating React root...');
  const root = createRoot(container);
  
  // Route based on initialView flag injected by webview provider
  const initialView = (window as any).initialView;
  console.log('[quick-repomix] Initial view type:', initialView);
  
  console.log('[quick-repomix] Rendering App component...');
  root.render(<App />);
  console.log('[quick-repomix] App component rendered');
} else {
  console.error('[quick-repomix] Root element NOT FOUND!');
}
