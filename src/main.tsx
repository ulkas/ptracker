import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App2';
import './styles.css';
import { APP_VERSION } from './update';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL).then((registration) => {
    if (!registration) return navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw-${APP_VERSION}.js`, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' });
  }).catch(() => undefined));
}
