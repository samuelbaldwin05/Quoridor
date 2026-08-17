import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { requestPersistentStorage } from './lib/storagePersistence';

// Before rendering, and deliberately not awaited: the session and the local game history
// live in storage the browser may evict, and asking is free.
void requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
