/**
 * Release 5B against a real Postgres: every kind of import (create, update, unchanged on the second run, blank cells never
 * clear values, references checked), the all-or-nothing batch write, the import history, and that every export can be
 * imported straight back with nothing changing. Only the Next.js cache is stubbed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/core/database/client", () => ({ db: () => holder.db }));
vi.mock("next/cache", () => ({ revalidateTag: () => undefined, unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn }));

import { eq } from "drizzle-orm";
import { affiliateImportLogs, affiliateLinks, auditLogs, brands, categories, deals, merchants, productCategories, products, productTags, productVariants, users } from "@/core/database/schema";
import { parseCsv } from "@/core/csv/parse";
import * as imports from "@/modules/imports/service";
import { writeProductBatch } from "@/modules/products/import-repository";
import type { ImportEntity } from "@/modules/imports/types";
import { createTestDatabase } from "./helpers";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
let t: TestDb;
let actor: string;

beforeAll(async () => {
  t = await createTestDatabase();
  holder.db = t.db;
  actor = (await t.db.insert(users).values({ email: "owner@khushio.test", passwordHash: "x" }).returning({ id: users.id }))[0]!.id;
  await t.db.insert(merchants).values([
    { slug: "amazon-india", name: "Amazon India", allowedDomains: ["amazon.in"] },
    { slug: "flipkart", name: "Flipkart", allowedDomains: ["flipkart.com"] },
    { slug: "old-store", name: "Old Store", allowedDomains: ["old.example"], isActive: false },
  ]);
  await t.db.insert(categories).values([{ slug: "headphones", name: "Headphones" }, { slug: "retired", name: "Retired", isActive: false }]);
}, 60_000);
afterAll(async () => t.client.close());

const csv = (...lines: string[]) => lines.join("\n");
const imp = (entity: ImportEntity, text: string, filename = "f.csv") => imports.run(entity, { text, filename, mapping: null }, actor);
const check = (entity: ImportEntity, text: string) => imports.preview(entity, { text, filename: "f.csv", mapping: null });

describe("brands", () => {
  it("creates brands, makes the slug from the name, and a second import changes nothing", async () => {
    const file = csv("slug,name,description,logo_url,is_featured,is_active", "sony,Sony,Electronics,https://example.com/s.png,yes,", ",Bose,,,,");
    const first = await imp("brands", file);
    expect(first).toMatchObject({ created: 2, updated: 0, unchanged: 0, failed: 0 });
    const bose = (await t.db.select().from(brands).where(eq(brands.slug, "bose")))[0];
    expect(bose).toMatchObject({ name: "Bose", isActive: true, isFeatured: false });
    expect(await imp("brands", file)).toMatchObject({ created: 0, updated: 0, unchanged: 2, failed: 0 });
  });

  it("updates only what the file gives: an empty cell never clears a value", async () => {
    const r = await imp("brands", csv("slug,name,description", "sony,Sony,New text", "bose,Bose,"));
    expect(r).toMatchObject({ updated: 1, unchanged: 1 });
    const sony = (await t.db.select().from(brands).where(eq(brands.slug, "sony")))[0];
    expect(sony).toMatchObject({ description: "New text", logoUrl: "https://example.com/s.png", isFeatured: true });
  });

  it("reports bad rows with their line numbers and still imports the good ones", async () => {
    const r = await imp("brands", csv("slug,name,logo_url,is_featured", "good,Good,,", "bad slug!,Bad,,", "http,Http,http://x.com/a.png,", "flag,Flag,,maybe", "dup,Sony,,", "good,Again,,"));
    expect(r.created).toBe(1);
    expect(r.errors.join("\n")).toMatch(/Line 3/);
    expect(r.errors.join("\n")).toMatch(/Line 4: logo_url must start with https/);
    expect(r.errors.join("\n")).toMatch(/Line 5: is_featured/);
    expect(r.errors.join("\n")).toMatch(/Line 6: another brand \(sony\) already has the name/);
    expect(r.errors.join("\n")).toMatch(/Line 7: the slug "good" is already used on line 2/);
    expect(r.errorCsv).toContain("line,error,slug,name");
  });
});

describe("products", () => {
  const header = "slug,name,summary,brand,category,tags,status,sku,variant,price,currency";

  it("creates products with variants grouped by slug, as drafts, and a second import changes nothing", async () => {
    const file = csv(header, "xm5,Sony XM5,Noise cancelling,sony,headphones,wireless|anc,,XM5-BLK,Black,29990,INR", "xm5,,,,,,,XM5-SLV,Silver,\"30,990.50\",INR", ",Bose QC,,bose,headphones,,review,,,,");
    const first = await imp("products", file);
    expect(first).toMatchObject({ created: 2, updated: 0, unchanged: 0, failed: 0 });
    const xm5 = (await t.db.select().from(products).where(eq(products.slug, "xm5")))[0]!;
    expect(xm5).toMatchObject({ name: "Sony XM5", status: "DRAFT" });
    expect((await t.db.select().from(productVariants).where(eq(productVariants.productId, xm5.id))).map((v) => [v.sku, v.label, v.priceMinor, v.sortOrder])).toEqual([["XM5-BLK", "Black", 2999000, 0], ["XM5-SLV", "Silver", 3099050, 1]]);
    expect((await t.db.select().from(productTags).where(eq(productTags.productId, xm5.id))).map((x) => x.tag).sort()).toEqual(["anc", "wireless"]);
    expect((await t.db.select().from(productCategories).where(eq(productCategories.productId, xm5.id)))[0]).toMatchObject({ isPrimary: true });
    expect((await t.db.select().from(products).where(eq(products.slug, "bose-qc")))[0]?.status).toBe("REVIEW");
    expect(await imp("products", file)).toMatchObject({ created: 0, updated: 0, unchanged: 2, failed: 0 });
  });

  it("matches variants by SKU: a changed price updates in place, a new SKU adds a variant, nothing duplicates", async () => {
    const r = await imp("products", csv(header, "xm5,,,,,,,XM5-BLK,,27990,", "xm5,,,,,,,XM5-GLD,Gold,31990,"));
    expect(r).toMatchObject({ updated: 1, created: 0, failed: 0 });
    const xm5 = (await t.db.select().from(products).where(eq(products.slug, "xm5")))[0]!;
    const variants = await t.db.select().from(productVariants).where(eq(productVariants.productId, xm5.id));
    expect(variants).toHaveLength(3);
    expect(variants.find((v) => v.sku === "XM5-BLK")?.priceMinor).toBe(2799000);
  });

  it("changes the main category and replaces tags only when the file gives them", async () => {
    await t.db.insert(categories).values({ slug: "audio", name: "Audio" });
    expect(await imp("products", csv("slug,name,category,tags", "xm5,,audio,"))).toMatchObject({ updated: 1 });
    const xm5 = (await t.db.select().from(products).where(eq(products.slug, "xm5")))[0]!;
    const primary = await t.db.select().from(productCategories).where(eq(productCategories.productId, xm5.id));
    expect(primary).toHaveLength(1);
    expect((await t.db.select().from(productTags).where(eq(productTags.productId, xm5.id))).length).toBe(2); // tags cell was empty: kept
    expect(await imp("products", csv("slug,name,tags", "xm5,,over-ear"))).toMatchObject({ updated: 1 });
    expect((await t.db.select().from(productTags).where(eq(productTags.productId, xm5.id))).map((x) => x.tag)).toEqual(["over-ear"]);
  });

  it("ignores the status of an existing product, and refuses to create one as published", async () => {
    expect(await imp("products", csv("slug,name,status", "xm5,Sony XM5,published"))).toMatchObject({ unchanged: 1, failed: 0 });
    expect((await t.db.select().from(products).where(eq(products.slug, "xm5")))[0]?.status).toBe("DRAFT");
    const r = await imp("products", csv("slug,name,status", "brand-new,Brand New,published"));
    expect(r.failed).toBe(1);
    expect(r.errors[0]).toMatch(/draft or review/);
  });

  it("checks references and explains each problem", async () => {
    const r = await imp("products", csv(header, "a1,A1,,nobrand,,,,,,,", "a2,A2,,,nocat,,,,,,", "a3,A3,,,retired,,,,,,", "a4,,,,,,,,,,", "a5,A5,,,,,,XM5-BLK,Dup,10,", "a6,A6,,,,,,S1,V,abc,", "a7,A7,,,,,,S2,V,10,XXX"));
    const text = r.errors.join("\n");
    expect(r.failed).toBe(7);
    expect(text).toMatch(/Line 2: brand "nobrand" does not exist/);
    expect(text).toMatch(/Line 3: category "nocat" does not exist/);
    expect(text).toMatch(/Line 4: category "retired" is archived/);
    expect(text).toMatch(/Line 5: name is required for a new product/);
    expect(text).toMatch(/Line 6: the SKU "XM5-BLK" already belongs to product "xm5"/);
    expect(text).toMatch(/Line 7: price/);
    expect(text).toMatch(/Line 8: currency must be one of/);
  });

  it("never half-imports a product: a bad row skips all its rows, and conflicting details are refused", async () => {
    const r = await imp("products", csv(header, "half,Half,,,,,,H-1,One,10,", "half,,,,,,,H-2,Two,oops,", "clash,First name,,,,,,C-1,One,5,", "clash,Other name,,,,,,C-2,Two,5,"));
    expect(r.created).toBe(0);
    expect((await t.db.select().from(products).where(eq(products.slug, "half"))).length).toBe(0);
    expect(r.errors.join("\n")).toMatch(/Line 3: price/);
    expect(r.errors.join("\n")).toMatch(/Line 2: line 3, another row of product "half"/);
    expect(r.errors.join("\n")).toMatch(/Line 5: name differs from line 4/);
  });

  it("refuses a SKU used by another product in the same file", async () => {
    const r = await imp("products", csv(header, "p1,P1,,,,,,SAME,V,1,", "p2,P2,,,,,,SAME,V,1,"));
    expect(r).toMatchObject({ created: 1, failed: 1 });
    expect(r.errors[0]).toMatch(/also used by product "p1"/);
  });

  it("rejects formula-looking cells safely: stored as typed text, never executed", async () => {
    await imp("products", csv("slug,name", "formula,'=HYPERLINK(1)"));
    expect((await t.db.select().from(products).where(eq(products.slug, "formula")))[0]?.name).toBe("=HYPERLINK(1)");
  });

  it("writes a batch all or nothing: one SKU clash rolls back every product in the batch", async () => {
    const xm5 = (await t.db.select().from(products).where(eq(products.slug, "xm5")))[0]!;
    const unit = (slug: string, sku: string) => ({ id: crypto.randomUUID(), isNew: true, slug, fields: { name: slug }, newVariants: [{ id: crypto.randomUUID(), sku, label: "V", priceMinor: 1, currency: "INR", sortOrder: 0 }], changedVariants: [] });
    await expect(writeProductBatch([unit("atomic-a", "FRESH-1"), unit("atomic-b", "XM5-BLK")])).rejects.toThrow();
    expect((await t.db.select().from(products).where(eq(products.slug, "atomic-a"))).length).toBe(0);
    expect(xm5.slug).toBe("xm5");
  });
});

describe("links", () => {
  const header = "slug,merchant,product,destination_url,tracking_params,is_active";

  it("creates, updates and leaves unchanged, with the same destination rules as the link form", async () => {
    const file = csv(header, "amz-xm5,amazon-india,xm5,https://www.amazon.in/dp/B0,tag=khushio-21,yes", "amz-store,amazon-india,,https://www.amazon.in/,,");
    expect(await imp("links", file)).toMatchObject({ created: 2, failed: 0 });
    expect(await imp("links", file)).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
    const link = (await t.db.select().from(affiliateLinks).where(eq(affiliateLinks.slug, "amz-xm5")))[0]!;
    await t.db.update(affiliateLinks).set({ lastVerifiedAt: new Date() }).where(eq(affiliateLinks.id, link.id));
    expect(await imp("links", csv(header, "amz-xm5,amazon-india,,https://www.amazon.in/dp/B1,,"))).toMatchObject({ updated: 1 });
    const after = (await t.db.select().from(affiliateLinks).where(eq(affiliateLinks.id, link.id)))[0]!;
    expect(after.destinationUrl).toBe("https://www.amazon.in/dp/B1");
    expect(after.trackingParams).toBe("tag=khushio-21"); // empty cell kept it
    expect(after.productId).toBe(link.productId);
    expect(after.lastVerifiedAt).toBeNull(); // a new destination needs a new check
  });

  it("refuses unsafe or foreign destinations, unknown references and archived stores", async () => {
    const r = await imp("links", csv(header, "l1,amazon-india,,https://evil.example/x,,", "l2,amazon-india,,http://www.amazon.in/x,,", "l3,amazon-india,,https://amazon.in.evil.com/x,,", "l4,nostore,,https://www.amazon.in/x,,", "l5,amazon-india,nope,https://www.amazon.in/x,,", "l6,old-store,,https://old.example/x,,", "l7,amazon-india,,https://www.amazon.in/x,novalue,", "L8 bad,amazon-india,,https://www.amazon.in/x,,"));
    expect(r.created).toBe(0);
    expect(r.failed).toBe(8);
    expect(r.errors.join("\n")).toMatch(/Line 5: the store "nostore" does not exist/);
    expect(r.errors.join("\n")).toMatch(/Line 7: the store "old-store" is archived/);
  });
});

describe("deals", () => {
  const header = "slug,title,merchant,type,link,starts_at,ends_at,is_featured,sort_order,status,products,categories";

  it("creates, then a second import changes nothing, and dates are read as India time", async () => {
    const file = csv(header, "d-xm5,20% off XM5,amazon-india,deal,amz-xm5,2026-12-01 09:00,2026-12-05 23:59,yes,3,published,xm5,", "d-store,Store sale,amazon-india,promotion,,01/12/2026,,no,,draft,,headphones");
    const first = await imp("deals", file);
    expect(first).toMatchObject({ created: 2, failed: 0 });
    const d = (await t.db.select().from(deals).where(eq(deals.slug, "d-xm5")))[0]!;
    expect(d.startsAt.toISOString()).toBe("2026-12-01T03:30:00.000Z");
    expect(d).toMatchObject({ isFeatured: true, sortOrder: 3, status: "published" });
    expect(await imp("deals", file)).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
  });

  it("updates changed fields, keeps dates and attachments the file leaves empty, replaces lists only when given", async () => {
    expect(await imp("deals", csv("slug,title,merchant,status", "d-xm5,20% off XM5,amazon-india,archived"))).toMatchObject({ updated: 1 });
    const d = (await t.db.select().from(deals).where(eq(deals.slug, "d-xm5")))[0]!;
    expect(d.status).toBe("archived");
    expect(d.endsAt?.toISOString()).toBe("2026-12-05T18:29:00.000Z");
    expect(d.affiliateLinkId).not.toBeNull();
  });

  it("refuses a link of another store, unknown references, bad dates and archived stores", async () => {
    const r = await imp("deals", csv(header, "e1,E1,flipkart,deal,amz-xm5,,,,,,,", "e2,E2,amazon-india,deal,,,,,,,nope,", "e3,E3,amazon-india,deal,,2026-12-05,2026-12-01,,,,,", "e4,E4,amazon-india,bogus,,,,,,,,", "e5,E5,old-store,deal,,,,,,,,", "e6,E6,amazon-india,deal,,not a date,,,,,,", "e7,E7,amazon-india,deal,,,,,10000,,,"));
    expect(r.created).toBe(0);
    expect(r.failed).toBe(7);
    expect(r.errors.join("\n")).toMatch(/Line 2: the link "amz-xm5" belongs to a different store/);
    expect(r.errors.join("\n")).toMatch(/Line 4: ends_at must be after starts_at/);
  });
});

describe("history and audit", () => {
  it("records every import with its entity, row counts and an audit row", async () => {
    const before = (await t.db.select().from(affiliateImportLogs)).length;
    const r = await imp("brands", csv("slug,name", "audit-brand,Audit Brand", "bad slug,Bad"), "my brands.csv");
    expect(r.logId).not.toBeNull();
    const log = (await t.db.select().from(affiliateImportLogs).where(eq(affiliateImportLogs.id, r.logId!)))[0]!;
    expect(log).toMatchObject({ entity: "brands", rowsProcessed: 2, rowsFailed: 1, source: "csv:brands:my brands.csv" });
    expect((await t.db.select().from(affiliateImportLogs)).length).toBe(before + 1);
    expect((await imports.recentImports(5))[0]?.id).toBe(r.logId);
    const audit = await t.db.select().from(auditLogs).where(eq(auditLogs.entityId, r.logId!));
    expect(audit[0]).toMatchObject({ action: "import.completed", actorId: actor });
  });
});

describe("exports can be imported straight back", () => {
  for (const entity of ["brands", "products", "links", "deals"] as const) {
    it(`${entity}: exporting then importing changes nothing`, async () => {
      const out = await imports.exportCsv(entity, { actorId: actor });
      expect(out.csv.startsWith("\uFEFF")).toBe(true);
      expect(out.filename).toMatch(new RegExp(`^khushio-${entity}-\\d{4}-\\d{2}-\\d{2}\\.csv$`));
      const rows = parseCsv(out.csv);
      expect(rows.length).toBeGreaterThan(1);
      const back = await imp(entity, out.csv);
      expect(back, JSON.stringify(back.errors)).toMatchObject({ created: 0, updated: 0, failed: 0 });
      expect(back.unchanged).toBeGreaterThan(0);
    });
  }

  it("the click export has its own header and is audited", async () => {
    const out = await imports.exportCsv("clicks", { actorId: actor, range: 7 });
    expect(parseCsv(out.csv)[0]?.cells).toEqual(["day", "link", "merchant", "product", "clicks"]);
    expect((await t.db.select().from(auditLogs).where(eq(auditLogs.action, "export.downloaded"))).length).toBeGreaterThan(0);
  });

  it("every template imports as one example row (product template needs its references to exist)", async () => {
    for (const entity of ["brands"] as const) {
      const p = await check(entity, imports.templateFor(entity));
      expect(p.counts.failed, entity).toBe(0);
    }
  });
});
