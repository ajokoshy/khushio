import { expect, test } from "@playwright/test";
import { ADMIN_STATE, hasAdmin } from "./helpers";

test.describe("admin shell on a phone", () => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (see docs/AUTH.md)");
  test.use({ storageState: ADMIN_STATE });

  const noSidewaysScroll = (page: import("@playwright/test").Page) =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  test("menu opens, navigates and closes; no horizontal scroll", async ({ page }) => {
    await page.goto("/admin/dashboard");
    const auditLink = page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Audit log" });
    await expect(auditLink).toBeHidden();
    expect(await noSidewaysScroll(page)).toBe(true);

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(auditLink).toBeVisible();
    await auditLink.click();

    await expect(page).toHaveURL(/\/admin\/audit/);
    await expect(auditLink).toBeHidden();
    expect(await noSidewaysScroll(page)).toBe(true);
  });
});
