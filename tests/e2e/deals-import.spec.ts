import { expect, test } from "@playwright/test";
import { ADMIN_STATE, hasAdmin } from "./helpers";

/** Releases 5A and 5B. Needs the Neon test branch, an admin login and at least one active merchant (see docs/AUTH.md). Not yet run. */
test.describe("deals and imports", () => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (see docs/AUTH.md)");
  test.use({ storageState: ADMIN_STATE });
  test.describe.configure({ mode: "serial" });

  const run = Date.now().toString(36);
  const title = `E2E offer ${run}`;

  test("a published deal shows on /deals and an ended one does not", async ({ page }) => {
    await page.goto("/admin/deals/new");
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Store").selectOption({ index: 1 });
    await page.getByLabel("Status").selectOption("published");
    await page.getByRole("button", { name: "Create deal" }).click();
    await expect(page).toHaveURL(/\/admin\/deals\?notice=created/);

    await page.goto("/deals");
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    await page.goto(`/admin/deals?q=${encodeURIComponent(title)}`);
    await page.getByLabel(`Select ${title}`).check();
    await page.getByRole("button", { name: "End now" }).click();
    await expect(page).toHaveURL(/notice=expired/);

    await page.goto("/deals");
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  });

  test("the import wizard checks a brands file and imports it twice without duplicates", async ({ page }) => {
    const csv = `slug,name\ne2e-${run},E2E Brand ${run}\n`;
    await page.goto("/admin/import");
    await page.getByLabel("What are you importing?").selectOption("brands");
    await page.getByLabel("CSV file").setInputFiles({ name: "brands.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByRole("button", { name: "Check the file" }).click();
    await expect(page.getByText("1 would be added")).toBeVisible();
    await page.getByRole("button", { name: /^Import 1 row/ }).click();
    await expect(page.getByText("1 added")).toBeVisible();

    await page.getByRole("button", { name: "Check again" }).click();
    await expect(page.getByText("1 are already up to date")).toBeVisible();
  });

  test("an export downloads as CSV", async ({ page }) => {
    const response = await page.request.get("/admin/export/brands");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.text()).toContain("slug,name");
  });
});
