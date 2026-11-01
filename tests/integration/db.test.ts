/**
 * Database integration tests. They run only when TEST_DATABASE_URL points at a throw-away Postgres database whose
 * name ends in _test (the schema is DROPPED and rebuilt). Example:
 *   TEST_DATABASE_URL=postgres://user:pw@localhost:5432/khushio_test npm test
 * Note: Neon's HTTP driver runs db.batch() as one transaction; here a small shim emulates that with BEGIN/COMMIT.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/db", async () => {
  const actual = await vi.importActual<typeof import("../../lib/db")>("../../lib/db");
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return { ...actual, __pool: null };
  const { Pool } = await import("pg"); const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema: actual.schema });
  Object.assign(db, { batch: async (stmts: PromiseLike<unknown>[]) => { await pool.query("BEGIN"); try { const out: unknown[] = []; for (const s of stmts) out.push(await s); await pool.query("COMMIT"); return out; } catch (e) { await pool.query("ROLLBACK"); throw e; } } });
  return { ...actual, db, __pool: pool };
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error("REDIRECT:" + to); }, permanentRedirect: (to: string) => { throw new Error("PERM:" + to); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("../../lib/auth", () => ({ isAdmin: async () => true, requireAdmin: async () => {}, checkLogin: () => false, endSession: async () => {}, startSession: async () => {} }));
vi.mock("../../lib/audit", () => ({ audit: async () => {} }));

import * as actions from "../../app/admin/actions";
import { GET as exportCsv } from "../../app/admin/export/[kind]/route";
import { loadCoupons, loadDealBySlug, loadDeals, loadMerchantName, loadProduct, loadProductSlugs, loadProducts, loadProductsBySlugs, loadStoreSlugs, resolveOffer, searchProducts } from "../../lib/data/catalog";
import { GET as cronGet } from "../../app/api/maintenance/route";
import sitemap from "../../app/sitemap";
import { loadComparison, loadComparisons } from "../../lib/data/comparisons";
import { listArticles, loadArticle, loadArticleForPreview, loadArticlesForProduct, loadJournalCategories, loadJournalSlugs, loadRelatedArticles } from "../../lib/data/journal";
import { listMedia, mediaStats, mediaUsage } from "../../lib/data/media";
import { loadOccasion, loadOccasions } from "../../lib/data/occasions";
import { loadHomeSections } from "../../lib/home/data";
import { DEFAULT_LAYOUT, visibility } from "../../lib/home/sections";
import { dbUsage, runMaintenance } from "../../lib/maintenance";
import { getNav } from "../../lib/nav";
import { loadPage, loadPageSlugs } from "../../lib/pages";
import { getSettings } from "../../lib/settings";
import { SETTING_DEFAULTS } from "../../lib/settings-schema";
import { validateProductRows } from "../../lib/import";
import { followRedirect } from "../../lib/redirects-db";
import * as dbmod from "../../lib/db";
import { buildImportPlan } from "../../lib/import-db";

const url = process.env.TEST_DATABASE_URL;
const enabled = !!url && /_test(\?|$)/.test(url);
const root = join(__dirname, "../..");
const pool = (dbmod as unknown as { __pool: import("pg").Pool }).__pool;
const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows as T[];
const sqlFiles = () => readdirSync(join(root, "db/migrations")).sort().map((f) => readFileSync(join(root, "db/migrations", f), "utf8"));
const reset = async () => { await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); };
const migrate = async () => { for (const s of sqlFiles()) await pool.query(s); };
const columns = async () => (await q<{ c: string }>("select table_name||'.'||column_name||':'||data_type||':'||is_nullable as c from information_schema.columns where table_schema='public' order by 1")).map((r) => r.c);
const form = (o: Record<string, string | File>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const redirected = async (fn: () => Promise<unknown>) => { try { await fn(); return ""; } catch (e) { const m = (e as Error).message; if (!m.startsWith("REDIRECT:")) throw e; return m.slice(9); } };
const insertProduct = async (slug: string, status = "published") => (await q<{ id: string }>("insert into products (slug,name,category,price,status) values ($1,$1,'home-living',500,$2) returning id", [slug, status]))[0].id;
const insertOffer = async (pid: string, merchant: string, mid: string | null, urlv: string, extra = "") => (await q<{ id: string }>(`insert into offers (product_id,merchant,merchant_id,url${extra ? "," + extra.split("=")[0] : ""}) values ($1,$2,$3,$4${extra ? "," + extra.split("=")[1] : ""}) returning id`, [pid, merchant, mid, urlv]))[0].id;

describe.skipIf(!enabled)("database (real Postgres)", () => {
  beforeAll(async () => { await reset(); await migrate(); });

  describe("migrations", () => {
    it("apply in order and can be re-run without error", async () => { await migrate(); expect((await q("select to_regclass('public.import_staging') as t"))[0]).toEqual({ t: "import_staging" }); });
    it("db/schema.sql builds exactly the same columns as the migrations", async () => {
      const fromMigrations = await columns(); await reset(); await pool.query(readFileSync(join(root, "db/schema.sql"), "utf8"));
      const fromSchema = await columns(); await reset(); await migrate(); expect(fromSchema).toEqual(fromMigrations);
    });
    it("enforces unique slugs and foreign keys", async () => {
      await insertProduct("dup"); await expect(insertProduct("dup")).rejects.toMatchObject({ code: "23505" });
      await expect(insertOffer("00000000-0000-0000-0000-000000000000", "X", null, "https://x.example")).rejects.toMatchObject({ code: "23503" });
    });
    it("008 turns legacy text end dates into real expiry timestamps (end of day, India time)", async () => {
      await q("insert into deals (title,merchant,url,ends) values ('old','S','https://s.example','2026-01-01'),('free text','S','https://s.example','soon')");
      await pool.query(readFileSync(join(root, "db/migrations", readdirSync(join(root, "db/migrations")).find((f) => f.startsWith("008"))!), "utf8"));
      const r = await q<{ title: string; e: string | null }>("select title, to_char(expires_at,'YYYY-MM-DD\"T\"HH24:MI') as e from deals order by title");
      expect(r).toEqual([{ title: "free text", e: null }, { title: "old", e: "2026-01-01T18:29" }]);
    });
  });

  describe("what visitors can see and follow", () => {
    let ids: Record<string, string> = {};
    beforeAll(async () => {
      await reset(); await migrate();
      const m = (await q<{ id: string }>("insert into merchants (slug,name,website,approved_domains) values ('azshop','AzShop','https://www.azshop.in','amzn.to') returning id"))[0].id;
      const off = (await q<{ id: string }>("insert into merchants (slug,name,is_active) values ('offshop','OffShop',false) returning id"))[0].id;
      const live = await insertProduct("live"), draft = await insertProduct("draft", "draft"), arch = await insertProduct("arch", "archived"), offp = await insertProduct("offp");
      ids = {
        active: await insertOffer(live, "AzShop", m, "https://amzn.to/a"), inactive: await insertOffer(live, "AzShop", m, "https://amzn.to/b", "is_active=false"),
        expired: await insertOffer(live, "AzShop", m, "https://amzn.to/c", "expires_at='2020-01-01'"), future: await insertOffer(live, "AzShop", m, "https://amzn.to/d", "expires_at='2099-01-01'"),
        ofDraft: await insertOffer(draft, "AzShop", m, "https://amzn.to/e"), ofArchived: await insertOffer(arch, "AzShop", m, "https://amzn.to/f"), ofInactiveMerchant: await insertOffer(offp, "OffShop", off, "https://off.example/g"),
      };
      await q("insert into deals (title,merchant,url,expires_at) values ('live deal','AzShop','https://amzn.to/x',null),('expired deal','AzShop','https://amzn.to/y','2020-01-01')");
      await q("insert into deals (title,merchant,url,is_active) values ('switched off','AzShop','https://amzn.to/z',false)");
      await q("insert into coupons (code,merchant,detail,url,expires_at,verified_at) values ('GOOD','AzShop','','https://amzn.to/c1',null,now()),('OLD','AzShop','','https://amzn.to/c2','2020-01-01',null)");
    });
    it("only active, unexpired offers of published products with active merchants resolve", async () => {
      expect(await resolveOffer(ids.active)).toMatchObject({ url: "https://amzn.to/a", approvedDomains: ["amzn.to", "azshop.in"] });
      expect(await resolveOffer(ids.future)).toBeDefined();
      for (const k of ["inactive", "expired", "ofDraft", "ofArchived", "ofInactiveMerchant"]) expect(await resolveOffer(ids[k]), k).toBeUndefined();
      expect(await resolveOffer("not-a-uuid")).toBeUndefined(); expect(await resolveOffer("00000000-0000-0000-0000-000000000000")).toBeUndefined();
    });
    it("the catalogue lists only published products and only their live offers", async () => {
      const p = await loadProducts(); expect(p.map((x) => x.slug)).toEqual(["live", "offp"]);
      expect(p.find((x) => x.slug === "live")!.offers.map((o) => o.url).sort()).toEqual(["https://amzn.to/a", "https://amzn.to/d"]); expect(p.find((x) => x.slug === "offp")!.offers).toEqual([]);
    });
    it("expired and switched-off deals and coupons disappear; the rest stay", async () => {
      expect((await loadDeals()).map((d) => d.title)).toEqual(["live deal"]); expect((await loadCoupons()).map((c) => c.code)).toEqual(["GOOD"]);
      expect(typeof (await loadCoupons())[0].verifiedAt).toBe("string");
    });
    it("a deal follows its merchant's approved domains", async () => {
      const id = (await loadDeals())[0].offerId; expect(await resolveOffer(id)).toMatchObject({ merchant: "AzShop", approvedDomains: ["amzn.to", "azshop.in"] });
    });
  });

  describe("admin actions", () => {
    beforeAll(async () => { await reset(); await migrate(); });
    it("creates a product and its first offer together", async () => {
      const to = await redirected(() => actions.createProduct(form({ name: "Basket", price: "899", mrp: "1299", category: "home-living", merchant: "Shop A", url: "https://a.example/b" })));
      const id = to.split("/").pop()!; expect((await q("select * from offers where product_id=$1", [id]))).toHaveLength(1); expect((await q("select slug, status from products where id=$1", [id]))[0]).toEqual({ slug: "basket", status: "published" });
    });
    it("rejects invalid products and creates nothing", async () => {
      expect(await redirected(() => actions.createProduct(form({ name: "Bad", price: "100", mrp: "50", category: "home-living", merchant: "S", url: "https://a.example" })))).toContain("e=1");
      expect(await redirected(() => actions.createProduct(form({ name: "Bad2", price: "100", category: "nope", merchant: "S", url: "https://a.example" })))).toContain("e=1");
      expect(await q("select 1 from products where slug in ('bad','bad2')")).toHaveLength(0);
    });
    it("editing a product leaves every one of its offers untouched, and offers are edited one at a time", async () => {
      const pid = (await q<{ id: string }>("select id from products where slug='basket'"))[0].id;
      await redirected(() => actions.saveOffer(form({ product_id: pid, merchant: "Shop B", url: "https://b.example/b", active: "on" })));
      expect(await q("select merchant, url from offers where product_id=$1 order by merchant", [pid])).toEqual([{ merchant: "Shop A", url: "https://a.example/b" }, { merchant: "Shop B", url: "https://b.example/b" }]);
      await redirected(() => actions.updateProduct(form({ id: pid, name: "Basket v2", slug: "basket", category: "home-living", price: "850", status: "published" })));
      expect(await q("select merchant, url from offers where product_id=$1 order by merchant", [pid])).toEqual([{ merchant: "Shop A", url: "https://a.example/b" }, { merchant: "Shop B", url: "https://b.example/b" }]);
      expect((await q("select name, price from products where id=$1", [pid]))[0]).toEqual({ name: "Basket v2", price: 850 });
      const a = (await q<{ id: string }>("select id from offers where merchant='Shop A'"))[0].id;
      await redirected(() => actions.saveOffer(form({ product_id: pid, id: a, merchant: "Shop A", url: "https://a.example/changed", active: "on", verified: "on" })));
      const rows = await q<{ merchant: string; url: string; v: boolean }>("select merchant, url, last_verified_at is not null as v from offers where product_id=$1 order by merchant", [pid]);
      expect(rows).toEqual([{ merchant: "Shop A", url: "https://a.example/changed", v: true }, { merchant: "Shop B", url: "https://b.example/b", v: false }]);
    });
    it("refuses an offer link outside the merchant's approved domains", async () => {
      const pid = (await q<{ id: string }>("select id from products where slug='basket'"))[0].id;
      const mid = (await q<{ id: string }>("select id from merchants where slug='shop-a'"))[0].id;
      await redirected(() => actions.saveMerchant(form({ id: mid, name: "Shop A", website: "", approved_domains: "a.example", active: "on" })));
      expect(await redirected(() => actions.saveOffer(form({ product_id: pid, merchant: "Shop A", url: "https://evil.example/x", active: "on" })))).toContain("o=2");
      expect(await q("select 1 from offers where url='https://evil.example/x'")).toHaveLength(0);
    });
    it("archives instead of deleting, and an archived product leaves the public catalogue", async () => {
      const pid = (await q<{ id: string }>("select id from products where slug='basket'"))[0].id;
      await redirected(() => actions.bulkProducts(form({ ids: pid, intent: "archive" })));
      expect((await q("select status from products where id=$1", [pid]))[0]).toEqual({ status: "archived" }); expect((await loadProducts()).map((p) => p.slug)).not.toContain("basket");
      expect(await q("select 1 from offers where product_id=$1", [pid])).toHaveLength(2);
      await redirected(() => actions.bulkProducts(form({ ids: pid, intent: "restore" }))); expect((await q("select status from products where id=$1", [pid]))[0]).toEqual({ status: "draft" });
    });
    it("rejects an invalid deal end date and stores a valid one as end of day IST", async () => {
      expect(await redirected(() => actions.createDeal(form({ title: "D", merchant: "S", url: "https://s.example", ends: "31/12/2026" })))).toContain("e=1");
      await redirected(() => actions.createDeal(form({ title: "D2", merchant: "S", url: "https://s.example", ends: "2026-12-31" })));
      expect((await q<{ e: string }>("select to_char(expires_at,'YYYY-MM-DD\"T\"HH24:MI') as e from deals where title='D2'"))[0].e).toBe("2026-12-31T18:29");
    });
    it("saves a collection and its products together, and replaces them on re-save", async () => {
      const p1 = (await q<{ id: string }>("select id from products where slug='basket'"))[0].id, p2 = await insertProduct("second");
      await redirected(() => actions.saveCollection(Object.assign(form({ title: "Picks", description: "d" }), {}))); // no products
      const cid = (await q<{ id: string }>("select id from collections where slug='picks'"))[0].id;
      const withProducts = form({ id: cid, title: "Picks" }); withProducts.append("products", p1); withProducts.append("products", p2);
      await redirected(() => actions.saveCollection(withProducts)); expect(await q("select 1 from collection_products where collection_id=$1", [cid])).toHaveLength(2);
      const one = form({ id: cid, title: "Picks" }); one.append("products", p2);
      await redirected(() => actions.saveCollection(one)); expect((await q("select product_id from collection_products where collection_id=$1", [cid]))).toEqual([{ product_id: p2 }]);
    });
  });

  describe("CSV import: preview, then confirm", () => {
    beforeAll(async () => { await reset(); await migrate(); await insertProduct("old"); await q("update products set name='Old name', price=111 where slug='old'"); });
    const csv = "name,slug,price,category,url,merchant\nBrand New,,299,home-living,https://shop.example/n,Shop\nOld name changed,old,222,home-living,https://shop.example/o,Shop\nBroken,,0,home-living,https://shop.example/x,Shop\n";
    const stage = async (text = csv) => (await redirected(() => actions.previewImport(form({ file: new File([text], "p.csv", { type: "text/csv" }) })))).split("stage=")[1];
    it("a preview writes nothing to the catalogue", async () => {
      const s = await stage(); expect((await q("select count(*)::int as n from products"))[0]).toEqual({ n: 1 }); expect((await q("select count(*)::int as n from import_staging"))[0]).toEqual({ n: 1 });
      const plan = await buildImportPlan("products", (await q<{ csv: string }>("select csv from import_staging where id=$1", [s]))[0].csv, false);
      expect(plan.items.map((i) => [i.key, i.action])).toEqual([["brand-new", "create"], ["old", "skip-existing"]]); expect(plan.errors).toEqual([{ line: 4, reason: expect.stringContaining("price") }]);
      await redirected(() => actions.cancelImport(form({ stage: s }))); expect((await q("select count(*)::int as n from import_staging"))[0]).toEqual({ n: 0 });
    });
    it("confirm creates new products but does NOT overwrite existing ones unless asked", async () => {
      const s = await stage(); const to = await redirected(() => actions.confirmImport(form({ stage: s })));
      expect(to).toContain("created=1"); expect(to).toContain("updated=0");
      expect((await q("select slug, name, price from products order by slug"))).toEqual([{ slug: "brand-new", name: "Brand New", price: 299 }, { slug: "old", name: "Old name", price: 111 }]);
      expect(await q("select 1 from import_staging")).toHaveLength(0);
    });
    it("updates existing products only when the box is ticked, and keeps one offer per merchant", async () => {
      const s = await stage(); const to = await redirected(() => actions.confirmImport(form({ stage: s, update: "on" })));
      expect(to).toContain("created=0"); expect(to).toContain("updated=2");
      expect((await q("select slug, price from products order by slug"))).toEqual([{ slug: "brand-new", price: 299 }, { slug: "old", price: 222 }]);
      expect((await q("select count(*)::int as n from offers"))[0]).toEqual({ n: 2 });
    });
    it("blocks rows whose link is not allowed for an existing merchant, and an expired staging id does nothing", async () => {
      await q("update merchants set approved_domains='shop.example' where slug='shop'");
      const s = await stage("name,price,category,url,merchant\nSneaky,10,home-living,https://evil.example/p,Shop\n");
      expect(await redirected(() => actions.confirmImport(form({ stage: s })))).toContain("e=3"); expect(await q("select 1 from products where slug='sneaky'")).toHaveLength(0);
      expect(await redirected(() => actions.confirmImport(form({ stage: "00000000-0000-0000-0000-000000000000" })))).toContain("e=2");
    });
  });
});

// =====================================================================================================================
// Phase 1: offer prices, search, redirects, foreign keys, duplicates, import kinds, export
// =====================================================================================================================
describe.skipIf(!enabled)("Phase 1 (real Postgres)", () => {
  const ins = async (slug: string, o: { name?: string; brand?: string; category?: string; price?: number; mrp?: number | null; status?: string; featured?: boolean } = {}) =>
    (await q<{ id: string }>("insert into products (slug,name,brand,category,price,mrp,status,featured) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id", [slug, o.name ?? slug, o.brand ?? "", o.category ?? "home-living", o.price ?? 1000, o.mrp ?? null, o.status ?? "published", o.featured ?? false]))[0].id;
  const off = async (pid: string, merchant: string, url: string, extra: Record<string, unknown> = {}) => {
    const slug = merchant.toLowerCase(); await q("insert into merchants (slug,name) values ($1,$2) on conflict (slug) do nothing", [slug, merchant]);
    const mid = (await q<{ id: string }>("select id from merchants where slug=$1", [slug]))[0].id;
    const cols = ["product_id", "merchant", "merchant_id", "url", ...Object.keys(extra)], vals = [pid, merchant, mid, url, ...Object.values(extra)];
    return (await q<{ id: string }>(`insert into offers (${cols.join(",")}) values (${vals.map((_, i) => `$${i + 1}`).join(",")}) returning id`, vals))[0].id;
  };

  describe("migration 009 backfill", () => {
    it("copies reference prices to offers and fills brand and category foreign keys, without touching existing offer prices", async () => {
      await reset(); await migrate();
      await q("insert into brands (slug,name) values ('greenleaf','Green Leaf') on conflict do nothing");
      const p = await ins("bf", { brand: "greenleaf", price: 500, mrp: 700 }), o1 = await off(p, "Shop", "https://s.example/1"), o2 = await off(p, "Other", "https://o.example/1");
      await q("update products set brand_id = null, category_id = null"); await q("update offers set price = null, mrp = null"); await q("update offers set price = 450 where id = $1", [o2]);
      await pool.query(readFileSync(join(root, "db/migrations", readdirSync(join(root, "db/migrations")).find((f) => f.startsWith("009"))!), "utf8"));
      expect((await q("select (brand_id is not null) as b, (category_id is not null) as c from products where id=$1", [p]))[0]).toEqual({ b: true, c: true });
      expect(await q("select id, price, mrp, price_checked_at from offers where product_id=$1 order by price", [p])).toEqual([{ id: o2, price: 450, mrp: null, price_checked_at: null }, { id: o1, price: 500, mrp: 700, price_checked_at: null }]);
    });
    it("builds a working full-text search column", async () => {
      expect((await q("select slug from products where search @@ to_tsquery('simple', 'bf:*')")).length).toBe(1);
      expect((await q("select to_tsvector('simple','कुर्ता cotton') @@ to_tsquery('simple','कुर्:*') as m"))[0]).toEqual({ m: true });
    });
  });

  describe("search, prices and pagination", () => {
    beforeAll(async () => {
      await reset(); await migrate();
      await q("insert into brands (slug,name) values ('greenleaf','Green Leaf'),('steelco','SteelCo') on conflict do nothing");
      await redirected(() => actions.saveCategory(form({ label: "Kitchen", slug: "kitchen", icon: "Sparkles", tone: "sand", parent: "home-living" })));
      const basket = await ins("jute-basket", { name: "Jute storage basket", brand: "greenleaf", price: 900, mrp: 1200, featured: true });
      await off(basket, "M1", "https://m1.example/a", { price: 800, mrp: 1000 }); await off(basket, "M3", "https://m3.example/b", { price: 700, expires_at: "2020-01-01" }); await off(basket, "M4", "https://m4.example/c", { price: 650, is_active: false });
      const bottle = await ins("steel-bottle", { name: "Steel water bottle", brand: "steelco", category: "kitchen", price: 500 }); await off(bottle, "M2", "https://m2.example/a", { price: 450 });
      const rug = await ins("jute-rug", { name: "Jute rug", brand: "greenleaf", price: 3000 }); await off(rug, "M1", "https://m1.example/rug");
      await ins("jute-draft", { status: "draft" }); await ins("jute-archived", { status: "archived" });
      for (let i = 1; i <= 30; i++) await ins(`filler-${String(i).padStart(2, "0")}`, { name: `Filler ${i}`, category: "kitchen", price: 100 + i });
    });
    it("matches words and word prefixes, requires every word, and never returns drafts or archived products", async () => {
      const slugs = async (q: string) => (await searchProducts({ q })).items.map((p) => p.slug).sort();
      expect(await slugs("jute")).toEqual(["jute-basket", "jute-rug"]); expect(await slugs("jut")).toEqual(["jute-basket", "jute-rug"]);
      expect(await slugs("jute storage")).toEqual(["jute-basket"]); expect(await slugs("green leaf")).toEqual([]); expect(await slugs("greenleaf")).toEqual(["jute-basket", "jute-rug"]);
      expect(await slugs("nothing like this")).toEqual([]);
    });
    it("is safe against injection-style input", async () => {
      for (const q of ["'; drop table products; --", "a | b & !c", "\\", "%%", "( ) : * <->"]) { const r = await searchProducts({ q }); expect(r.total).toBeGreaterThanOrEqual(0); }
      expect((await q("select count(*)::int as n from products"))[0].n).toBe(35);
    });
    it("filters by brand, merchant, and category including sub-categories", async () => {
      expect((await searchProducts({ brand: "steelco" })).items.map((p) => p.slug)).toEqual(["steel-bottle"]);
      expect((await searchProducts({ merchant: "m1" })).items.map((p) => p.slug).sort()).toEqual(["jute-basket", "jute-rug"]);
      expect((await searchProducts({ merchant: "m3" })).total).toBe(0);
      expect((await searchProducts({ cat: "kitchen" })).total).toBe(31); expect((await searchProducts({ cat: "home-living" })).total).toBe(33);
    });
    it("filters and sorts by the cheapest LIVE retailer price, ignoring expired and inactive offers", async () => {
      expect((await searchProducts({ max: 700, q: "jute" })).total).toBe(0);
      expect((await searchProducts({ max: 500, q: "bottle" })).items.map((p) => p.slug)).toEqual(["steel-bottle"]);
      expect((await searchProducts({ min: 2500 })).items.map((p) => p.slug)).toEqual(["jute-rug"]);
      const asc = (await searchProducts({ sort: "price-asc", pageSize: 48 })).items.map((p) => p.price); expect(asc).toEqual([...asc].sort((a, b) => a - b));
      const desc = (await searchProducts({ sort: "price-desc", pageSize: 3 })).items.map((p) => p.slug); expect(desc[0]).toBe("jute-rug");
    });
    it("sorts by saving and puts featured products first by default", async () => {
      expect((await searchProducts({ sort: "saving", pageSize: 1 })).items[0].slug).toBe("jute-basket");
      expect((await searchProducts({})).items[0].slug).toBe("jute-basket");
    });
    it("paginates with correct totals, clamps out-of-range pages and never repeats a product", async () => {
      const p1 = await searchProducts({ page: 1 }), p2 = await searchProducts({ page: 2 }), p3 = await searchProducts({ page: 3 }), far = await searchProducts({ page: 99 });
      expect([p1.total, p1.pages, p1.items.length, p3.items.length]).toEqual([33, 3, 12, 9]); expect(far.page).toBe(3);
      const all = [...p1.items, ...p2.items, ...p3.items].map((p) => p.slug); expect(new Set(all).size).toBe(33);
    });
    it("derives the displayed price from live offers and says when it is only a reference price", async () => {
      const b = (await loadProduct("jute-basket"))!;
      expect(b).toMatchObject({ price: 800, mrp: 1000, priceIsReference: false }); expect(b.offers.map((o) => o.merchant)).toEqual(["M1"]);
      const r = (await loadProduct("jute-rug"))!; expect(r).toMatchObject({ price: 3000, priceIsReference: true });
      expect(await loadProduct("jute-draft")).toBeUndefined(); expect(await loadProduct("nope")).toBeUndefined();
    });
    it("slug, store and bulk loaders respect publishing and keep the requested order", async () => {
      expect((await loadProductSlugs()).map((x) => x.slug)).not.toContain("jute-draft"); expect((await loadProductSlugs())[0].updatedAt).toEqual(expect.any(String));
      expect((await loadProductsBySlugs(["steel-bottle", "jute-draft", "jute-basket"])).map((p) => p.slug)).toEqual(["steel-bottle", "jute-basket"]);
      expect(await loadStoreSlugs()).toEqual(["m1", "m2"]); expect(await loadMerchantName("m2")).toBe("M2"); expect(await loadMerchantName("m3")).toBeUndefined();
    });
  });

  describe("redirects", () => {
    beforeAll(async () => { await reset(); await migrate(); });
    const rows = () => q("select from_path as f, to_path as t from redirects order by from_path");
    it("changing a product slug redirects the old address, and keeps every redirect single-hop across several renames", async () => {
      const to = await redirected(() => actions.createProduct(form({ name: "Red One", price: "100", category: "home-living", merchant: "S", url: "https://s.example/r" }))); const id = to.split("/").pop()!;
      const rename = (slug: string) => redirected(() => actions.updateProduct(form({ id, name: "Red", slug, category: "home-living", price: "100", status: "published" })));
      await rename("red-two"); expect(await rows()).toEqual([{ f: "/products/red-one", t: "/products/red-two" }]);
      await rename("red-three"); expect(await rows()).toEqual([{ f: "/products/red-one", t: "/products/red-three" }, { f: "/products/red-two", t: "/products/red-three" }]);
      await rename("red-one"); expect(await rows()).toEqual([{ f: "/products/red-three", t: "/products/red-one" }, { f: "/products/red-two", t: "/products/red-one" }]);
    });
    it("refuses a slug that another product uses", async () => {
      const other = (await q<{ id: string }>("select id from products limit 1"))[0].id; await ins("taken");
      expect(await redirected(() => actions.updateProduct(form({ id: other, name: "X", slug: "taken", category: "home-living", price: "10", status: "published" })))).toContain("e=6");
    });
    it("followRedirect sends visitors to the new page permanently, and ignores unknown paths", async () => {
      await expect(followRedirect("/products/red-two")).rejects.toThrow("PERM:/products/red-one"); await expect(followRedirect("/products/red-two/?utm=1")).rejects.toThrow("PERM:/products/red-one");
      await expect(followRedirect("/products/unknown")).resolves.toBeUndefined(); await expect(followRedirect("https://evil.example")).resolves.toBeUndefined();
    });
    it("the admin form refuses reserved and invalid paths and saves a valid one", async () => {
      expect(await redirected(() => actions.saveRedirect(form({ from: "/admin/x", to: "/y", status: "301" })))).toContain("e=reserved");
      expect(await redirected(() => actions.saveRedirect(form({ from: "https://evil.example", to: "/y", status: "301" })))).toContain("e=invalid");
      expect(await redirected(() => actions.saveRedirect(form({ from: "/old-sale", to: "/deals", status: "302", note: "campaign" })))).toContain("saved=1");
      await expect(followRedirect("/old-sale")).rejects.toThrow("REDIRECT:/deals");
    });
    it("a collection slug change leaves a redirect behind", async () => {
      await redirected(() => actions.saveCollection(form({ title: "Gifts" }))); const cid = (await q<{ id: string }>("select id from collections where slug='gifts'"))[0].id;
      await redirected(() => actions.saveCollection(form({ id: cid, title: "Gifts", slug: "gift-ideas" })));
      expect((await rows()).some((r) => r.f === "/collections/gifts" && r.t === "/collections/gift-ideas")).toBe(true);
    });
  });

  describe("foreign keys, category tree and duplicates", () => {
    beforeAll(async () => { await reset(); await migrate(); await q("insert into brands (slug,name) values ('greenleaf','Green Leaf') on conflict do nothing"); });
    const create = (o: Record<string, string>) => redirected(() => actions.createProduct(form({ price: "100", category: "home-living", merchant: "Shop", ...o })));
    it("links products to real brand and category rows, and refuses an unknown brand", async () => {
      expect(await create({ name: "Basket", url: "https://a.example/b", brand: "nope" })).toContain("e=7"); expect(await q("select 1 from products")).toHaveLength(0);
      await create({ name: "Basket", url: "https://a.example/b", brand: "greenleaf" });
      expect((await q("select (brand_id is not null) as b, (category_id is not null) as c from products"))[0]).toEqual({ b: true, c: true });
    });
    it("will not delete a brand or category that is still in use, or a category that has children", async () => {
      const bid = (await q<{ id: string }>("select id from brands where slug='greenleaf'"))[0].id; expect(await redirected(() => actions.deleteBrand(form({ id: bid })))).toContain("e=2");
      const cid = (await q<{ id: string }>("select id from categories where slug='home-living'"))[0].id; expect(await redirected(() => actions.deleteCategory(form({ id: cid })))).toContain("e=2");
      await redirected(() => actions.saveCategory(form({ label: "Kitchen", slug: "kitchen", icon: "Sparkles", tone: "sand", parent: "home-living" })));
      await q("update products set category = 'kitchen', category_id = (select id from categories where slug='kitchen')");
      expect(await redirected(() => actions.deleteCategory(form({ id: cid })))).toContain("e=3");
    });
    it("refuses a category loop, an unknown parent, and a category as its own parent", async () => {
      expect(await redirected(() => actions.saveCategory(form({ label: "Home", slug: "home-living", icon: "Sparkles", tone: "sand", parent: "kitchen" })))).toContain("e=5");
      expect(await redirected(() => actions.saveCategory(form({ label: "Home", slug: "home-living", icon: "Sparkles", tone: "sand", parent: "home-living" })))).toContain("e=5");
      expect(await redirected(() => actions.saveCategory(form({ label: "X", slug: "x", icon: "Sparkles", tone: "sand", parent: "ghost" })))).toContain("e=4");
    });
    it("warns about duplicates by name and by link, and only creates one when confirmed", async () => {
      const dupName = await create({ name: "BASKET", slug: "basket-2", url: "https://zzz.example/1" }); expect(dupName).toContain("e=5"); expect(dupName).toContain("dup=basket");
      const dupLink = await create({ name: "Totally different", url: "https://www.a.example/b/?utm=1" }); expect(dupLink).toContain("e=5");
      expect(await q("select 1 from products")).toHaveLength(1);
      expect(await create({ name: "BASKET", slug: "basket-2", url: "https://zzz.example/1", confirm_duplicate: "on" })).toContain("/admin/products/"); expect(await q("select 1 from products")).toHaveLength(2);
    });
    it("keeps the form values when it sends you back with an error", async () => { const to = await create({ name: "Kept name", url: "http://insecure.example" }); expect(to).toContain("e=1"); expect(to).toContain("name=Kept+name"); });
  });

  describe("import: every kind", () => {
    beforeAll(async () => { await reset(); await migrate(); });
    const up = async (kind: string, text: string) => (await redirected(() => actions.previewImport(form({ kind, file: new File([text], "x.csv", { type: "text/csv" }) })))).split("stage=")[1];
    const confirm = (stage: string, update = false) => redirected(() => actions.confirmImport(form({ stage, ...(update ? { update: "on" } : {}) })));
    it("merchants: creates, then skips existing, then updates only when asked", async () => {
      const csvText = "name,slug,website,approved_domains,active\nAmazon India,amazon,https://www.amazon.in,\"amazon.in, amzn.to\",\nFlipkart,flipkart,,flipkart.com,no\n";
      expect(await confirm(await up("merchants", csvText))).toContain("created=2");
      expect(await q("select slug, approved_domains, is_active from merchants order by slug")).toEqual([{ slug: "amazon", approved_domains: "amazon.in, amzn.to", is_active: true }, { slug: "flipkart", approved_domains: "flipkart.com", is_active: false }]);
      expect(await confirm(await up("merchants", csvText))).toContain("e=3");
      expect(await confirm(await up("merchants", csvText.replace(",flipkart.com,", ",\"flipkart.com, fkrt.it\",")), true)).toContain("updated=2");
      expect((await q("select approved_domains from merchants where slug='flipkart'"))[0]).toEqual({ approved_domains: "flipkart.com, fkrt.it" });
    });
    it("brands and articles", async () => {
      expect(await confirm(await up("brands", "name,about\nGreen Leaf,Eco\nSteelCo,\n"))).toContain("created=2");
      expect(await confirm(await up("articles", "title,body,date\nHello,\"Para one.\n\nPara two.\",2026-05-01\n"))).toContain("created=1");
      expect((await q("select slug, date, body from articles"))[0]).toMatchObject({ slug: "hello", date: "2026-05-01" });
    });
    it("categories: parents may appear after their children, and the tree is built correctly", async () => {
      const text = "label,slug,icon,tone,position,parent\nPhones,phones,Sparkles,sand,3,gadgets\nSmartphones,smartphones,Sparkles,sand,4,phones\nGadgets,gadgets,Sparkles,sand,2,\n";
      expect(await confirm(await up("categories", text))).toContain("created=3");
      expect(await q("select c.slug, p.slug as parent from categories c left join categories p on p.id = c.parent_id where c.slug in ('phones','smartphones','gadgets') order by c.slug")).toEqual([{ slug: "gadgets", parent: null }, { slug: "phones", parent: "gadgets" }, { slug: "smartphones", parent: "phones" }]);
      expect((await searchProducts({ cat: "gadgets" })).total).toBe(0);
    });
    it("products: brand and category links are set, unknown brands are rejected with a reason", async () => {
      const text = "name,price,category,url,brand,merchant\nJute Basket,899,home-living,https://www.amazon.in/dp/1,green-leaf,Amazon\nGhost,10,home-living,https://amzn.to/2,ghost,Amazon\n";
      const stage = await up("products", text); expect(await confirm(stage)).toContain("created=1");
      expect((await q("select (brand_id is not null) as b, (category_id is not null) as c from products where slug='jute-basket'"))[0]).toEqual({ b: true, c: true });
      expect((await q("select price, price_checked_at from offers"))[0]).toEqual({ price: 899, price_checked_at: null });
    });
    it("offers: updates prices and marks them checked only when asked, creates retailers, and blocks missing products and unapproved domains", async () => {
      const head = "product_slug,merchant,url,price,mrp,active,expires,price_checked\n";
      expect(await confirm(await up("offers", head + "jute-basket,Amazon,https://www.amazon.in/dp/1,799,999,,,yes\n"), false)).toContain("e=3");
      expect(await confirm(await up("offers", head + "jute-basket,Amazon,https://www.amazon.in/dp/1,799,999,,,yes\n"), true)).toContain("updated=1");
      expect((await q("select price, mrp, (price_checked_at is not null) as checked from offers where merchant='Amazon'"))[0]).toEqual({ price: 799, mrp: 999, checked: true });
      expect(await confirm(await up("offers", head + "jute-basket,Newshop,https://newshop.example/p,650,,,2099-01-01,\n"))).toContain("created=1");
      expect(await q("select o.price, o.expires_at is not null as e, m.slug from offers o join merchants m on m.id=o.merchant_id where o.merchant='Newshop'")).toEqual([{ price: 650, e: true, slug: "newshop" }]);
      expect(await confirm(await up("offers", head + "missing-product,Amazon,https://www.amazon.in/dp/9,5,,,,\njute-basket,Amazon,https://evil.example/x,5,,,,\n"), true)).toContain("e=3");
      expect((await q("select price from offers where merchant='Amazon'"))[0]).toEqual({ price: 799 });
    });
    it("imports 250 products in safe chunks, creating a shared new merchant only once", async () => {
      const lines = ["name,price,category,url,merchant"]; for (let i = 1; i <= 250; i++) lines.push(`Bulk ${i},${100 + i},home-living,https://bulkmart.example/p/${i},BulkMart`);
      const stage = await up("products", lines.join("\n")), to = await confirm(stage);
      expect(to).toContain("created=250"); expect((await q("select count(*)::int as n from products where slug like 'bulk-%'"))[0].n).toBe(250);
      expect((await q("select count(*)::int as n from merchants where slug='bulkmart'"))[0].n).toBe(1);
      expect((await q("select count(*)::int as n from offers o join merchants m on m.id=o.merchant_id where m.slug='bulkmart'"))[0].n).toBe(250);
      expect(await q("select 1 from import_staging where id=$1", [stage])).toHaveLength(0);
    });
    it("importing the same big file again does nothing (no duplicates, no overwrite)", async () => {
      const lines = ["name,price,category,url,merchant"]; for (let i = 1; i <= 250; i++) lines.push(`Bulk ${i},999,home-living,https://bulkmart.example/p/${i},BulkMart`);
      expect(await confirm(await up("products", lines.join("\n")))).toContain("e=3"); expect((await q("select count(*)::int as n from products where slug like 'bulk-%'"))[0].n).toBe(250);
    });
  });

  describe("export, verification and link checks", () => {
    it("exports products in the importer's own format (round trip)", async () => {
      const res = await exportCsv(new Request("http://x"), { params: Promise.resolve({ kind: "products" }) }); const text = await res.text();
      expect(res.status).toBe(200); expect(res.headers.get("content-type")).toContain("text/csv");
      const v = validateProductRows(text, (await q<{ slug: string }>("select slug from categories")).map((c) => c.slug), 1000); expect(v.errors).toEqual([]); expect(v.rows.length).toBe(251);
    });
    it("exports every other kind and rejects unknown ones", async () => {
      for (const k of ["offers", "merchants", "brands", "categories", "articles", "redirects", "deals", "coupons", "clicks"]) expect((await exportCsv(new Request("http://x"), { params: Promise.resolve({ kind: k }) })).status, k).toBe(200);
      expect((await exportCsv(new Request("http://x"), { params: Promise.resolve({ kind: "nope" }) })).status).toBe(404);
      const cats = await (await exportCsv(new Request("http://x"), { params: Promise.resolve({ kind: "categories" }) })).text(); expect(cats.split("\n")[0].replace(/"/g, "")).toBe("label,slug,icon,tone,position,parent"); expect(cats).toContain("smartphones");
    });
    it("markVerified stamps an offer or a coupon", async () => {
      const oid = (await q<{ id: string }>("select id from offers limit 1"))[0].id; await redirected(() => actions.markVerified(form({ id: oid, kind: "offer", back: "/admin/links?f=stale" })));
      expect((await q("select last_verified_at is not null as v from offers where id=$1", [oid]))[0]).toEqual({ v: true });
      await q("insert into coupons (code,merchant,detail,url) values ('C','S','','https://s.example')"); const cid = (await q<{ id: string }>("select id from coupons"))[0].id;
      expect(await redirected(() => actions.markVerified(form({ id: cid, kind: "coupon", back: "https://evil.example" })))).toBe("/admin/links");
      expect((await q("select verified_at is not null as v from coupons where id=$1", [cid]))[0]).toEqual({ v: true });
    });
  });
});

// =====================================================================================================================
// Phase 2: settings, navigation, pages, media, journal, homepage builder, deals, occasions, comparisons, housekeeping
// =====================================================================================================================
describe.skipIf(!enabled)("Phase 2 (real Postgres)", () => {
  const fresh = async () => { await reset(); await migrate(); };
  const png = (n: number, size = 64) => new File([new Uint8Array(size).fill(n)], `p${n}.png`, { type: "image/png" });
  const sha = (f: File) => createHash("sha256").update(Buffer.from(new Uint8Array(f.size).fill(Number(f.name.slice(1, -4))))).digest("hex");

  describe("migration 010", () => {
    it("gives existing deals readable addresses and is safe to re-run", async () => {
      await fresh(); await q("insert into deals (title,merchant,url) values ('Big Sale!','S','https://s.example'),('Big Sale!','S','https://s.example')");
      await q("update deals set slug = null"); await pool.query(readFileSync(join(root, "db/migrations", readdirSync(join(root, "db/migrations")).find((f) => f.startsWith("010"))!), "utf8"));
      const s = (await q<{ slug: string }>("select slug from deals order by slug")).map((r) => r.slug); expect(new Set(s).size).toBe(2); for (const x of s) expect(x).toMatch(/^big-sale-[0-9a-f]{6}$/);
    });
  });

  describe("settings", () => {
    beforeAll(fresh);
    it("stores only values that differ from the defaults, and clearing a field returns it to the default", async () => {
      expect(await redirected(() => actions.saveSettings(form({ hero_title: "Custom\nTitle", announcement: "Sale!", hero_cta_href: "/shop" })))).toContain("saved=1");
      expect((await q<{ key: string }>("select key from site_settings order by key")).map((r) => r.key)).toEqual(["announcement", "hero_title"]);
      const s = await getSettings(); expect(s.hero_title).toBe("Custom\nTitle"); expect(s.announcement).toBe("Sale!"); expect(s.hero_cta_href).toBe("/shop");
      await redirected(() => actions.saveSettings(form({ hero_title: "", announcement: "" }))); expect(await q("select 1 from site_settings")).toHaveLength(0); expect((await getSettings()).hero_title).toBe(SETTING_DEFAULTS.hero_title);
    });
    it("rejects invalid values and changes nothing", async () => {
      expect(await redirected(() => actions.saveSettings(form({ social_instagram: "http://insecure.example" })))).toContain("e=social_instagram");
      expect(await redirected(() => actions.saveSettings(form({ contact_email: "nope" })))).toContain("e=contact_email");
      expect(await redirected(() => actions.saveSettings(form({ hero_cta_href: "javascript:alert(1)" })))).toContain("e=hero_cta_href"); expect(await q("select 1 from site_settings")).toHaveLength(0);
    });
  });

  describe("navigation", () => {
    beforeAll(fresh);
    const labels = async (m: "header" | "footer" = "header") => (await getNav(m)).map((l) => l.label);
    it("uses the built-in menu until customised, then stores one row per link", async () => {
      const builtIn = await labels(); expect(builtIn.length).toBeGreaterThan(0);
      await redirected(() => actions.customiseNav(form({ menu: "header" }))); expect((await q("select count(*)::int as n from nav_items where menu='header'"))[0].n).toBe(builtIn.length); expect(await labels()).toEqual(builtIn);
    });
    it("adds, validates, reorders, hides and resets links", async () => {
      expect(await redirected(() => actions.saveNavItem(form({ menu: "header", label: "Blog", href: "/journal", enabled: "on" })))).toBe("/admin/navigation");
      expect((await labels()).at(-1)).toBe("Blog");
      expect(await redirected(() => actions.saveNavItem(form({ menu: "header", label: "Bad", href: "javascript:alert(1)", enabled: "on" })))).toContain("e=href");
      expect(await redirected(() => actions.saveNavItem(form({ menu: "header", label: "", href: "/x", enabled: "on" })))).toContain("e=label");
      const id = (await q<{ id: string }>("select id from nav_items where label='Blog'"))[0].id; const before = await labels();
      await redirected(() => actions.moveNavItem(form({ id, dir: "up" }))); const after = await labels(); expect(after.at(-2)).toBe("Blog"); expect(after.length).toBe(before.length);
      const firstId = (await q<{ id: string }>("select id from nav_items where menu='header' order by position limit 1"))[0].id; await redirected(() => actions.moveNavItem(form({ id: firstId, dir: "up" }))); expect(await labels()).toEqual(after);
      await redirected(() => actions.saveNavItem(form({ id, menu: "header", label: "Blog", href: "/journal" }))); expect(await labels()).not.toContain("Blog");
      await redirected(() => actions.resetNav(form({ menu: "header" }))); expect(await q("select 1 from nav_items")).toHaveLength(0); expect(await labels()).toEqual(before.filter((l) => l !== "Blog"));
    });
  });

  describe("pages", () => {
    beforeAll(fresh);
    it("serves built-in text until customised, and a reset brings it back", async () => {
      expect((await loadPage("about"))?.custom).toBe(false);
      await redirected(() => actions.savePage(form({ slug: "about", title: "About us", body: "Hello **world**", status: "published" }))); expect(await loadPage("about")).toMatchObject({ title: "About us", custom: true });
      await redirected(() => actions.resetPage(form({ slug: "about" }))); expect(await loadPage("about")).toMatchObject({ custom: false }); expect(await q("select 1 from pages")).toHaveLength(0);
    });
    it("creates custom pages, hides drafts, and refuses reserved addresses", async () => {
      await redirected(() => actions.savePage(form({ slug: "Returns Policy", title: "Returns", body: "## 30 days", status: "published" }))); expect((await loadPage("returns-policy"))?.title).toBe("Returns"); expect(await loadPageSlugs()).toContain("returns-policy");
      await redirected(() => actions.savePage(form({ slug: "returns-policy", title: "Returns", body: "x", status: "draft" }))); expect(await loadPage("returns-policy")).toBeUndefined(); expect(await loadPageSlugs()).not.toContain("returns-policy");
      for (const slug of ["shop", "admin", "journal"]) expect(await redirected(() => actions.savePage(form({ slug, title: "T", body: "x" })))).toContain("e=slug");
      expect(await redirected(() => actions.savePage(form({ slug: "empty", title: "T", body: "  " })))).toContain("e=body"); expect(await loadPage("shop")).toBeUndefined();
    });
  });

  describe("media library (Cloudinary mocked)", () => {
    const calls = vi.fn(); const okJson = (publicId: string) => ({ ok: true, status: 200, json: async () => ({ public_id: publicId, secure_url: `https://res.cloudinary.com/demo/image/upload/v1/${publicId}.png`, width: 800, height: 600, bytes: 12345, format: "png" }) });
    beforeAll(async () => { await fresh(); process.env.CLOUDINARY_CLOUD_NAME = "demo"; process.env.CLOUDINARY_API_KEY = "key"; process.env.CLOUDINARY_API_SECRET = "secret"; });
    beforeEach(() => { calls.mockReset(); calls.mockImplementation(async (_u: string, init: { body: FormData }) => (String(_u).includes("/destroy") ? { ok: true, status: 200, json: async () => ({ result: "ok" }) } : okJson(String(init.body.get("public_id"))))); vi.stubGlobal("fetch", calls); });
    afterAll(() => { vi.unstubAllGlobals(); delete process.env.CLOUDINARY_CLOUD_NAME; delete process.env.CLOUDINARY_API_KEY; delete process.env.CLOUDINARY_API_SECRET; delete process.env.MEDIA_MAX_ITEMS; });
    const up = (file: File | null, alt = "A picture") => redirected(() => actions.uploadMedia(form({ ...(file ? { file } : {}), alt })));

    it("uploads with a hash-derived id, a capped original and a correct signature", async () => {
      const f = png(1); expect(await up(f)).toContain("saved=1"); expect(calls).toHaveBeenCalledTimes(1);
      const [url, init] = calls.mock.calls[0] as [string, { body: FormData }], body = init.body;
      expect(url).toBe("https://api.cloudinary.com/v1_1/demo/image/upload"); const pid = String(body.get("public_id")); expect(pid).toBe(`khushio/${sha(f).slice(0, 20)}`);
      expect(body.get("overwrite")).toBe("false"); expect(String(body.get("transformation"))).toBe("c_limit,h_1600,w_1600,q_auto:good"); expect(body.get("eager")).toBeNull();
      const expected = createHash("sha1").update(`overwrite=false&public_id=${pid}&timestamp=${body.get("timestamp")}&transformation=c_limit,h_1600,w_1600,q_auto:good` + "secret").digest("hex"); expect(body.get("signature")).toBe(expected);
      expect((await q("select public_id, hash, alt, width, height, bytes, format from media"))[0]).toEqual({ public_id: pid, hash: sha(f), alt: "A picture", width: 800, height: 600, bytes: 12345, format: "png" });
    });
    it("never uploads the same picture twice", async () => { const to = await up(png(1)); expect(to).toContain("dup="); expect(calls).not.toHaveBeenCalled(); expect((await q("select count(*)::int as n from media"))[0].n).toBe(1); });
    it("refuses wrong types, oversized files, missing alt text and missing files, without calling Cloudinary", async () => {
      expect(await up(new File([new Uint8Array(10)], "a.gif", { type: "image/gif" }))).toContain("e=type"); expect(await up(png(9, 3 * 1024 * 1024 + 1))).toContain("e=size"); expect(await up(png(8), "  ")).toContain("e=alt"); expect(await up(null)).toContain("e=file"); expect(calls).not.toHaveBeenCalled();
    });
    it("stops at the library size limit and when Cloudinary is not configured", async () => {
      process.env.MEDIA_MAX_ITEMS = "1"; expect(await up(png(2))).toContain("e=limit"); delete process.env.MEDIA_MAX_ITEMS;
      const key = process.env.CLOUDINARY_API_KEY; delete process.env.CLOUDINARY_API_KEY; expect(await up(png(3))).toContain("e=config"); process.env.CLOUDINARY_API_KEY = key; expect(calls).not.toHaveBeenCalled();
    });
    it("reports a Cloudinary failure and stores nothing", async () => { calls.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }); expect(await up(png(4))).toContain("e=upload"); expect((await q("select count(*)::int as n from media"))[0].n).toBe(1); });
    it("counts usage, keeps used images, and deletes unused ones from Cloudinary and the library", async () => {
      const m = (await q<{ id: string; public_id: string }>("select id, public_id from media"))[0];
      await q("insert into products (slug,name,category,price,image_url) values ('pic','Pic','home-living',10,$1)", [m.public_id]); expect(await mediaUsage(m.id)).toBe(1);
      expect(await redirected(() => actions.deleteMedia(form({ id: m.id })))).toContain("e=used"); expect(calls).not.toHaveBeenCalled();
      await q("update products set image_url = null"); expect(await mediaUsage(m.id)).toBe(0);
      calls.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) }); expect(await redirected(() => actions.deleteMedia(form({ id: m.id })))).toContain("e=remote"); expect((await q("select 1 from media"))).toHaveLength(1);
      expect(await redirected(() => actions.deleteMedia(form({ id: m.id })))).toContain("deleted=1"); const [u, init] = calls.mock.calls.at(-1) as [string, { body: FormData }]; expect(u).toContain("/image/destroy"); expect(init.body.get("public_id")).toBe(m.public_id); expect(await q("select 1 from media")).toHaveLength(0);
    });
    it("a markdown image or a cover counts as use, and a product can take its image from the library", async () => {
      await up(png(5)); const m = (await q<{ id: string; public_id: string }>("select id, public_id from media"))[0];
      await redirected(() => actions.saveArticle(form({ title: "With image", body: `Text\n\n![x](media:${m.id})`, status: "draft" }))); expect(await mediaUsage(m.id)).toBe(1);
      await q("delete from articles"); expect(await mediaUsage(m.id)).toBe(0);
      await redirected(() => actions.createProduct(form({ name: "Pic prod", price: "10", category: "home-living", merchant: "S", url: "https://s.example/p", media_id: m.id }))); expect((await q("select image_url from products where slug='pic-prod'"))[0]).toEqual({ image_url: m.public_id }); expect(await mediaUsage(m.id)).toBe(1);
    });
    it("lists media with search, the unused filter and pagination", async () => {
      expect((await listMedia({})).total).toBe(1); expect((await listMedia({ q: "picture" })).total).toBe(1); expect((await listMedia({ q: "nomatch" })).total).toBe(0); expect((await listMedia({ unused: true })).total).toBe(0);
      expect((await mediaStats())).toMatchObject({ count: 1, bytes: 12345, unused: 0 });
    });
  });

  describe("journal", () => {
    beforeAll(fresh);
    const art = (o: Record<string, string>) => redirected(() => actions.saveArticle(form({ title: "First post", body: "Intro paragraph.\n\n[[product:jute]]\n\nMore text.", status: "published", ...o })));
    const idOf = async (slug: string) => (await q<{ id: string }>("select id from articles where slug=$1", [slug]))[0].id;
    it("saves drafts that visitors cannot see, then publishes them", async () => {
      await redirected(() => actions.saveArticleCategory(form({ name: "Guides", description: "How-tos" })));
      expect(await art({ status: "draft", category: "guides", tags: "Gifts, Home", author: "Asha" })).toContain("saved=1");
      const row = (await q("select slug, status, product_slugs, tags, author, excerpt from articles"))[0]; expect(row).toMatchObject({ slug: "first-post", status: "draft", product_slugs: ["jute"], tags: ["gifts", "home"], author: "Asha", excerpt: "Intro paragraph." });
      expect((await listArticles({})).total).toBe(0); expect(await loadArticle("first-post")).toBeUndefined(); expect((await loadArticleForPreview(await idOf("first-post")))?.title).toBe("First post");
      await art({ id: await idOf("first-post"), category: "guides", tags: "Gifts, Home" }); const a = (await loadArticle("first-post"))!;
      expect(a).toMatchObject({ title: "First post", author: "", category: { slug: "guides", name: "Guides" }, tags: ["gifts", "home"], productSlugs: ["jute"] }); expect(a.readMinutes).toBe(1); expect((await listArticles({})).items.map((x) => x.slug)).toEqual(["first-post"]);
    });
    it("schedules: a future publish time hides the article until that time passes", async () => {
      await art({ title: "Later", publish_at: "2099-01-01T09:00" }); expect(await loadArticle("later")).toBeUndefined(); expect((await listArticles({})).items.map((x) => x.slug)).not.toContain("later");
      expect(((await loadJournalSlugs()).articles).map((x) => x.slug)).not.toContain("later"); await q("update articles set publish_at = now() - interval '1 minute' where slug='later'"); expect((await loadArticle("later"))?.title).toBe("Later");
      expect(await art({ title: "Bad date", publish_at: "01/01/2099" })).toContain("e=date");
    });
    it("keeps at most five earlier versions, shows the previous text, and restores any of them", async () => {
      const id = await idOf("first-post");
      for (let i = 1; i <= 7; i++) await art({ id, body: `Version ${i}.` });
      const revs = await q<{ id: string; body: string }>("select id, body from article_revisions where article_id=$1 order by created_at desc, id", [id]); expect(revs).toHaveLength(5); expect(revs[0].body).toBe("Version 6.");
      await redirected(() => actions.restoreRevision(form({ revision: revs[2].id }))); expect((await q("select body from articles where id=$1", [id]))[0]).toEqual({ body: "Version 4." });
      expect((await q("select count(*)::int as n from article_revisions where article_id=$1", [id]))[0].n).toBeLessThanOrEqual(5); expect((await q("select body from article_revisions where article_id=$1 and body='Version 7.'", [id]))).toHaveLength(1);
    });
    it("an unchanged save adds no revision", async () => { const id = await idOf("first-post"), n = (await q("select 1 from article_revisions where article_id=$1", [id])).length; await art({ id, body: "Version 4." }); expect((await q("select 1 from article_revisions where article_id=$1", [id])).length).toBe(n); });
    it("a changed address leaves a redirect; clashes with another article or a category are refused", async () => {
      const id = await idOf("first-post"); await art({ id, slug: "renamed-post", body: "Version 4.", category: "guides" }); expect((await q("select to_path from redirects where from_path='/journal/first-post'"))[0]).toEqual({ to_path: "/journal/renamed-post" });
      expect(await art({ title: "Other", slug: "renamed-post" })).toContain("e=slug-taken"); expect(await art({ title: "Guides" })).toContain("e=slug-category");
      expect(await redirected(() => actions.saveArticleCategory(form({ name: "Renamed Post" })))).toContain("e=slug");
    });
    it("finds related articles by tags or category, articles that feature a product, and categories with live articles", async () => {
      await art({ title: "Second", body: "Second body [x](/shop).", tags: "gifts" }); await art({ title: "Unrelated", body: "Other.", tags: "tools" });
      await q("update articles set tags = '{gifts,home}' where slug='renamed-post'");
      expect((await loadRelatedArticles("renamed-post")).map((x) => x.slug)).toEqual(["second"]); expect((await loadRelatedArticles("unrelated")).map((x) => x.slug)).toEqual([]);
      await art({ id: await idOf("renamed-post"), slug: "renamed-post", body: "Mention.\n\n[[product:jute]]", category: "guides" }); expect((await loadArticlesForProduct("jute")).map((x) => x.slug).sort()).toEqual(["later", "renamed-post"]); expect((await loadArticlesForProduct("jute", 1))).toHaveLength(1); expect(await loadArticlesForProduct("other")).toEqual([]);
      expect((await loadJournalCategories()).find((c) => c.slug === "guides")?.count).toBe(1); expect((await listArticles({ category: "guides" })).items.map((x) => x.slug)).toEqual(["renamed-post"]); expect((await listArticles({ tag: "tools" })).items.map((x) => x.slug)).toEqual(["unrelated"]);
      expect((await loadJournalSlugs()).categories).toContain("guides");
    });
    it("paginates the index", async () => {
      for (let i = 0; i < 20; i++) await q("insert into articles (slug,title,excerpt,body,date) values ($1,$1,'','b','2026-01-01')", [`bulk-${i}`]);
      const p1 = await listArticles({ page: 1 }), p3 = await listArticles({ page: 3 }), far = await listArticles({ page: 99 }); expect([p1.items.length, p1.pages]).toEqual([9, 3]); expect(p3.items.length).toBeGreaterThan(0); expect(far.page).toBe(far.pages);
    });
    it("deleting an article removes its history too", async () => { const id = await idOf("renamed-post"); await redirected(() => actions.deleteArticle(form({ id }))); expect(await q("select 1 from article_revisions where article_id=$1", [id])).toHaveLength(0); expect(await loadArticle("renamed-post")).toBeUndefined(); });
  });

  describe("homepage builder", () => {
    beforeAll(fresh);
    const sections = () => q<{ type: string; position: number; config: Record<string, unknown>; enabled: boolean }>("select type, position, config, enabled from home_sections order by position");
    it("uses the built-in layout (no storage) until customised", async () => { const s = await loadHomeSections(); expect(s.map((x) => x.type)).toEqual(DEFAULT_LAYOUT.map((x) => x.type)); expect(s.every((x) => !x.stored)).toBe(true); expect(await q("select 1 from home_sections")).toHaveLength(0); });
    it("customising copies the layout once, and adding respects the limits", async () => {
      await redirected(() => actions.createDefaultHome()); await redirected(() => actions.createDefaultHome()); expect(await sections()).toHaveLength(DEFAULT_LAYOUT.length); expect((await loadHomeSections()).every((x) => x.stored)).toBe(true);
      await redirected(() => actions.addHomeSection(form({ type: "nonsense" }))); expect(await sections()).toHaveLength(DEFAULT_LAYOUT.length);
      const to = await redirected(() => actions.addHomeSection(form({ type: "banner" }))); expect(to).toMatch(/\/admin\/home\/[0-9a-f-]{36}$/);
      for (let i = (await sections()).length; i < 30; i++) await q("insert into home_sections (type, position) values ('stores', $1)", [i]); expect(await redirected(() => actions.addHomeSection(form({ type: "banner" })))).toContain("e=limit");
    });
    it("stores only the values that differ from the defaults, validates, and schedules", async () => {
      const id = (await q<{ id: string }>("select id from home_sections where type='banner'"))[0].id;
      await redirected(() => actions.saveHomeSection(form({ id, title: "Special offer", text: "", cta_label: "Go", cta_href: "/deals", variant: "plain", enabled: "on", publish_at: "2099-01-01T09:00", unpublish_at: "2099-02-01T09:00" })));
      const row = (await q<{ config: Record<string, unknown>; publish_at: string }>("select config, publish_at from home_sections where id=$1", [id]))[0]; expect(row.config).toEqual({ cta_label: "Go", cta_href: "/deals" }); expect(new Date(row.publish_at).toISOString()).toBe("2099-01-01T03:30:00.000Z");
      expect(await redirected(() => actions.saveHomeSection(form({ id, cta_href: "javascript:alert(1)", enabled: "on" })))).toContain("e=cta_href");
      expect(await redirected(() => actions.saveHomeSection(form({ id, enabled: "on", publish_at: "2099-03-01T09:00", unpublish_at: "2099-02-01T09:00" })))).toContain("e=dates");
      expect(visibility((await loadHomeSections()).find((x) => x.id === id)!)).toBe("scheduled");
    });
    it("reorders, removes and resets", async () => {
      const order = async () => (await sections()).map((x) => x.type); const before = await order(); const id = (await q<{ id: string }>("select id from home_sections where position=1"))[0].id;
      await redirected(() => actions.moveHomeSection(form({ id, dir: "up" }))); const after = await order(); expect([after[0], after[1]]).toEqual([before[1], before[0]]);
      await redirected(() => actions.deleteHomeSection(form({ id }))); expect((await sections()).length).toBe(before.length - 1);
      await redirected(() => actions.resetHome()); expect(await q("select 1 from home_sections")).toHaveLength(0); expect((await loadHomeSections())[0].stored).toBe(false);
    });
  });

  describe("deals, occasions and comparisons", () => {
    beforeAll(fresh);
    it("gives deals readable unique addresses, descriptions, and an 'ended' state instead of an error", async () => {
      const mk = () => redirected(() => actions.createDeal(form({ title: "Big Sale", merchant: "S", url: "https://s.example/deal", ends: "", description: "Half price." })));
      await mk(); await mk(); const s = (await q<{ slug: string }>("select slug from deals order by created_at")).map((r) => r.slug); expect(s[0]).toBe("big-sale"); expect(s[1]).toMatch(/^big-sale-[0-9a-f]{1,4}$/); expect(s[1]).not.toBe(s[0]);
      expect(await loadDealBySlug("big-sale")).toMatchObject({ title: "Big Sale", description: "Half price.", ended: false }); expect((await loadDeals()).map((d) => d.slug)).toContain("big-sale");
      await q("update deals set expires_at = now() - interval '1 hour' where slug='big-sale'"); expect(await loadDealBySlug("big-sale")).toMatchObject({ ended: true }); expect((await loadDeals()).map((d) => d.slug)).not.toContain("big-sale");
      const id = (await q<{ id: string }>("select id from deals where slug='big-sale'"))[0].id; expect((await loadDealBySlug(id))?.slug).toBe("big-sale"); expect(await loadDealBySlug("nope")).toBeUndefined();
    });
    it("saves gift occasions as saved searches and applies them", async () => {
      expect(await redirected(() => actions.saveOccasion(form({ title: "Under 500", max_price: "500", enabled: "on" })))).toContain("saved=1");
      expect(await redirected(() => actions.saveOccasion(form({ title: "Bad", min_price: "900", max_price: "500", enabled: "on" })))).toContain("e=price"); expect(await redirected(() => actions.saveOccasion(form({ title: "Empty", enabled: "on" })))).toContain("e=empty");
      const o = (await loadOccasion("under-500"))!; expect(o).toMatchObject({ maxPrice: 500, categories: [] }); expect((await loadOccasions()).map((x) => x.slug)).toEqual(["under-500"]);
      await q("insert into products (slug,name,category,price) values ('cheap','Cheap','home-living',100),('dear','Dear','home-living',900)");
      expect((await searchProducts({ max: o.maxPrice })).items.map((p) => p.slug)).toEqual(["cheap"]); await q("update gift_occasions set enabled = false"); expect(await loadOccasion("under-500")).toBeUndefined();
    });
    it("saves curated comparisons of two to four products, hides drafts, and redirects after a rename", async () => {
      expect(await redirected(() => actions.saveComparison(form({ title: "Cheap vs Dear", products: "cheap, dear", verdict: "Cheap wins.", status: "published" })))).toContain("saved=1");
      expect(await redirected(() => actions.saveComparison(form({ title: "One", products: "cheap" })))).toContain("e=products"); expect((await loadComparison("cheap-vs-dear"))?.productSlugs).toEqual(["cheap", "dear"]);
      const id = (await q<{ id: string }>("select id from comparisons"))[0].id; await redirected(() => actions.saveComparison(form({ id, title: "Cheap vs Dear", slug: "cheap-or-dear", products: "cheap, dear", status: "published" })));
      expect((await q("select to_path from redirects where from_path='/compare/cheap-vs-dear'"))[0]).toEqual({ to_path: "/compare/cheap-or-dear" });
      await redirected(() => actions.saveComparison(form({ id, title: "Cheap vs Dear", slug: "cheap-or-dear", products: "cheap, dear", status: "draft" }))); expect(await loadComparison("cheap-or-dear")).toBeUndefined(); expect(await loadComparisons()).toEqual([]);
    });
  });

  describe("storage housekeeping", () => {
    beforeAll(fresh);
    const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
    it("summarises old clicks into daily totals in one step and never double counts", async () => {
      await q("insert into clicks (offer_id, at) select $1, now() - interval '40 days' from generate_series(1,6)", [A]); await q("insert into clicks (offer_id, at) select $1, now() - interval '41 days' from generate_series(1,3)", [B]); await q("insert into clicks (offer_id, at) select $1, now() - interval '2 days' from generate_series(1,4)", [A]);
      const r = await runMaintenance(); expect(r.clicksRolledUp).toBe(9); expect((await q("select count(*)::int as n from clicks"))[0].n).toBe(4);
      expect((await q("select coalesce(sum(clicks),0)::int as n from click_daily"))[0].n).toBe(9); expect((await q("select clicks from click_daily where offer_id=$1", [B]))[0]).toEqual({ clicks: 3 });
      expect((await runMaintenance()).clicksRolledUp).toBe(0); expect((await q("select coalesce(sum(clicks),0)::int as n from click_daily"))[0].n).toBe(9);
    });
    it("adds to an existing day instead of replacing it", async () => {
      await q("insert into clicks (offer_id, at) select $1, now() - interval '41 days' from generate_series(1,2)", [B]); await runMaintenance();
      expect((await q("select coalesce(sum(clicks),0)::int as n from click_daily where offer_id=$1", [B]))[0].n).toBe(5);
    });
    it("removes old audit entries, login records and import uploads, and keeps recent ones", async () => {
      await q("insert into audit_log (at, actor, action) values (now() - interval '200 days','a','old'),(now(),'a','new')"); await q("insert into login_attempts (ip, at) values ('1.1.1.1', now() - interval '3 days'),('2.2.2.2', now())");
      await q("insert into import_staging (csv, created_at) values ('x', now() - interval '3 days'),('y', now())"); const r = await runMaintenance();
      expect([r.auditDeleted, r.loginDeleted, r.stagingDeleted]).toEqual([1, 1, 1]); expect((await q("select action from audit_log"))).toEqual([{ action: "new" }]); expect(await q("select 1 from login_attempts")).toHaveLength(1); expect(await q("select 1 from import_staging")).toHaveLength(1);
    });
    it("reports database usage, and the clean-up action works from the admin", async () => {
      const u = await dbUsage(); expect(u.totalBytes).toBeGreaterThan(0); expect(u.tables.length).toBeGreaterThan(0); expect(u.clickDays).toBeGreaterThan(0);
      expect(await redirected(() => actions.runMaintenanceNow())).toContain("ran=1");
    });
    it("the optional scheduled endpoint is off without a secret and checks it with one", async () => {
      const call = (auth?: string) => cronGet(new Request("http://x/api/maintenance", { headers: auth ? { authorization: auth } : {} }));
      delete process.env.CRON_SECRET; expect((await call("Bearer anything")).status).toBe(404);
      process.env.CRON_SECRET = "s3cret-value"; expect((await call()).status).toBe(401); expect((await call("Bearer wrong-value!")).status).toBe(401); const ok = await call("Bearer s3cret-value"); expect(ok.status).toBe(200); expect(await ok.json()).toHaveProperty("clicksRolledUp"); delete process.env.CRON_SECRET;
    });
  });

  describe("sitemap", () => {
    beforeAll(async () => {
      await fresh(); await q("insert into products (slug,name,category,price) values ('p1','P1','home-living',10)");
      await redirected(() => actions.saveArticleCategory(form({ name: "Guides" }))); await redirected(() => actions.saveArticle(form({ title: "Live post", body: "Hello.", status: "published", category: "guides" }))); await redirected(() => actions.saveArticle(form({ title: "Draft post", body: "Hello.", status: "draft" })));
      await redirected(() => actions.createDeal(form({ title: "Deal one", merchant: "S", url: "https://s.example/d" }))); await redirected(() => actions.saveOccasion(form({ title: "Budget", max_price: "500", enabled: "on" })));
      await redirected(() => actions.saveComparison(form({ title: "P vs Q", products: "p1, p2" }))); await redirected(() => actions.savePage(form({ slug: "returns", title: "Returns", body: "x", status: "published" }))); await redirected(() => actions.savePage(form({ slug: "hidden", title: "Hidden", body: "x", status: "draft" })));
    });
    it("lists everything public, and nothing that is a draft", async () => {
      const urls = (await sitemap()).map((e) => e.url.replace(/^https?:\/\/[^/]+/, "")); for (const u of ["/products/p1", "/journal/live-post", "/journal/guides", "/deals/deal-one", "/gifts/budget", "/compare/p-vs-q", "/returns", "/privacy-policy"]) expect(urls, u).toContain(u);
      for (const u of ["/journal/draft-post", "/hidden"]) expect(urls, u).not.toContain(u); expect(new Set(urls).size).toBe(urls.length);
    });
  });
});

describe.skipIf(enabled)("database (real Postgres)", () => { it.skip("skipped: set TEST_DATABASE_URL to a *_test database to run these", () => {}); });
