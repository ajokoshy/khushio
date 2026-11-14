import { expect, test } from "@playwright/test";
import { ADMIN_STATE, hasAdmin } from "./helpers";

/**
 * Release 3B/3C: create a category and a product in the admin, check a draft is invisible to visitors, publish is
 * refused without an image, and the public search page works. Image upload goes to Cloudinary and is covered by
 * the manual checklist in docs/IMAGES.md. Needs the Neon test branch.
 */
test.describe("products", () => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (see docs/AUTH.md)");
  test.use({ storageState: ADMIN_STATE });
  test.describe.configure({ mode: "serial" });

  const run = Date.now().toString(36);
  const category = `E2E Gear ${run}`;
  const product = `E2E Widget ${run}`;
  let slug = "";

  test("creates a category, then a draft product with two variants", async ({ page }) => {
    await page.goto("/admin/categories/new");
    await page.getByLabel("Name").fill(category);
    await page.getByRole("button", { name: "Create category" }).click();
    await expect(page).toHaveURL(/notice=created/);

    await page.goto("/admin/products/new");
    await page.getByLabel("Name", { exact: true }).fill(product);
    await page.getByLabel("Main category").selectOption({ label: category });
    await page.getByLabel("Label").first().fill("Small");
    await page.getByLabel("Price").first().fill("1,299.50");
    await page.getByRole("button", { name: "Add a variant" }).click();
    await page.getByLabel("Label").nth(1).fill("Large");
    await page.getByLabel("Price").nth(1).fill("abc");
    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Enter an amount" })).toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(product); // nothing was wiped

    await page.getByLabel("Price").nth(1).fill("1999");
    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}\?notice=created/);
    slug = (await page.getByLabel("Slug").inputValue()).trim();
    expect(slug).toContain("e2e-widget");
  });

  test("a draft is not visible to visitors, and cannot be published without an image", async ({ page, browser }) => {
    const visitor = await browser.newContext();
    const response = await (await visitor.newPage()).goto(`/products/${slug}`);
    expect(response?.status()).toBe(404);
    await visitor.close();

    await page.getByLabel("Status").selectOption("PUBLISHED");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Add at least one image" })).toBeVisible();
  });

  test("the product list finds it and the public search page loads", async ({ page }) => {
    await page.goto(`/admin/products?q=${encodeURIComponent(product)}`);
    await expect(page.getByRole("cell", { name: product })).toBeVisible();
    await page.goto("/discover?q=zzzznothing");
    await expect(page.getByText("No products found")).toBeVisible();
    await page.goto("/discover");
    await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
  });
});
