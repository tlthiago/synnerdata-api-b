import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./src/modules",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  timeout: 60_000,
  use: {
    baseURL: process.env.APP_URL || "http://localhost:3000",
    trace: "on-first-retry",
    headless: !!process.env.CI,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: process.env.API_URL || "http://localhost:3001",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
