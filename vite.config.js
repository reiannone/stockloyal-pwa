import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/stockloyal-pwa/api': {
        target: 'http://localhost', // Vite will forward to local Apache
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path, // keep path
      }
    }
  }
});
