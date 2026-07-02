import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The built assets are served by the OHADA Node server from web/dist.
// In dev, proxy the API to the running backend on :3050.
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3050"
    }
  }
});
