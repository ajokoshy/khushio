import { describe, expect, it } from "vitest";
import { articleJsonLd, breadcrumbJsonLd, minorToDecimalString, offersFor, organizationJsonLd, productJsonLd, REQUIRED_FIELDS, serializeJsonLd, websiteJsonLd, type JsonLd } from "@/modules/seo/jsonld";

/** Parse what would be written into the page, like a crawler does, and check the fields each type needs. */
const roundTrip = (data: JsonLd): JsonLd => JSON.parse(serializeJsonLd(data));
const missing = (data: JsonLd) => (REQUIRED_FIELDS[String(data["@type"])] ?? []).filter((f) => data[f] === undefined || data[f] === null || data[f] === "");

const variant = (over: Record<string, unknown> = {}) => ({ label: "Std", sku: "SKU-1", priceMinor: 199900, currency: "INR", ...over });
const product = (variants: ReturnType<typeof variant>[]) => productJsonLd({ name: "Blue shoes", path: "/products/blue-shoes", description: "Nice", images: ["https://img.example/a.jpg"], brand: "Acme", variants: variants as never });

describe("Product and Offer", () => {
  it("does not emit an Offer without a price", () => {
    expect(offersFor("/p", [{ label: "x", sku: null, priceMinor: null, currency: "INR", availability: "InStock" }])).toEqual([]);
    expect(roundTrip(product([variant({ priceMinor: null, availability: "InStock" })])).offers).toBeUndefined();
  });
  it("does not emit an Offer without a known availability (the site tracks no stock yet)", () => {
    expect(roundTrip(product([variant()])).offers).toBeUndefined();
    expect(roundTrip(product([variant({ availability: null })])).offers).toBeUndefined();
    expect(offersFor("/p", [variant({ availability: "Maybe" }) as never])).toEqual([]);
  });
  it("emits a valid Offer when price and availability are both known", () => {
    const data = roundTrip(product([variant({ availability: "InStock" })]));
    expect(data.offers).toMatchObject({ "@type": "Offer", price: "1999.00", priceCurrency: "INR", availability: "https://schema.org/InStock", url: "http://localhost:3000/products/blue-shoes" });
    expect(missing(data.offers as JsonLd)).toEqual([]);
  });
  it("several priced variants give a list of Offers, and variants without a price are skipped", () => {
    const data = roundTrip(product([variant({ availability: "InStock" }), variant({ label: "B", sku: "SKU-2", priceMinor: 249900, availability: "OutOfStock" }), variant({ label: "C", sku: null, priceMinor: null, availability: "InStock" })]));
    expect((data.offers as unknown[]).length).toBe(2);
  });
  it("the Product itself still has its required fields, and carries sku only when there is exactly one", () => {
    const data = roundTrip(product([variant()]));
    expect(missing(data)).toEqual([]);
    expect(data).toMatchObject({ "@type": "Product", name: "Blue shoes", sku: "SKU-1", brand: { "@type": "Brand", name: "Acme" } });
    expect(roundTrip(product([variant(), variant({ sku: "SKU-2" })])).sku).toBeUndefined();
  });
  it("formats prices by the currency's decimals", () => {
    expect(minorToDecimalString(19900, "INR")).toBe("199.00");
    expect(minorToDecimalString(199, "JPY")).toBe("199");
    expect(minorToDecimalString(5, "USD")).toBe("0.05");
  });
});

describe("other types", () => {
  it("Organization and WebSite carry their required fields and a search action", () => {
    for (const d of [organizationJsonLd(), websiteJsonLd()]) expect(missing(roundTrip(d))).toEqual([]);
    expect(JSON.stringify(websiteJsonLd())).toContain("{search_term_string}");
  });
  it("BreadcrumbList needs two steps, numbers them, and gives the last (current) step no link", () => {
    expect(breadcrumbJsonLd([{ label: "Home", href: "/" }])).toBeNull();
    const data = roundTrip(breadcrumbJsonLd([{ label: "Home", href: "/" }, { label: "Discover", href: "/discover" }, { label: "Blue shoes" }])!);
    expect(missing(data)).toEqual([]);
    const items = data.itemListElement as { position: number; name: string; item?: string }[];
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items[1]?.item).toBe("http://localhost:3000/discover");
    expect(items[2]?.item).toBeUndefined();
  });
  it("Article has the fields Google asks for, with a Person or the site as author", () => {
    const base = { headline: "How to choose", path: "/articles/how-to-choose", datePublished: new Date("2026-03-01T10:00:00Z"), dateModified: new Date("2026-03-02T10:00:00Z") };
    const withAuthor = roundTrip(articleJsonLd({ ...base, authorName: "Asha" }));
    expect(missing(withAuthor)).toEqual([]);
    expect(withAuthor.author).toEqual({ "@type": "Person", name: "Asha" });
    expect((roundTrip(articleJsonLd(base)).author as { "@type": string })["@type"]).toBe("Organization");
    expect(articleJsonLd({ ...base, headline: "x".repeat(200) }).headline).toHaveLength(110);
  });
});

describe("serializeJsonLd", () => {
  it("can not close the script tag or start a comment, whatever the data holds", () => {
    const text = serializeJsonLd({ name: "</script><script>alert(1)</script><!-- & \u2028" });
    expect(text).not.toMatch(/[<>&\u2028]/);
    expect(JSON.parse(text).name).toBe("</script><script>alert(1)</script><!-- & \u2028");
  });
});
