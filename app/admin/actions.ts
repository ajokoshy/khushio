"use server";
import { randomUUID } from "node:crypto";
import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { SETTING_DEFAULTS, type SettingKey } from "@/lib/settings";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkLogin, endSession, requireAdmin, startSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { categoryIcons, toneClass } from "@/lib/config/site";
import { loadCategories } from "@/lib/data/catalog";
import { uploadImage } from "@/lib/cloudinary";
import { audit } from "@/lib/audit";
import { approvedFor, checkDestination, parseDomains } from "@/lib/affiliate/rules";
import { strictDomains } from "@/lib/config/env";
import { buildImportPlan } from "@/lib/import-db";
import { slugify } from "@/lib/slug";

const f = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
const tgt = (d: FormData) => f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name") || f(d, "code");
const UUID = /^[0-9a-f-]{36}$/i;
/** End of the given YYYY-MM-DD in India time (IST), or null when empty/invalid. */
const endOfDay = (s: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const d = new Date(`${s}T23:59:59+05:30`); return Number.isNaN(+d) ? null : d; };
async function imageFrom(d: FormData, back: string): Promise<string | null> {
  const file = d.get("image");
  if (!(file instanceof File) || file.size === 0) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 3.5 * 1024 * 1024) redirect(`${back}?e=2`);
  let url: string | null = null;
  try { url = await uploadImage(file); } catch {}
  if (!url) redirect(`${back}?e=3`);
  return url;
}
async function ensureMerchant(name: string) {
  const slug = slugify(name) || "store";
  const [m] = await db!.insert(schema.merchants).values({ slug, name }).onConflictDoUpdate({ target: schema.merchants.slug, set: { slug } }).returning();
  return m;
}
/** Approved domains of the merchant with this name, or [] when it does not exist yet (legacy links stay allowed unless strict mode is on). */
async function domainsFor(name: string) {
  const [m] = await db!.select().from(schema.merchants).where(eq(schema.merchants.slug, slugify(name) || "store"));
  return m ? approvedFor(m.approvedDomains, m.website) : [];
}
const destinationOk = async (merchant: string, url: string) => checkDestination(url, await domainsFor(merchant), strictDomains()).ok;
const refresh = () => revalidatePath("/", "layout");

export async function login(d: FormData) {
  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  let blocked = false;
  if (db) { try { const [r] = await db.select({ n: count() }).from(schema.loginAttempts).where(and(eq(schema.loginAttempts.ip, ip), gt(schema.loginAttempts.at, new Date(Date.now() - 15 * 60_000)))); blocked = r.n >= 5; } catch {} }
  if (blocked) redirect("/admin/login?e=2");
  if (!checkLogin(f(d, "email"), f(d, "password"))) {
    if (db) { try { await db.insert(schema.loginAttempts).values({ ip }); } catch {} }
    redirect("/admin/login?e=1");
  }
  if (db) { try { await db.delete(schema.loginAttempts).where(eq(schema.loginAttempts.ip, ip)); } catch {} }
  await audit("login"); await startSession(); redirect("/admin");
}
export async function logout() { await endSession(); redirect("/admin/login"); }

export async function createArticle(d: FormData) {
  await requireAdmin(); if (!db) return;
  const title = f(d, "title"), body = f(d, "body"); if (!title || !body) redirect("/admin/content?e=1");
  await db.insert(schema.articles).values({ slug: slugify(f(d, "slug") || title), title, excerpt: f(d, "excerpt"), body, date: new Date().toISOString().slice(0, 10) }); await audit("createArticle", tgt(d)); refresh(); redirect("/admin/content");
}
export async function deleteContent(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id"), t = f(d, "table");
  if (t === "deals") await db.delete(schema.deals).where(eq(schema.deals.id, id));
  else if (t === "coupons") await db.delete(schema.coupons).where(eq(schema.coupons.id, id));
  else if (t === "articles") await db.delete(schema.articles).where(eq(schema.articles.id, id));
  await audit("deleteContent", tgt(d)); refresh(); redirect("/admin/content");
}

export async function saveSettings(d: FormData) {
  await requireAdmin(); if (!db) return;
  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    const value = f(d, key).slice(0, 500);
    await db.insert(schema.siteSettings).values({ key, value }).onConflictDoUpdate({ target: schema.siteSettings.key, set: { value, updatedAt: new Date() } });
  }
  await audit("saveSettings", tgt(d)); refresh(); redirect("/admin/settings?saved=1");
}

export async function saveBrand(d: FormData) {
  await requireAdmin(); if (!db) return;
  const name = f(d, "name"), slug = slugify(f(d, "slug") || name); if (!name || !slug) redirect("/admin/brands?e=1");
  await db.insert(schema.brands).values({ slug, name, about: f(d, "about") }).onConflictDoUpdate({ target: schema.brands.slug, set: { name, about: f(d, "about") } });
  await audit("saveBrand", tgt(d)); refresh(); redirect("/admin/brands");
}
export async function deleteBrand(d: FormData) {
  await requireAdmin(); if (!db) return;
  await db.delete(schema.brands).where(eq(schema.brands.id, f(d, "id"))); await audit("deleteBrand", tgt(d)); refresh(); redirect("/admin/brands");
}
export async function saveCategory(d: FormData) {
  await requireAdmin(); if (!db) return;
  const label = f(d, "label"), slug = slugify(f(d, "slug") || label), icon = f(d, "icon"), tone = f(d, "tone");
  if (!label || !slug || !(categoryIcons as readonly string[]).includes(icon) || !(tone in toneClass)) redirect("/admin/categories?e=1");
  const position = Math.round(Number(f(d, "position"))) || 0;
  await db.insert(schema.categories).values({ slug, label, icon, tone, position }).onConflictDoUpdate({ target: schema.categories.slug, set: { label, icon, tone, position } });
  await audit("saveCategory", tgt(d)); refresh(); redirect("/admin/categories");
}
export async function deleteCategory(d: FormData) {
  await requireAdmin(); if (!db) return;
  const [c] = await db.select().from(schema.categories).where(eq(schema.categories.id, f(d, "id"))); if (!c) redirect("/admin/categories");
  const [used] = await db.select({ n: count() }).from(schema.products).where(eq(schema.products.category, c.slug));
  if (used.n > 0) redirect("/admin/categories?e=2");
  await db.delete(schema.categories).where(eq(schema.categories.id, c.id)); await audit("deleteCategory", tgt(d)); refresh(); redirect("/admin/categories");
}
export async function updateArticle(d: FormData) {
  await requireAdmin(); if (!db) return;
  const title = f(d, "title"), body = f(d, "body"); if (!title || !body) redirect("/admin/content?e=1");
  await db.update(schema.articles).set({ slug: slugify(f(d, "slug") || title), title, excerpt: f(d, "excerpt"), body }).where(eq(schema.articles.id, f(d, "id"))); await audit("updateArticle", tgt(d)); refresh(); redirect("/admin/content");
}

export async function deleteMerchant(d: FormData) {
  await requireAdmin(); if (!db) return;
  const [u] = await db.select({ n: count() }).from(schema.offers).where(eq(schema.offers.merchantId, f(d, "id")));
  if (u.n > 0) redirect("/admin/merchants?e=2");
  await db.delete(schema.merchants).where(eq(schema.merchants.id, f(d, "id"))); await audit("deleteMerchant", tgt(d)); refresh(); redirect("/admin/merchants");
}
export async function deleteCollection(d: FormData) {
  await requireAdmin(); if (!db) return;
  await db.delete(schema.collections).where(eq(schema.collections.id, f(d, "id"))); await audit("deleteCollection", tgt(d)); refresh(); redirect("/admin/collections");
}


// ---- Products ---------------------------------------------------------------------------------------------
const productFields = (d: FormData) => ({
  name: f(d, "name"), slug: slugify(f(d, "slug") || f(d, "name")), brand: slugify(f(d, "brand")), category: f(d, "category"), blurb: f(d, "blurb"),
  price: Math.round(Number(f(d, "price"))), mrp: Number(f(d, "mrp")) || null, status: f(d, "status") === "draft" ? "draft" : "published",
  featured: d.get("featured") === "on", seoTitle: f(d, "seo_title").slice(0, 70) || null, seoDescription: f(d, "seo_description").slice(0, 170) || null,
});
const productValid = async (p: ReturnType<typeof productFields>) => !!p.name && !!p.slug && p.price > 0 && (!p.mrp || p.mrp > p.price) && (await loadCategories()).some((c) => c.slug === p.category);

export async function createProduct(d: FormData) {
  await requireAdmin(); if (!db) throw new Error("DATABASE_URL not set");
  const p = productFields(d), url = f(d, "url"), merchant = f(d, "merchant") || "Store", back = "/admin/products/new";
  const image = await imageFrom(d, back);
  if (!(await productValid(p)) || !url.startsWith("https://")) redirect(`${back}?e=1`);
  if (!(await destinationOk(merchant, url))) redirect(`${back}?e=4`);
  const m = await ensureMerchant(merchant), id = randomUUID();
  // Product and first offer are written together or not at all.
  await db.batch([db.insert(schema.products).values({ id, ...p, imageUrl: image }), db.insert(schema.offers).values({ productId: id, merchant: m.name, merchantId: m.id, url })]);
  await audit("createProduct", p.slug); refresh(); redirect(`/admin/products/${id}`);
}

export async function updateProduct(d: FormData) {
  await requireAdmin(); if (!db) throw new Error("DATABASE_URL not set");
  const id = f(d, "id"), p = productFields(d); if (!UUID.test(id)) redirect("/admin");
  if (!(await productValid(p))) redirect(`/admin/products/${id}?e=1`);
  const image = (await imageFrom(d, `/admin/products/${id}`)) ?? (f(d, "image_url") || null);
  await db.update(schema.products).set({ ...p, imageUrl: image, updatedAt: new Date() }).where(eq(schema.products.id, id));
  await audit("updateProduct", p.slug); refresh(); redirect(`/admin/products/${id}?saved=1`);
}

/** Archive/restore instead of deleting, so history (clicks, collections) is never lost. */
export async function bulkProducts(d: FormData) {
  await requireAdmin(); if (!db) return;
  const ids = d.getAll("ids").map(String).filter((x) => UUID.test(x)).slice(0, 200), intent = f(d, "intent");
  const status: Record<string, string> = { publish: "published", draft: "draft", archive: "archived", restore: "draft" };
  if (ids.length && status[intent]) {
    await db.update(schema.products).set({ status: status[intent], updatedAt: new Date() }).where(inArray(schema.products.id, ids));
    await audit(`bulk_${intent}`, `${ids.length} products`);
  }
  refresh(); redirect("/admin");
}

// ---- Offers (one product can have several retailers) -------------------------------------------------------
export async function saveOffer(d: FormData) {
  await requireAdmin(); if (!db) return;
  const productId = f(d, "product_id"), id = f(d, "id"), merchant = f(d, "merchant"), url = f(d, "url"), back = `/admin/products/${productId}`;
  if (!UUID.test(productId)) redirect("/admin");
  const expires = f(d, "expires") ? endOfDay(f(d, "expires")) : null;
  if (!merchant || !url.startsWith("https://") || (f(d, "expires") && !expires)) redirect(`${back}?o=1`);
  if (!(await destinationOk(merchant, url))) redirect(`${back}?o=2`);
  const m = await ensureMerchant(merchant);
  const v = { merchant: m.name, merchantId: m.id, url, expiresAt: expires, isActive: d.get("active") === "on", ...(d.get("verified") === "on" ? { lastVerifiedAt: new Date() } : {}) };
  if (UUID.test(id)) await db.update(schema.offers).set(v).where(and(eq(schema.offers.id, id), eq(schema.offers.productId, productId)));
  else await db.insert(schema.offers).values({ productId, ...v });
  await db.update(schema.products).set({ updatedAt: new Date() }).where(eq(schema.products.id, productId));
  await audit("saveOffer", `${productId}:${merchant}`); refresh(); redirect(`${back}?saved=1`);
}

// ---- Deals and coupons -------------------------------------------------------------------------------------
export async function createDeal(d: FormData) {
  await requireAdmin(); if (!db) return;
  const title = f(d, "title"), url = f(d, "url"), ends = f(d, "ends"), expiresAt = ends ? endOfDay(ends) : null;
  if (!title || !url.startsWith("https://") || (ends && !expiresAt)) redirect("/admin/content?e=1");
  if (!(await destinationOk(f(d, "merchant"), url))) redirect("/admin/content?e=4");
  await db.insert(schema.deals).values({ title, merchant: f(d, "merchant"), url, ends, expiresAt }); await audit("createDeal", title); refresh(); redirect("/admin/content");
}
export async function updateDeal(d: FormData) {
  await requireAdmin(); if (!db) return;
  const title = f(d, "title"), url = f(d, "url"), ends = f(d, "ends"), expiresAt = ends ? endOfDay(ends) : null;
  if (!UUID.test(f(d, "id")) || !title || !url.startsWith("https://") || (ends && !expiresAt)) redirect("/admin/content?e=1");
  if (!(await destinationOk(f(d, "merchant"), url))) redirect("/admin/content?e=4");
  await db.update(schema.deals).set({ title, merchant: f(d, "merchant"), url, ends, expiresAt, isActive: d.get("active") !== null ? d.get("active") === "on" : true, updatedAt: new Date() }).where(eq(schema.deals.id, f(d, "id")));
  await audit("updateDeal", title); refresh(); redirect("/admin/content");
}
export async function createCoupon(d: FormData) {
  await requireAdmin(); if (!db) return;
  const code = f(d, "code"), url = f(d, "url"), expires = f(d, "expires"), expiresAt = expires ? endOfDay(expires) : null;
  if (!code || !url.startsWith("https://") || (expires && !expiresAt)) redirect("/admin/content?e=1");
  if (!(await destinationOk(f(d, "merchant"), url))) redirect("/admin/content?e=4");
  await db.insert(schema.coupons).values({ code, merchant: f(d, "merchant"), detail: f(d, "detail"), url, expiresAt, verifiedAt: d.get("verified") === "on" ? new Date() : null });
  await audit("createCoupon", code); refresh(); redirect("/admin/content");
}
export async function updateCoupon(d: FormData) {
  await requireAdmin(); if (!db) return;
  const code = f(d, "code"), url = f(d, "url"), expires = f(d, "expires"), expiresAt = expires ? endOfDay(expires) : null;
  if (!UUID.test(f(d, "id")) || !code || !url.startsWith("https://") || (expires && !expiresAt)) redirect("/admin/content?e=1");
  if (!(await destinationOk(f(d, "merchant"), url))) redirect("/admin/content?e=4");
  await db.update(schema.coupons).set({ code, merchant: f(d, "merchant"), detail: f(d, "detail"), url, expiresAt, isActive: d.get("active") !== null ? d.get("active") === "on" : true, ...(d.get("verified") === "on" ? { verifiedAt: new Date() } : {}) }).where(eq(schema.coupons.id, f(d, "id")));
  await audit("updateCoupon", code); refresh(); redirect("/admin/content");
}

// ---- Merchants ---------------------------------------------------------------------------------------------
export async function saveMerchant(d: FormData) {
  await requireAdmin(); if (!db) return;
  const id = f(d, "id"), name = f(d, "name"), website = f(d, "website"), domains = parseDomains(f(d, "approved_domains"));
  if (!UUID.test(id) || !name || (website && !website.startsWith("https://"))) redirect("/admin/merchants?e=1");
  await db.update(schema.merchants).set({ name, website, approvedDomains: domains.join(", "), isActive: d.get("active") === "on" }).where(eq(schema.merchants.id, id));
  await db.update(schema.offers).set({ merchant: name }).where(eq(schema.offers.merchantId, id));
  await audit("saveMerchant", name); refresh(); redirect("/admin/merchants");
}

// ---- Collections (atomic: the collection and its product list change together) ---------------------------------
export async function saveCollection(d: FormData) {
  await requireAdmin(); if (!db) return;
  const id = f(d, "id"), title = f(d, "title"), slug = slugify(f(d, "slug") || title); if (!title || !slug) redirect("/admin/collections?e=1");
  const v = { slug, title, description: f(d, "description"), position: Math.round(Number(f(d, "position"))) || 0 };
  const cid = UUID.test(id) ? id : randomUUID();
  const ids = [...new Set(d.getAll("products").map(String).filter((x) => UUID.test(x)))];
  await db.batch([
    UUID.test(id) ? db.update(schema.collections).set(v).where(eq(schema.collections.id, cid)) : db.insert(schema.collections).values({ id: cid, ...v }).onConflictDoUpdate({ target: schema.collections.slug, set: v }),
    db.delete(schema.collectionProducts).where(eq(schema.collectionProducts.collectionId, cid)),
    ...(ids.length ? [db.insert(schema.collectionProducts).values(ids.map((productId, position) => ({ collectionId: cid, productId, position })))] : []),
  ] as unknown as [never, ...never[]]);
  await audit("saveCollection", slug); refresh(); redirect("/admin/collections");
}

// ---- CSV import: upload -> preview -> confirm -----------------------------------------------------------------
export async function previewImport(d: FormData) {
  await requireAdmin(); if (!db) return;
  const file = d.get("file"); if (!(file instanceof File) || file.size === 0 || file.size > 500_000) redirect("/admin/import?e=1");
  try { await db.execute(sql`DELETE FROM import_staging WHERE created_at < now() - interval '1 day'`); } catch {}
  const [row] = await db.insert(schema.importStaging).values({ csv: await file.text() }).returning({ id: schema.importStaging.id });
  redirect(`/admin/import?stage=${row.id}`);
}
export async function cancelImport(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "stage");
  if (UUID.test(id)) await db.delete(schema.importStaging).where(eq(schema.importStaging.id, id));
  redirect("/admin/import");
}
/** Re-reads the staged file and re-validates it on the server (nothing from the browser is trusted), then writes everything in one atomic batch. */
export async function confirmImport(d: FormData) {
  await requireAdmin(); if (!db) return;
  const stage = f(d, "stage"), allowUpdate = d.get("update") === "on"; if (!UUID.test(stage)) redirect("/admin/import?e=1");
  const [st] = await db.select().from(schema.importStaging).where(eq(schema.importStaging.id, stage)); if (!st) redirect("/admin/import?e=2");
  const plan = await buildImportPlan(st.csv, allowUpdate);
  const todo = plan.items.filter((i) => !i.blocked && i.action !== "skip-existing");
  if (!todo.length) redirect(`/admin/import?stage=${stage}&e=3`);
  const stmts: unknown[] = [];
  const newMerchants = new Map<string, { id: string; slug: string; name: string }>();
  for (const i of todo) if (!i.merchantId && !newMerchants.has(i.merchantSlug)) newMerchants.set(i.merchantSlug, { id: randomUUID(), slug: i.merchantSlug, name: i.merchant });
  if (newMerchants.size) stmts.push(db.insert(schema.merchants).values([...newMerchants.values()]).onConflictDoNothing());
  const updIds = todo.filter((i) => i.productId).map((i) => i.productId!);
  const offs = updIds.length ? await db.select().from(schema.offers).where(inArray(schema.offers.productId, updIds)) : [];
  const now = new Date();
  for (const i of todo) {
    const mid = i.merchantId ?? newMerchants.get(i.merchantSlug)!.id;
    const fields = { slug: i.slug, name: i.name, brand: i.brand, category: i.category, blurb: i.blurb, price: i.price, mrp: i.mrp, status: i.status };
    if (i.productId) {
      stmts.push(db.update(schema.products).set({ ...fields, updatedAt: now }).where(eq(schema.products.id, i.productId)));
      const o = offs.find((x) => x.productId === i.productId && x.merchantId === mid);
      stmts.push(o ? db.update(schema.offers).set({ url: i.url, merchant: i.merchant, isActive: true }).where(eq(schema.offers.id, o.id)) : db.insert(schema.offers).values({ productId: i.productId, merchant: i.merchant, merchantId: mid, url: i.url }));
    } else {
      const pid = randomUUID();
      stmts.push(db.insert(schema.products).values({ id: pid, ...fields }), db.insert(schema.offers).values({ productId: pid, merchant: i.merchant, merchantId: mid, url: i.url }));
    }
  }
  stmts.push(db.delete(schema.importStaging).where(eq(schema.importStaging.id, stage)));
  await db.batch(stmts as unknown as [never, ...never[]]);
  const created = todo.filter((i) => !i.productId).length, updated = todo.length - created;
  await audit("importProducts", `${created} created, ${updated} updated`); refresh(); redirect(`/admin/import?done=1&created=${created}&updated=${updated}&skipped=${plan.items.length - todo.length + plan.errors.length}`);
}
