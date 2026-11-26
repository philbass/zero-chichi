import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Admin from './Admin.jsx';
import './admin.css';

createRoot(document.getElementById('root')).render(<StrictMode><Admin /></StrictMode>);

// Service worker propre à l'admin (portée admin/) : l'app s'installe et s'ouvre même sans réseau.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
