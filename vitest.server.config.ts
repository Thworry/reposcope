import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    passWithNoTests: true,
    include: ["server/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts"],
      exclude: ["server/**/*.test.ts", "server/index.ts"],
    },
  },
});
