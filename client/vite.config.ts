import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Solo el propio computador. `vite --host` (npm run dev:lan) lo abre a la red local.
    host: '127.0.0.1',
    proxy: {
      '/api': API,
      '/socket.io': { target: API, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
});
