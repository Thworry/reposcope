import react from "@vitejs/plugin-react";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin, type ResolvedConfig } from "vite";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "connect-src 'self' https://api.github.com https://raw.githubusercontent.com",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

export function productionCsp(): Plugin {
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

function releaseBasePath(value: string | undefined): string {
  if (value === undefined || value === "") return "/";
  if (
    !/^\/(?:[A-Za-z0-9._-]+\/)*$/u.test(value) ||
    value.includes("..") ||
    value.includes("//")
  ) {
    throw new Error(
      "REPOSCOPE_BASE_PATH must be an absolute slash-terminated path such as /reposcope/",
    );
  }
  return value;
}

function releaseManifest(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "reposcope-release-manifest",
    apply: "build",
    enforce: "post",
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outputRoot = resolve(config.root, config.build.outDir);
      const manifestName =
        typeof config.build.manifest === "string"
          ? config.build.manifest
          : ".vite/manifest.json";
      const manifestPath = resolve(outputRoot, manifestName);
      const manifest = JSON.parse(String(readFileSync(manifestPath))) as Record<
        string,
        Record<string, unknown>
      >;
      const assetFiles = readdirSync(resolve(outputRoot, "assets"));

      const oneAsset = (label: string, pattern: RegExp): string => {
        const matches = assetFiles.filter((file) => pattern.test(file));
        if (matches.length !== 1) {
          throw new Error(
            `expected one emitted ${label} asset, found ${matches.length}`,
          );
        }
        return `assets/${matches[0]}`;
      };
      const workerFile = oneAsset(
        "analysis worker",
        /^analysis\.worker-[A-Za-z0-9_-]+\.js$/u,
      );
      const jsTsFile = oneAsset(
        "JavaScript/TypeScript analyzer",
        /^js-ts-[A-Za-z0-9_-]+\.js$/u,
      );
      const pythonFile = oneAsset(
        "Python analyzer",
        /^python-[A-Za-z0-9_-]+\.js$/u,
      );
      const assetUrl = (file: string) => `${config.base}${file}`;

      for (const record of Object.values(manifest)) {
        if (typeof record.file === "string") {
          record.url = assetUrl(record.file);
        }
        if (Array.isArray(record.css)) {
          record.cssUrls = record.css.map((file) => assetUrl(String(file)));
        }
      }
      manifest["_worker/analysis.worker.ts"] = {
        file: workerFile,
        url: assetUrl(workerFile),
        name: "analysis.worker",
        src: "src/features/worker/analysis.worker.ts",
        dynamicImports: ["_analyzer/js-ts.ts", "_analyzer/python.ts"],
      };
      manifest["_analyzer/js-ts.ts"] = {
        file: jsTsFile,
        url: assetUrl(jsTsFile),
        name: "js-ts",
        src: "src/features/analyzers/js-ts.ts",
        isDynamicEntry: true,
      };
      manifest["_analyzer/python.ts"] = {
        file: pythonFile,
        url: assetUrl(pythonFile),
        name: "python",
        src: "src/features/analyzers/python.ts",
        isDynamicEntry: true,
      };

      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

export default defineConfig(({ command }) => ({
  base:
    command === "build"
      ? releaseBasePath(process.env.REPOSCOPE_BASE_PATH)
      : "/",
  plugins: [react(), productionCsp(), releaseManifest()],
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
