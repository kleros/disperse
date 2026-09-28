import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      gzipSize: true,
      template: "treemap",
      filename: "dist/stats.html",
    }),
  ],
  server: {
    proxy: {
      // Mirrors public/_redirects: the upstream function sends no CORS headers.
      "/api/listConnections": {
        target: "https://v2-university.kleros.builders",
        changeOrigin: true,
        rewrite: () => "/.netlify/functions/listConnections",
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "wagmi-vendor": ["wagmi", "viem"],
          "ui-vendor": ["@tanstack/react-query", "fuse.js"],
          chains: ["viem/chains"],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
