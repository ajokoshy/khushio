import { describe, expect, it } from "vitest";
import { productFormToObject } from "@/modules/products/form";
import { parseTags, productInputSchema } from "@/modules/products/validation";

const CAT = "22222222-2222-2222-2222-222222222222";
const CAT2 = "33333333-3333-3333-3333-333333333333";

function form(entries: [string, string][]) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}
const base: [string, string][] = [["name", "Trail Runner"], ["status", "DRAFT"]];
const parse = (extra: [string, string][]) => productInputSchema.safeParse(productFormToObject(form([...base, ...extra])));

describe("product form", () => {
  it("reads indexed variant and attribute rows and drops empty ones", () => {
    const raw = productFormToObject(form([...base, ["variants.0.label", "Size 9"], ["variants.0.price", "1,299"], ["variants.0.currency", "INR"], ["variants.1.label", ""], ["variants.1.currency", "INR"], ["attributes.0.name", "Material"], ["attributes.0.value", "Mesh"], ["attributes.1.name", ""], ["attributes.1.value", ""]]));
    expect(raw.variants).toEqual([{ label: "Size 9", price: "1,299", currency: "INR" }]);
    expect(raw.attributes).toEqual([{ name: "Material", value: "Mesh" }]);
  });

  it("converts prices to minor units and keeps row order", () => {
    const r = parse([["variants.0.label", "A"], ["variants.0.price", "10.5"], ["variants.1.label", "B"], ["variants.1.price", ""]]);
    expect(r.success && r.data.variants.map((v) => v.priceMinor)).toEqual([1050, null]);
  });

  it("reports price and label errors on the row that has them", () => {
    const r = parse([["variants.0.label", "A"], ["variants.0.price", "abc"], ["variants.1.price", "5"]]);
    expect(r.success).toBe(false);
    const paths = !r.success ? r.error.issues.map((i) => i.path.join(".")) : [];
    expect(paths).toEqual(expect.arrayContaining(["variants.0.price", "variants.1.label"]));
  });

  it("rejects a duplicate SKU inside one product, ignoring case", () => {
    const r = parse([["variants.0.label", "A"], ["variants.0.sku", "ab-1"], ["variants.1.label", "B"], ["variants.1.sku", "AB-1"]]);
    expect(!r.success && r.error.issues.some((i) => i.path.join(".") === "variants.1.sku")).toBe(true);
  });

  it("requires a time for a scheduled product and drops it for any other status", () => {
    expect(parse([["status", "SCHEDULED"]]).success).toBe(false);
    const ok = parse([["status", "SCHEDULED"], ["publishAt", "2026-12-01T09:30"]]);
    expect(ok.success && ok.data.publishAt?.toISOString()).toBe("2026-12-01T04:00:00.000Z");
    const draft = parse([["publishAt", "2026-12-01T09:30"]]);
    expect(draft.success && draft.data.publishAt).toBeNull();
  });

  it("keeps the main category out of the extra categories and removes repeats", () => {
    const r = parse([["primaryCategoryId", CAT], ["categoryIds", CAT], ["categoryIds", CAT2], ["categoryIds", CAT2]]);
    expect(r.success && r.data.categoryIds).toEqual([CAT2]);
  });

  it("normalises tags", () => {
    expect(parseTags("Running, trail  shoes\nrunning,")).toEqual(["running", "trail shoes"]);
  });
});
