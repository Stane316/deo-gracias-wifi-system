import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * IMP-25 — Démo visuelle locale. Le navigateur n'appelle QUE des chemins
 * relatifs (/api/…) ; le proxy Vite relaie vers le backend (port 3001).
 * host: true => écoute 0.0.0.0 (préversions distantes) ; allowedHosts ouvert
 * pour les hôtes de préversion.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
