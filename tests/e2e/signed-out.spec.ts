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

test("there is no public registration", async ({ page }) => {
  await page.goto("/admin-login");
  await expect(page.getByRole("link", { name: /sign up|register|create account/i })).toHaveCount(0);
  for (const path of ["/register", "/signup", "/admin/register"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).not.toBe(200);
  }
});

test("a wrong password shows one generic error", async ({ page }) => {
  await page.goto("/admin-login");
  await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid email or password.");
  await expect(page).toHaveURL(/\/admin-login/);
});
