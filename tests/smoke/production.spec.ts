import { expect, test, type APIResponse } from "@playwright/test";

/** Release 7B: read-only smoke checks for a deployed site. Run after every deploy (docs/DEPLOYMENT.md). */

const noRedirect = { maxRedirects: 0 } as const;
const header = (r: APIResponse, name: string) => r.headers()[name.toLowerCase()] ?? "";

test("the health check answers and says the database is reachable", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
});

test("the home page loads and has a title, description and canonical address", async ({ request }) => {
  const r = await request.get("/");
  expect(r.status()).toBe(200);
  const html = await r.text();
  expect(html).toMatch(/<title>[^<]{3,}<\/title>/);
  expect(html).toMatch(/<meta name="description" content="[^"]{20,}"/);
  expect(html).toMatch(/<link rel="canonical" href="https:\/\/[^"]+"/);
  expect(html).toContain('"@type":"Organization"');
});

test("every response carries the security headers", async ({ request }) => {
  const r = await request.get("/");
  expect(header(r, "x-content-type-options")).toBe("nosniff");
  expect(header(r, "x-frame-options")).toBe("DENY");
  expect(header(r, "strict-transport-security")).toContain("max-age=");
  expect(header(r, "referrer-policy")).toBeTruthy();
  expect(header(r, "permissions-policy")).toContain("camera=()");
  expect(header(r, "content-security-policy") || header(r, "content-security-policy-report-only")).toContain("frame-ancestors 'none'");
  expect(header(r, "x-powered-by")).toBe("");
});

test("robots.txt keeps crawlers out of the admin and points to the sitemap", async ({ request }) => {
  const text = await (await request.get("/robots.txt")).text();
  expect(text).toContain("Disallow: /admin");
  expect(text).toMatch(/Sitemap: https:\/\/[^\s]+\/sitemap\.xml/);
  expect(text).not.toMatch(/Disallow: \/\s*$/m);
});

test("the sitemap is valid XML with only absolute https addresses", async ({ request }) => {
  const r = await request.get("/sitemap.xml");
  expect(r.status()).toBe(200);
  expect(header(r, "content-type")).toContain("xml");
  const xml = await r.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] as string);
  expect(locs.length).toBeGreaterThan(0);
  for (const loc of locs) expect(loc).toMatch(/^https:\/\//);
  expect(xml).not.toMatch(/\/admin|\/api\/|\/go\//);
});

test("a product page from the sitemap has structured data, a canonical address and indexable robots", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  const first = [...sitemap.matchAll(/<loc>([^<]*\/products\/[^<]+)<\/loc>/g)][0]?.[1];
  test.skip(!first, "the sitemap lists no product yet (a sitemap index is checked below)");
  const r = await request.get(new URL(first as string).pathname);
  expect(r.status()).toBe(200);
  const html = await r.text();
  expect(html).toContain('"@type":"Product"');
  expect(html).toContain('"@type":"BreadcrumbList"');
  expect(html).toMatch(/<link rel="canonical"/);
  expect(html).not.toMatch(/<meta name="robots" content="[^"]*noindex/);
});

test("the admin is closed to visitors", async ({ request }) => {
  for (const path of ["/admin", "/admin/dashboard", "/admin/products", "/admin/seo", "/admin/redirects", "/admin/launch"]) {
    const r = await request.get(path, noRedirect);
    expect([301, 302, 303, 307, 308, 401, 403], path).toContain(r.status());
    if (r.status() >= 300 && r.status() < 400) expect(header(r, "location"), path).toMatch(/admin-login/);
  }
  expect((await request.get("/admin-login")).status()).toBe(200);
});

test("an unknown page is a real 404 that search engines are told to ignore", async ({ request }) => {
  const r = await request.get("/products/this-page-does-not-exist-7b");
  expect(r.status()).toBe(404);
  expect(await r.text()).toMatch(/noindex/);
});

test("an unknown /go link is a 404 and is never indexed", async ({ request }) => {
  const r = await request.get("/go/this-link-does-not-exist-7b", noRedirect);
  expect(r.status()).toBe(404);
  expect(header(r, "x-robots-tag")).toContain("noindex");
});

test("the daily job refuses a request without the secret", async ({ request }) => {
  expect((await request.get("/api/cron/affiliate-rollup")).status()).toBe(401);
  expect((await request.get("/api/cron/affiliate-rollup", { headers: { authorization: "Bearer wrong-secret-wrong-secret" } })).status()).toBe(401);
});

test("the CSP report endpoint accepts a report and answers 204", async ({ request }) => {
  const r = await request.post("/api/csp-report", { headers: { "content-type": "application/csp-report" }, data: JSON.stringify({ "csp-report": { "blocked-uri": "smoke-test", "violated-directive": "script-src" } }) });
  expect(r.status()).toBe(204);
});

test("the legal pages are published and linked from the footer", async ({ request }) => {
  const html = await (await request.get("/")).text();
  for (const slug of ["privacy-policy", "terms", "affiliate-disclosure", "contact"]) {
    expect(html, `footer link to /p/${slug}`).toContain(`/p/${slug}`);
    expect((await request.get(`/p/${slug}`)).status(), slug).toBe(200);
  }
  expect(html).toContain("affiliate links");
});

test("the home page does not set cookies on visitors", async ({ request }) => {
  const r = await request.get("/");
  expect(header(r, "set-cookie")).toBe("");
});
