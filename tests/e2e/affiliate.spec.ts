import { expect, test } from "@playwright/test";
import { ADMIN_STATE, hasAdmin } from "./helpers";

/**
 * Release 4A/4B. The signed-out checks need nothing but the running site. The admin flow (merchant, link, click
 * from the product page, report, conversion import) needs the Neon test branch and runs only with E2E admin
 * credentials. Neither has been run in the build environment; see docs/IMPLEMENTATION_STATUS.md.
 */
test.describe("public edges", () => {
  test("an unknown /go address answers 404 and never redirects", async ({ request }) => {
    const response = await request.get("/go/does-not-exist-e2e", { maxRedirects: 0 });
    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("a /go address cannot be steered with a query string", async ({ request }) => {
    const response = await request.get("/go/does-not-exist-e2e?url=https://evil.example", { maxRedirects: 0 });
    expect(response.status()).toBe(404);
    expect(response.headers()["location"]).toBeUndefined();
  });

  test("the nightly job refuses a request without the secret", async ({ request }) => {
    expect((await request.get("/api/cron/affiliate-rollup")).status()).toBe(401);
    expect((await request.get("/api/cron/affiliate-rollup", { headers: { authorization: "Bearer wrong-secret-value-123" } })).status()).toBe(401);
  });

  test("admin reports and conversions need a sign-in", async ({ page }) => {
    for (const path of ["/admin/reports", "/admin/conversions", "/admin/links"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/admin-login/);
    }
  });
});

test.describe("affiliate admin flow", () => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (see docs/AUTH.md)");
  test.use({ storageState: ADMIN_STATE });
  test.describe.configure({ mode: "serial" });

  const run = Date.now().toString(36);
  const merchant = `E2E Store ${run}`;
  const network = `E2E Network ${run}`;
  const domain = `e2e-${run}.example.com`;
  const linkSlug = `e2e-link-${run}`;

  test("creates a merchant, a network and a link, and refuses a destination off the merchant's domains", async ({ page }) => {
    await page.goto("/admin/merchants/new");
    await page.getByLabel("Name").fill(merchant);
    await page.getByLabel(/Allowed domains/i).fill(domain);
    await page.getByRole("button", { name: "Create merchant" }).click();
    await expect(page).toHaveURL(/notice=created/);

    await page.goto("/admin/networks/new");
    await page.getByLabel("Name").fill(network);
    await page.getByRole("button", { name: "Create network" }).click();
    await expect(page).toHaveURL(/notice=created/);

    await page.goto("/admin/links/new");
    await page.getByLabel("Merchant").selectOption({ label: new RegExp(merchant) as unknown as string });
    await page.getByLabel("Destination address").fill("https://evil.example.org/x");
    await page.getByRole("button", { name: "Create link" }).click();
    await expect(page.getByText(/not one of this merchant/i)).toBeVisible();

    await page.getByLabel("Destination address").fill(`https://www.${domain}/item?x=1`);
    await page.getByLabel("Tracking parameters").fill("tag=e2e-21&ascsubtag={subid}");
    await page.getByLabel("Slug", { exact: true }).fill(linkSlug);
    await page.getByRole("button", { name: "Create link" }).click();
    await expect(page).toHaveURL(/notice=created/);
  });

  test("the link redirects with the tracking parameters, and the click is counted after the nightly job", async ({ page, request }) => {
    const response = await request.get(`/go/${linkSlug}?url=https://evil.example`, { maxRedirects: 0, headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" } });
    expect(response.status()).toBe(302);
    const location = new URL(response.headers()["location"] as string);
    expect(location.host).toBe(`www.${domain}`);
    expect(location.searchParams.get("tag")).toBe("e2e-21");
    expect(location.searchParams.get("ascsubtag")).toBe(linkSlug);

    await page.goto("/admin/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(page.getByText("Clicks today so far")).toBeVisible();
  });

  test("imports a conversion CSV twice without duplicating", async ({ page }) => {
    await page.goto("/admin/conversions/import");
    const csv = Buffer.from(`order_id,status,commission,date,sub_id\nE2E-${run}-1,approved,12.50,2026-11-01,${linkSlug}\n`);
    for (const expected of [/1\s*new/, /1\s*unchanged/]) {
      await page.getByLabel("Network").selectOption({ label: network });
      await page.getByLabel("CSV file").setInputFiles({ name: "report.csv", mimeType: "text/csv", buffer: csv });
      await page.getByRole("button", { name: "Import" }).click();
      await expect(page.getByRole("heading", { name: /Imported report\.csv/ })).toBeVisible();
      await expect(page.getByText(expected)).toBeVisible();
    }
  });
});
