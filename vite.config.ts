import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3003,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          // Frontend imports shared modules from api/_utils/*; those must be
          // served by Vite as JS, not proxied to the API (which returns JSON).
          bypass(req) {
            const url = req.url || '';
            if (
              url.includes('/api/_utils/') ||
              /\.(?:[cm]?[jt]sx?|mjs)(?:\?|$)/.test(url)
            ) {
              return url;
            }
          },
        },
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || '')
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
