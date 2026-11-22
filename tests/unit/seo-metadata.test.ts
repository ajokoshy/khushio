import { describe, expect, it } from "vitest";
import { buildMetadata, clipText, DESCRIPTION_MAX, notFoundMetadata, seoIssues } from "@/modules/seo/metadata";
import { SITE } from "@/shared/constants/site";

const robotsOf = (m: ReturnType<typeof buildMetadata>) => m.robots as { index: boolean; follow: boolean };
const canonicalOf = (m: ReturnType<typeof buildMetadata>) => (m.alternates as { canonical: string }).canonical;

describe("buildMetadata", () => {
  it("snapshot of a normal page", () => {
    expect(buildMetadata({ title: "Blue shoes", description: "Comfortable blue shoes.", path: "/products/blue-shoes", image: "https://res.cloudinary.com/x/blue.jpg" })).toMatchInlineSnapshot(`
      {
        "alternates": {
          "canonical": "http://localhost:3000/products/blue-shoes",
        },
        "description": "Comfortable blue shoes.",
        "openGraph": {
          "description": "Comfortable blue shoes.",
          "images": [
            "https://res.cloudinary.com/x/blue.jpg",
          ],
          "siteName": "Khushio",
          "title": "Blue shoes",
          "type": "website",
          "url": "http://localhost:3000/products/blue-shoes",
        },
        "robots": {
          "follow": true,
          "index": true,
        },
        "title": "Blue shoes",
        "twitter": {
          "card": "summary_large_image",
          "description": "Comfortable blue shoes.",
          "images": [
            "https://res.cloudinary.com/x/blue.jpg",
          ],
          "title": "Blue shoes",
        },
      }
    `);
  });

  it("never leaves a page without a title or a description", () => {
    for (const description of [undefined, null, "", "   "]) {
      const m = buildMetadata({ title: "Thing", description, path: "/x" });
      expect(m.title).toBe("Thing");
      expect(m.description).toBe(SITE.description);
    }
    expect(buildMetadata({ title: "  ", description: "d", path: "/x" }).title).toBe(SITE.name);
    expect(notFoundMetadata("Product").title).toBeTruthy();
    expect(notFoundMetadata("Product").description).toBeTruthy();
  });

  it("the editor's search fields win over the defaults", () => {
    const m = buildMetadata({ title: "Thing", description: "Own text", path: "/x", override: { title: "Custom", description: "Custom text", canonical: "https://other.example/x", ogImage: "https://img.example/a.png", robots: null } });
    expect(m.title).toBe("Custom");
    expect(m.description).toBe("Custom text");
    expect(canonicalOf(m)).toBe("https://other.example/x");
    expect((m.openGraph as { images: string[] }).images).toEqual(["https://img.example/a.png"]);
  });

  it("noindex comes from the page rule or the editor, and the editor's follow choice is kept", () => {
    expect(robotsOf(buildMetadata({ title: "T", path: "/x", noindex: true }))).toEqual({ index: false, follow: true });
    expect(robotsOf(buildMetadata({ title: "T", path: "/x", override: { title: null, description: null, canonical: null, ogImage: null, robots: "noindex,nofollow" } }))).toEqual({ index: false, follow: false });
    expect(robotsOf(buildMetadata({ title: "T", path: "/x" }))).toEqual({ index: true, follow: true });
  });

  it("a later list page has its own canonical and stays out of search results; page 1 is the plain address", () => {
    const second = buildMetadata({ title: "T", path: "/articles", page: 2 });
    expect(canonicalOf(second)).toBe("http://localhost:3000/articles?page=2");
    expect(robotsOf(second).index).toBe(false);
    const first = buildMetadata({ title: "T", path: "/articles", page: 1 });
    expect(canonicalOf(first)).toBe("http://localhost:3000/articles");
    expect(robotsOf(first).index).toBe(true);
  });

  it("an article carries its publish and edit times", () => {
    const m = buildMetadata({ title: "T", path: "/articles/x", type: "article", article: { publishedTime: new Date("2026-01-02T00:00:00Z"), modifiedTime: new Date("2026-02-03T00:00:00Z") } });
    expect(m.openGraph).toMatchObject({ type: "article", publishedTime: "2026-01-02T00:00:00.000Z", modifiedTime: "2026-02-03T00:00:00.000Z" });
  });
});

describe("clipText", () => {
  it("leaves short text alone, collapses white space, and cuts long text at a word with an ellipsis", () => {
    expect(clipText("  a \n b  ")).toBe("a b");
    const long = "word ".repeat(80);
    const clipped = clipText(long);
    expect(clipped.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(clipped.endsWith("…")).toBe(true);
    expect(clipped).not.toMatch(/wor…$/);
  });
});

describe("seoIssues", () => {
  it("flags long titles, missing and badly sized descriptions", () => {
    expect(seoIssues({ title: "x".repeat(61), ownDescription: "d".repeat(100), requiresOwnDescription: true })).toEqual(["title-long"]);
    expect(seoIssues({ title: "ok", ownDescription: null, requiresOwnDescription: true })).toEqual(["no-own-description"]);
    expect(seoIssues({ title: "ok", ownDescription: null, requiresOwnDescription: false })).toEqual([]);
    expect(seoIssues({ title: "ok", ownDescription: "short", requiresOwnDescription: false })).toEqual(["description-short"]);
    expect(seoIssues({ title: "ok", ownDescription: "d".repeat(161), requiresOwnDescription: false })).toEqual(["description-long"]);
    expect(seoIssues({ title: "ok", ownDescription: "d".repeat(120), requiresOwnDescription: true })).toEqual([]);
  });
});
