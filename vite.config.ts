import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self' https://api.github.com https://raw.githubusercontent.com",
  "img-src 'self' data:",
  "font-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function productionCsp(): Plugin {
  return {
    name: "reposcope-production-csp",
    apply: "build",
    transformIndexHtml: {
      order: "pre",
      handler() {
        return [
          {
            tag: "meta",
            attrs: {
              "http-equiv": "Content-Security-Policy",
              content: CONTENT_SECURITY_POLICY,
            },
            injectTo: "head-prepend",
          },
        ];
      },
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/reposcope/" : "/",
  plugins: [react(), productionCsp()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
  worker: {
    format: "es",
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/main.tsx",
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/**/model.ts",
        "src/**/raw-model.ts",
        "src/**/protocol.ts",
      ],
    },
  },
}));
