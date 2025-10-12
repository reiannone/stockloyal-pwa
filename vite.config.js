import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    proxy: {
      '/api': {
        // if your local Apache serves /api at http://localhost/api
        target: 'http://localhost',
        changeOrigin: true,
        rewrite: p => p, // keep /api
      },
    },
  },
  build: { outDir: 'dist' },
});
