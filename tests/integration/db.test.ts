/**
 * Database integration tests. They run only when TEST_DATABASE_URL points at a throw-away Postgres database whose
 * name ends in _test (the schema is DROPPED and rebuilt). Example:
 *   TEST_DATABASE_URL=postgres://user:pw@localhost:5432/khushio_test npm test
 * Note: Neon's HTTP driver runs db.batch() as one transaction; here a small shim emulates that with BEGIN/COMMIT.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

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
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error("REDIRECT:" + to); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("../../lib/auth", () => ({ requireAdmin: async () => {}, checkLogin: () => false, endSession: async () => {}, startSession: async () => {} }));
vi.mock("../../lib/audit", () => ({ audit: async () => {} }));

import * as actions from "../../app/admin/actions";
import { loadCoupons, loadDeals, loadProducts, resolveOffer } from "../../lib/data/catalog";
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
      await pool.query(sqlFiles().at(-1)!);
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
      expect((await loadCoupons())[0].verifiedAt).toBeInstanceOf(Date);
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
      const plan = await buildImportPlan((await q<{ csv: string }>("select csv from import_staging where id=$1", [s]))[0].csv, false);
      expect(plan.items.map((i) => [i.slug, i.action])).toEqual([["brand-new", "create"], ["old", "skip-existing"]]); expect(plan.errors).toEqual([{ line: 4, reason: expect.stringContaining("price") }]);
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

describe.skipIf(enabled)("database (real Postgres)", () => { it.skip("skipped: set TEST_DATABASE_URL to a *_test database to run these", () => {}); });
