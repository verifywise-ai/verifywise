import svgr from "@svgr/rollup";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vitest/config";
import { version } from "../version.json";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), svgr()],
  resolve: {
    alias: {
      "@user-guide-content": path.resolve(__dirname, "../shared/user-guide-content"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: process.env.VITE_APP_PORT ? parseInt(process.env.VITE_APP_PORT) : 5173,
    proxy: {
      // Forward all API requests to Node.js server which handles auth and proxies to FastAPI
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
        timeout: 120000,
        configure: (proxy) => {
          proxy.on("error", (err) => {
            console.error("[vite proxy error]", err.message);
          });
        },
      },
    },
  },
  build: {
    // Generate manifest for cache busting
    manifest: true,
    chunkSizeWarningLimit: 600,
    cssCodeSplit: true,
    modulePreload: {
      // Drop heavy chunks that aren't needed for first paint (charts, rich-text editor,
      // xlsx) so they don't compete with the critical-path bundle download.
      resolveDependencies: (_filename, deps) =>
        deps.filter((d) => !/vendor-charts|vendor-editor|xlsx|ExportMenu/.test(d)),
    },
    rollupOptions: {
      output: {
        // Add hash to filenames for cache busting
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("react-dom") ||
              id.includes("react-router-dom") ||
              (id.includes("/react/") && !id.includes("react-"))
            ) {
              return "vendor-react";
            }
            if (
              id.includes("@mui/material") ||
              id.includes("@mui/lab") ||
              id.includes("@mui/x-charts") ||
              id.includes("@mui/x-date-pickers")
            ) {
              return "vendor-mui";
            }
            if (
              id.includes("@reduxjs/toolkit") ||
              id.includes("react-redux") ||
              id.includes("redux-persist") ||
              id.includes("@tanstack/react-query")
            ) {
              return "vendor-state";
            }
            if (id.includes("@tiptap")) {
              return "vendor-editor";
            }
            if (id.includes("recharts") || id.includes("html2canvas")) {
              return "vendor-charts";
            }
          }
        },
      },
    },
  },
  define: {
    global: "globalThis",
    // Use environment variable if available (for CI/CD), otherwise use package.json version
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION || version),
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
    exclude: ["e2e/**", "**/node_modules/**"],
    env: {
      VITE_APP_API_BASE_URL: "http://localhost:3000",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/test/**",
        "src/mocks/**",
        "src/**/*.d.ts",
        "vite.config.ts",
        "**/node_modules/**",
        "src/**/**/tests/**",
        "src/i18n/**",
      ],
      thresholds: {
        global: {
          statements: 10,
          branches: 10,
          functions: 10,
          lines: 10,
        },
      },
    },
  },
});
