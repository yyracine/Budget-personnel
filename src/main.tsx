import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AppProvider } from './state/AppContext';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Élément racine introuvable.');

createRoot(container).render(
  <React.StrictMode>
    <AppProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </AppProvider>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl).catch((error) => {
      // L'application reste pleinement utilisable en ligne sans service worker.
      console.warn('Service worker non enregistré :', error);
    });
  });
}
