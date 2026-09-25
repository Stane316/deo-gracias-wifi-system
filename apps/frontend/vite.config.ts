import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/**
 * IMP-25 — Démo visuelle locale. Le navigateur n'appelle QUE des chemins
 * relatifs (/api/…) ; le proxy Vite relaie vers le backend (port 3000).
 * host: true => écoute 0.0.0.0 (préversions distantes) ; allowedHosts ouvert
 * pour les hôtes de préversion.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '');
  const appEnv = (process.env['APP_ENV'] ?? env['APP_ENV'] ?? 'local').toLowerCase();
  // Port du backend configurable (BACKEND_PORT) ; défaut = server.ts : 3000.
  const backendPort = Number(process.env['BACKEND_PORT'] ?? env['BACKEND_PORT'] ?? 3000);
  if (appEnv === 'production' && (!env['VITE_SUPABASE_URL'] || !env['VITE_SUPABASE_ANON_KEY'])) {
    throw new Error('Build frontend production impossible : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont requises.');
  }

  return {
    // Les seules variables exposées au navigateur sont VITE_* ; les secrets backend
    // du .env racine restent invisibles grâce au préfixe Vite.
    envDir: '../../',
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
