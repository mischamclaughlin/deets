import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WatchEditor } from './watch/WatchEditor.tsx';
import { scene } from './watch/scene.ts';
import './watch/rose-pine.css';
import './watch/SelectControls.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode><WatchEditor initialScene={scene} /></StrictMode>,
);
