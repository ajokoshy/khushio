import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { Logo } from "../components/Logo";
import { Grid, PageHead, ProductCard } from "../components/ProductCard";
import { products } from "../lib/data/catalog";
const p = products.find((x) => x.mrp)!;
describe("ProductCard", () => {
  it("shows name, link, price and struck-through MRP", () => { const h = renderToStaticMarkup(<ProductCard p={p} />); expect(h).toContain(p.name); expect(h).toContain(`/products/${p.slug}"`); expect(h).toContain("line-through"); });
  it("uses a text tile without an image", () => expect(renderToStaticMarkup(<ProductCard p={p} />)).not.toContain("<img"));
  it("uses an optimised image with alt text when present", () => { const h = renderToStaticMarkup(<ProductCard p={{ ...p, image: "https://res.cloudinary.com/x/image/upload/v1/a.jpg" }} />); expect(h).toContain("f_auto,q_auto,w_600"); expect(h).toContain(`alt="${p.name}"`); expect(h).toContain('loading="lazy"'); });
  it("prefers the category label from the database", () => expect(renderToStaticMarkup(<ProductCard p={{ ...p, categoryLabel: "Custom Label" }} />)).toContain("Custom Label"));
});
describe("layout helpers", () => {
  it("Grid and PageHead render children and intro", () => { expect(renderToStaticMarkup(<Grid><i>x</i></Grid>)).toContain("<i>x</i>"); expect(renderToStaticMarkup(<PageHead title="T" intro="Intro" />)).toMatch(/<h1[^>]*>T<\/h1>.*Intro/); });
});
describe("Breadcrumbs", () => {
  const h = renderToStaticMarkup(<Breadcrumbs items={[{ name: "Cat", href: "/categories/c" }, { name: "Item", href: "/products/i" }]} />);
  it("marks the current page", () => expect(h).toContain('aria-current="page">Item'));
  it("has an accessible nav label", () => expect(h).toContain('aria-label="Breadcrumb"'));
  it("emits BreadcrumbList JSON-LD with positions and absolute urls", () => { const ld = JSON.parse(/<script[^>]*>(.*?)<\/script>/.exec(h)![1].replace(/&quot;/g, '"')); expect(ld["@type"]).toBe("BreadcrumbList"); expect(ld.itemListElement.map((e: { position: number }) => e.position)).toEqual([1, 2, 3]); expect(ld.itemListElement[2].item).toBe("https://khushio.com/products/i"); });
});
describe("Logo", () => {
  it("links home with an accessible label", () => { const h = renderToStaticMarkup(<Logo />); expect(h).toContain('aria-label="Khushio home"'); expect(h).toContain('href="/"'); });
  it("shows the tagline on request", () => { expect(renderToStaticMarkup(<Logo tagline />)).toContain("Discover More"); expect(renderToStaticMarkup(<Logo />)).not.toContain("Discover More"); });
});
