import { defineConfig, devices } from "@playwright/test";

const E2E_ORIGIN = "http://127.0.0.1:4175";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: E2E_ORIGIN,
    serviceWorkers: "block",
    timezoneId: "UTC",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 900 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command:
      "REPOSCOPE_API_ORIGIN=http://127.0.0.1:4175 REPOSCOPE_BASE_PATH=/reposcope/ pnpm build && pnpm preview --host 127.0.0.1 --port 4175 --strictPort --base /reposcope/",
    url: `${E2E_ORIGIN}/reposcope/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
