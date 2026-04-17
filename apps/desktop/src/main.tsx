import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TauriAdapter } from '@hwpx/platform/tauri';
import { App } from './App.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App platform={new TauriAdapter()} />
  </StrictMode>,
);
