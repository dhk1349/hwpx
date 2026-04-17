import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WebAdapter } from '@hwpx/platform/web';
import { App } from './App.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App platform={new WebAdapter()} />
  </StrictMode>,
);
