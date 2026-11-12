import { expect, test } from "@playwright/test";
import { SIGNED_OUT, hasAdmin } from "./helpers";

/**
 * Release 2C. Writes rows to login_attempts, so it needs a database and must only ever run against the
 * Neon TEST branch (it is skipped unless the E2E admin variables are set, the same switch the other
 * database-backed specs use). A random email per run keeps it independent of the other specs.
 */
test.describe("login rate limiting", () => {
  test.skip(!hasAdmin, "Needs the Neon test branch: set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (see docs/AUTH.md)");
  test.use({ storageState: SIGNED_OUT });
  test.describe.configure({ retries: 0 });

  test("the sixth bad attempt in a row is refused with the throttle message", async ({ page }) => {
    const email = `throttle-${Date.now()}@example.test`;
    await page.goto("/admin-login");
    const attempt = async () => {
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill("definitely-not-the-password");
      await page.getByRole("button", { name: "Sign in" }).click();
    };

    for (let i = 1; i <= 5; i++) {
      await attempt();
      await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password." })).toBeVisible();
    }
    await attempt();
    await expect(page.getByRole("alert").filter({ hasText: "Too many failed attempts. Try again in 15 minutes." })).toBeVisible();
    await expect(page).toHaveURL(/\/admin-login/);
  });
});
