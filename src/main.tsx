import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WatchCanvas } from './watch/WatchCanvas.tsx';
import { scene } from './watch/scene.ts';

createRoot(document.getElementById('root')!).render(
    <StrictMode><WatchCanvas scene={scene} /></StrictMode>,
);
