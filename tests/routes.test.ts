import { describe, expect, it } from "vitest";
import { GET } from "../app/go/[id]/route";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { site } from "../lib/config/site";
import { products } from "../lib/data/catalog";
const go = (id: string) => GET(new Request(`https://khushio.com/go/${id}`), { params: Promise.resolve({ id }) });
describe("/go affiliate redirect", () => {
  it("redirects a known offer", async () => { const r = await go("o2"); expect(r.status).toBe(302); expect(r.headers.get("location")).toBe("https://example.com/p/2"); });
  it("is noindex", async () => expect((await go("o2")).headers.get("x-robots-tag")).toContain("noindex"));
  it("returns 404 for unknown ids", async () => expect((await go("nope")).status).toBe(404));
  it("returns 404 for injection-like ids", async () => expect((await go("../../etc/passwd")).status).toBe(404));
});
describe("robots", () => {
  it("blocks admin, redirects and api", () => { const r = robots(); const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules; expect(rule.disallow).toEqual(expect.arrayContaining(["/admin", "/go/", "/api/"])); expect(r.sitemap).toBe(`${site.url}/sitemap.xml`); });
});
describe("sitemap", () => {
  it("includes the home page and every product", async () => { const urls = (await sitemap()).map((e) => e.url); expect(urls).toContain(site.url); for (const p of products) expect(urls).toContain(`${site.url}/products/${p.slug}`); });
  it("has unique absolute urls and nothing private", async () => { const urls = (await sitemap()).map((e) => e.url); expect(new Set(urls).size).toBe(urls.length); for (const u of urls) { expect(u.startsWith(site.url)).toBe(true); expect(u).not.toMatch(/\/admin|\/go\//); } });
  it("lists category, brand and store pages", async () => { const urls = (await sitemap()).map((e) => e.url).join(" "); expect(urls).toContain("/categories/home-living"); expect(urls).toContain("/brands/greenleaf"); expect(urls).toContain("/stores/sample-store"); });
});
