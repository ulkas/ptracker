import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App2';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`).then((registration) => {
    if (registration.waiting) window.dispatchEvent(new CustomEvent('ptracker:update', { detail: registration }));
    registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', () => {
      if (registration.waiting && navigator.serviceWorker.controller) window.dispatchEvent(new CustomEvent('ptracker:update', { detail: registration }));
    }));
  }));
}
