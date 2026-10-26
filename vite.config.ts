import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { garmin } from './server/garmin.ts';

export default defineConfig({
    plugins: [react(), garmin()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
