import { expect, test } from "@playwright/test";
import { ADMIN, ADMIN_STATE, ANALYST, SIGNED_OUT, hasAdmin, hasAnalyst, signIn } from "./helpers";

test.describe("signed in as super admin", () => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (see docs/AUTH.md)");
  test.use({ storageState: ADMIN_STATE });

  test("shell and navigation work", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText(ADMIN.email)).toBeVisible();

    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Audit log" }).click();
    await expect(page).toHaveURL(/\/admin\/audit/);
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();

    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("signing in wrote an audit row", async ({ page }) => {
    await page.goto(`/admin/audit?q=${encodeURIComponent("auth.login_success")}`);
    await expect(page.getByRole("cell", { name: "auth.login_success" }).first()).toBeVisible();
  });

  test("protected API returns the session user", async ({ page }) => {
    const res = await page.request.get("/api/admin/me");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.roles).toContain("super_admin");
  });
});

test.describe("sign in and out", () => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (see docs/AUTH.md)");
  test.use({ storageState: SIGNED_OUT });

  test("signs in, then signs out and is locked out of the admin again", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin-login/);
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin-login/);
  });

  test("ignores an off-site callbackUrl", async ({ page }) => {
    await signIn(page, ADMIN, "https://evil.example");
    expect(new URL(page.url()).hostname).not.toContain("evil");
  });
});

test.describe("signed in as analyst", () => {
  test.skip(!hasAnalyst, "Set E2E_ANALYST_EMAIL and E2E_ANALYST_PASSWORD (see docs/AUTH.md)");
  test.use({ storageState: SIGNED_OUT });

  test("lacks audit access: link hidden, page answers 403", async ({ page }) => {
    await signIn(page, ANALYST);
    await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Audit log" })).toHaveCount(0);

    const res = await page.goto("/admin/audit");
    expect(res?.status()).toBe(403);
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();

    const api = await page.request.get("/api/admin/me");
    expect(api.status()).toBe(200);
  });
});
