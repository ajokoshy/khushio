import { expect, test } from "@playwright/test";
import { ADMIN_STATE, hasAdmin } from "./helpers";

/** Release 3A: create a three-level category tree, a brand and a merchant with allowed domains, then archive. Needs the Neon test branch. */
test.describe("catalogue reference data", () => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (see docs/AUTH.md)");
  test.use({ storageState: ADMIN_STATE });
  test.describe.configure({ mode: "serial" });

  const run = Date.now().toString(36);
  const top = `E2E Top ${run}`;
  const mid = `E2E Mid ${run}`;
  const leaf = `E2E Leaf ${run}`;

  const createCategory = async (page: import("@playwright/test").Page, name: string, parent?: string) => {
    await page.goto("/admin/categories/new");
    await page.getByLabel("Name").fill(name);
    if (parent) await page.getByLabel("Parent category").selectOption({ label: parent });
    await page.getByRole("button", { name: "Create category" }).click();
    await expect(page).toHaveURL(/\/admin\/categories\?notice=created/);
  };

  test("creates a three-level category tree", async ({ page }) => {
    await createCategory(page, top);
    await createCategory(page, mid, top);
    await createCategory(page, leaf, `— ${mid}`);
    await page.goto(`/admin/categories?q=${encodeURIComponent(`E2E`)}`);
    await expect(page.getByRole("cell", { name: new RegExp(leaf) }).first()).toBeVisible();
    await expect(page.getByText(`${top} › ${mid} › ${leaf}`)).toBeVisible();
  });

  test("rejects a duplicate name under the same parent", async ({ page }) => {
    await page.goto("/admin/categories/new");
    await page.getByLabel("Name").fill(mid.toUpperCase());
    await page.getByLabel("Parent category").selectOption({ label: top });
    await page.getByRole("button", { name: "Create category" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "already exists" })).toBeVisible();
  });

  test("creates a brand and a merchant with allowed domains", async ({ page }) => {
    await page.goto("/admin/brands/new");
    await page.getByLabel("Name").fill(`E2E Brand ${run}`);
    await page.getByRole("button", { name: "Create brand" }).click();
    await expect(page).toHaveURL(/\/admin\/brands\?notice=created/);

    await page.goto("/admin/merchants/new");
    await page.getByLabel("Name").fill(`E2E Shop ${run}`);
    await page.getByLabel("Allowed domains").fill("example-shop.test\nhttps://www.example-shop.test/path");
    await page.getByRole("button", { name: "Create merchant" }).click();
    await expect(page).toHaveURL(/\/admin\/merchants\?notice=created/);
    await expect(page.getByText("example-shop.test, www.example-shop.test")).toBeVisible();

    await page.goto("/admin/merchants/new");
    await page.getByLabel("Name").fill(`E2E Bad ${run}`);
    await page.getByLabel("Allowed domains").fill("co.in");
    await page.getByRole("button", { name: "Create merchant" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "shared by many" })).toBeVisible();
  });

  test("archives and restores a leaf category", async ({ page }) => {
    await page.goto(`/admin/categories?q=${encodeURIComponent(leaf)}`);
    await page.getByRole("link", { name: leaf }).first().click();
    await page.getByRole("button", { name: "Archive" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("Archived", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Restore" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
  });
});
