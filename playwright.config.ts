import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3000);
const external = process.env.E2E_BASE_URL; // e.g. a Vercel preview URL
const baseURL = external ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: [/auth\.setup\.ts/, /\.mobile\.spec\.ts/], dependencies: ["setup"] },
    { name: "mobile", use: { ...devices["Pixel 5"] }, testMatch: /\.mobile\.spec\.ts/, dependencies: ["setup"] },
  ],
  // CI serves the production build; locally this starts the dev server unless one is already running.
  webServer: external
    ? undefined
    : {
        command: process.env.CI ? `npm run start -- -p ${port}` : `npm run dev -- -p ${port}`,
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
