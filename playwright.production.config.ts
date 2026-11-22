import { defineConfig } from "@playwright/test";

/**
 * Release 7B: the smoke suite that runs AGAINST A DEPLOYED SITE (preview or production), never starts a server and never logs in
 * or changes anything. Every check is read-only.
 *
 *   SMOKE_BASE_URL=https://khushio.com npm run test:smoke
 *
 * It uses plain HTTP requests (no browser), so it also runs where Playwright's browsers are not installed.
 */
export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  retries: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.SMOKE_BASE_URL ?? "https://khushio.com", extraHTTPHeaders: { "user-agent": "khushio-smoke/1.0" } },
});
