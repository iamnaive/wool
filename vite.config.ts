// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          wagmi: ["wagmi"],
          viem: ["viem"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
});
