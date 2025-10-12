import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: '/stockloyal-pwa/',        // keep this for SPA under subpath
  define: {
    __API_BASE__: JSON.stringify(
      mode === 'development'
        ? (process.env.VITE_API_BASE || 'https://app.stockloyal.com/api')
        : (process.env.VITE_API_BASE || '/api')
    ),
  },
}))
