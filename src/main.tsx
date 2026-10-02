import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App2';
import './styles.css';
import { ensureCurrentWorker } from './update';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void ensureCurrentWorker().catch(() => undefined));
}
