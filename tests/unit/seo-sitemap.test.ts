import { describe, expect, it } from "vitest";
import { indexXml, parseSitemapFile, planSitemap, SITEMAP_CHUNK, urlsetXml, type SitemapCounts } from "@/modules/seo/sitemap";

const counts = (over: Partial<SitemapCounts> = {}): SitemapCounts => ({ static: 5, categories: 10, brands: 10, stores: 3, articles: 20, products: 100, ...over });

describe("planSitemap", () => {
  it("is one file up to 5,000 URLs in total", () => {
    expect(planSitemap(counts()).mode).toBe("single");
    expect(planSitemap(counts({ products: SITEMAP_CHUNK - 48 })).mode).toBe("single");
  });
  it("becomes an index split by kind, with products in numbered files of 5,000, once over", () => {
    const plan = planSitemap(counts({ products: 12_001 }));
    expect(plan).toEqual({ mode: "index", files: ["static.xml", "categories.xml", "brands.xml", "stores.xml", "articles.xml", "products-1.xml", "products-2.xml", "products-3.xml"] });
  });
  it("leaves out kinds with no URLs", () => {
    const plan = planSitemap(counts({ products: 6000, brands: 0, stores: 0 }));
    expect(plan).toMatchObject({ mode: "index" });
    expect((plan as { files: string[] }).files).not.toContain("brands.xml");
  });
});

describe("parseSitemapFile", () => {
  it("reads the file names the index lists and nothing else", () => {
    expect(parseSitemapFile("products-2.xml")).toEqual({ kind: "products", page: 2 });
    expect(parseSitemapFile("brands.xml")).toEqual({ kind: "brands", page: 1 });
    for (const bad of ["products.xml", "brands-2.xml", "products-0.xml", "secrets.xml", "../x.xml", "products-1.txt", "products-99999.xml"]) expect(parseSitemapFile(bad), bad).toBeNull();
  });
});

describe("xml", () => {
  it("writes absolute, escaped addresses and the home page without a trailing slash path", () => {
    const xml = urlsetXml("https://khushio.com/", [{ path: "/" }, { path: "/p/a&b", lastModified: new Date("2026-01-01T00:00:00Z"), changeFrequency: "weekly", priority: 0.5 }]);
    expect(xml).toContain("<loc>https://khushio.com</loc>");
    expect(xml).toContain("<loc>https://khushio.com/p/a&amp;b</loc>");
    expect(xml).toContain("<lastmod>2026-01-01T00:00:00.000Z</lastmod>");
    expect(xml).toContain("<priority>0.5</priority>");
  });
  it("an index lists each file under /sitemaps/", () => {
    expect(indexXml("https://khushio.com", ["products-1.xml"])).toContain("<loc>https://khushio.com/sitemaps/products-1.xml</loc>");
  });
});
