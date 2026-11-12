import { expect, test } from "@playwright/test";
import { SIGNED_OUT } from "./helpers";

test.use({ storageState: SIGNED_OUT });

test("signed-out visit to /admin/dashboard redirects to the login page", async ({ page }) => {
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/admin-login\?callbackUrl=/);
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
});

test("protected API answers 401 without a session", async ({ request }) => {
  const res = await request.get("/api/admin/me");
  expect(res.status()).toBe(401);
});

test("there is no public registration", async ({ page, request }) => {
  await page.goto("/admin-login");
  await expect(page.getByRole("link", { name: /sign up|register|create account/i })).toHaveCount(0);
  // Do not follow redirects: a signed-out visit to /admin/* is redirected to the login page, which
  // itself answers 200. The first response is what proves there is no registration page.
  for (const path of ["/register", "/signup", "/admin/register"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect([307, 308, 401, 403, 404], path).toContain(res.status());
    if (res.status() >= 300 && res.status() < 400) expect(res.headers()["location"] ?? "", path).toContain("/admin-login");
  }
});

test("a wrong password shows one generic error", async ({ page }) => {
  await page.goto("/admin-login");
  await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Next.js adds its own role="alert" route announcer, so match by text instead of role alone.
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password." })).toBeVisible();
  await expect(page).toHaveURL(/\/admin-login/);
});
