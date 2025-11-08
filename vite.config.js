// vite.config.js
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const useHttps = env.VITE_DEV_HTTPS === "1"; // set to "1" to enable https

  return defineConfig({
    plugins: [react()],
    server: {
      host: "localhost",
      port: 5173,
      strictPort: true,
      https: useHttps ? { /* your key/cert here if you have them */ } : false,
    },
  });
};
