// vite.config.js
import { defineConfig, loadEnv } from 'vite';

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ''); // loads VITE_* from env
  const apiBase =
    env.VITE_API_BASE ||
    (mode === 'production'
      ? 'https://api.stockloyal.com/api'
      : '/api');

  return defineConfig({
    define: {
      __API_BASE__: JSON.stringify(apiBase),
    },
    // ...any other existing config
  });
};
