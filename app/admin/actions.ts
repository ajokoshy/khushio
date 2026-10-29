"use server";
import { and, count, eq, gt, inArray } from "drizzle-orm";
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
import { parseProductRows } from "@/lib/import";
import { slugify } from "@/lib/slug";

const f = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
async function imageFrom(d: FormData, back: string): Promise<string | null> {
  const file = d.get("image");
  if (!(file instanceof File) || file.size === 0) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 3.5 * 1024 * 1024) redirect(`${back}?e=2`);
  let url: string | null = null;
  try { url = await uploadImage(file); } catch {}
  if (!url) redirect(`${back}?e=3`);
  return url;
}
async function ensureMerchant(name: string): Promise<string> {
  const slug = slugify(name) || "store";
  const [m] = await db!.insert(schema.merchants).values({ slug, name }).onConflictDoUpdate({ target: schema.merchants.slug, set: { slug } }).returning({ id: schema.merchants.id });
  return m.id;
}
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

export async function createProduct(d: FormData) {
  await requireAdmin(); if (!db) throw new Error("DATABASE_URL not set");
  const name = f(d, "name"), url = f(d, "url"), price = Math.round(Number(f(d, "price")));
  const category = f(d, "category"), mrp = Number(f(d, "mrp")) || null;
  const image = await imageFrom(d, "/admin/products/new");
  if (!name || !price || price < 0 || !url.startsWith("https://") || !(await loadCategories()).some((c) => c.slug === category)) redirect("/admin/products/new?e=1");
  const [row] = await db.insert(schema.products).values({ slug: slugify(f(d, "slug") || name), name, brand: slugify(f(d, "brand")), category, blurb: f(d, "blurb"), price, mrp, status: f(d, "status") === "draft" ? "draft" : "published", imageUrl: image }).returning();
  { const m = f(d, "merchant") || "Store"; await db.insert(schema.offers).values({ productId: row.id, merchant: m, merchantId: await ensureMerchant(m), url }); }
  await audit("createProduct", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin");
}
export async function toggleStatus(d: FormData) {
  await requireAdmin(); if (!db) return;
  await db.update(schema.products).set({ status: f(d, "status") === "published" ? "draft" : "published" }).where(eq(schema.products.id, f(d, "id"))); await audit("toggleStatus", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin");
}
export async function deleteProduct(d: FormData) {
  await requireAdmin(); if (!db) return;
  await db.delete(schema.products).where(eq(schema.products.id, f(d, "id"))); await audit("deleteProduct", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin");
}

export async function updateProduct(d: FormData) {
  await requireAdmin(); if (!db) throw new Error("DATABASE_URL not set");
  const id = f(d, "id"), name = f(d, "name"), url = f(d, "url"), price = Math.round(Number(f(d, "price"))), category = f(d, "category");
  if (!name || !price || price < 0 || !url.startsWith("https://") || !(await loadCategories()).some((c) => c.slug === category)) redirect(`/admin/products/${id}?e=1`);
  const image = (await imageFrom(d, `/admin/products/${id}`)) ?? (f(d, "image_url") || null);
  await db.update(schema.products).set({ imageUrl: image, slug: slugify(f(d, "slug") || name), name, brand: slugify(f(d, "brand")), category, blurb: f(d, "blurb"), price, mrp: Number(f(d, "mrp")) || null, status: f(d, "status") === "draft" ? "draft" : "published" }).where(eq(schema.products.id, id));
  const merchant = f(d, "merchant") || "Store"; const merchantId = await ensureMerchant(merchant);
  const upd = await db.update(schema.offers).set({ merchant, merchantId, url }).where(eq(schema.offers.productId, id)).returning({ id: schema.offers.id });
  if (!upd.length) await db.insert(schema.offers).values({ productId: id, merchant, merchantId, url });
  await audit("updateProduct", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin");
}
const https = (u: string) => (u.startsWith("https://") ? u : redirect("/admin/content?e=1"));
export async function createDeal(d: FormData) {
  await requireAdmin(); if (!db) return;
  await db.insert(schema.deals).values({ title: f(d, "title") || redirect("/admin/content?e=1"), merchant: f(d, "merchant"), url: https(f(d, "url")), ends: f(d, "ends") }); await audit("createDeal", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/content");
}
export async function createCoupon(d: FormData) {
  await requireAdmin(); if (!db) return;
  await db.insert(schema.coupons).values({ code: f(d, "code") || redirect("/admin/content?e=1"), merchant: f(d, "merchant"), detail: f(d, "detail"), url: https(f(d, "url")) }); await audit("createCoupon", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/content");
}
export async function createArticle(d: FormData) {
  await requireAdmin(); if (!db) return;
  const title = f(d, "title"), body = f(d, "body"); if (!title || !body) redirect("/admin/content?e=1");
  await db.insert(schema.articles).values({ slug: slugify(f(d, "slug") || title), title, excerpt: f(d, "excerpt"), body, date: new Date().toISOString().slice(0, 10) }); await audit("createArticle", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/content");
}
export async function deleteContent(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id"), t = f(d, "table");
  if (t === "deals") await db.delete(schema.deals).where(eq(schema.deals.id, id));
  else if (t === "coupons") await db.delete(schema.coupons).where(eq(schema.coupons.id, id));
  else if (t === "articles") await db.delete(schema.articles).where(eq(schema.articles.id, id));
  await audit("deleteContent", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/content");
}

export async function saveSettings(d: FormData) {
  await requireAdmin(); if (!db) return;
  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    const value = f(d, key).slice(0, 500);
    await db.insert(schema.siteSettings).values({ key, value }).onConflictDoUpdate({ target: schema.siteSettings.key, set: { value, updatedAt: new Date() } });
  }
  await audit("saveSettings", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/settings?saved=1");
}

export async function saveBrand(d: FormData) {
  await requireAdmin(); if (!db) return;
  const name = f(d, "name"), slug = slugify(f(d, "slug") || name); if (!name || !slug) redirect("/admin/brands?e=1");
  await db.insert(schema.brands).values({ slug, name, about: f(d, "about") }).onConflictDoUpdate({ target: schema.brands.slug, set: { name, about: f(d, "about") } });
  await audit("saveBrand", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/brands");
}
export async function deleteBrand(d: FormData) {
  await requireAdmin(); if (!db) return;
  await db.delete(schema.brands).where(eq(schema.brands.id, f(d, "id"))); await audit("deleteBrand", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/brands");
}
export async function importProducts(d: FormData) {
  await requireAdmin(); if (!db) return;
  const file = d.get("file"); if (!(file instanceof File) || file.size === 0 || file.size > 500_000) redirect("/admin/import?e=1");
  const { rows, skipped } = parseProductRows(await file.text(), (await loadCategories()).map((c) => c.slug));
  for (const v of rows) {
    const { merchant, url, ...p } = v;
    const [row] = await db.insert(schema.products).values(p).onConflictDoUpdate({ target: schema.products.slug, set: { name: p.name, brand: p.brand, category: p.category, blurb: p.blurb, price: p.price, mrp: p.mrp, status: p.status } }).returning({ id: schema.products.id });
    const merchantId = await ensureMerchant(merchant);
    const upd = await db.update(schema.offers).set({ merchant, merchantId, url }).where(eq(schema.offers.productId, row.id)).returning({ id: schema.offers.id });
    if (!upd.length) await db.insert(schema.offers).values({ productId: row.id, merchant, merchantId, url });
  }
  await audit("importProducts", `${rows.length} rows`); refresh(); redirect(`/admin/import?ok=${rows.length}&skipped=${skipped}`);
}

export async function saveCategory(d: FormData) {
  await requireAdmin(); if (!db) return;
  const label = f(d, "label"), slug = slugify(f(d, "slug") || label), icon = f(d, "icon"), tone = f(d, "tone");
  if (!label || !slug || !(categoryIcons as readonly string[]).includes(icon) || !(tone in toneClass)) redirect("/admin/categories?e=1");
  const position = Math.round(Number(f(d, "position"))) || 0;
  await db.insert(schema.categories).values({ slug, label, icon, tone, position }).onConflictDoUpdate({ target: schema.categories.slug, set: { label, icon, tone, position } });
  await audit("saveCategory", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/categories");
}
export async function deleteCategory(d: FormData) {
  await requireAdmin(); if (!db) return;
  const [c] = await db.select().from(schema.categories).where(eq(schema.categories.id, f(d, "id"))); if (!c) redirect("/admin/categories");
  const [used] = await db.select({ n: count() }).from(schema.products).where(eq(schema.products.category, c.slug));
  if (used.n > 0) redirect("/admin/categories?e=2");
  await db.delete(schema.categories).where(eq(schema.categories.id, c.id)); await audit("deleteCategory", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/categories");
}
export async function updateDeal(d: FormData) {
  await requireAdmin(); if (!db) return;
  await db.update(schema.deals).set({ title: f(d, "title") || redirect("/admin/content?e=1"), merchant: f(d, "merchant"), url: https(f(d, "url")), ends: f(d, "ends") }).where(eq(schema.deals.id, f(d, "id"))); await audit("updateDeal", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/content");
}
export async function updateCoupon(d: FormData) {
  await requireAdmin(); if (!db) return;
  await db.update(schema.coupons).set({ code: f(d, "code") || redirect("/admin/content?e=1"), merchant: f(d, "merchant"), detail: f(d, "detail"), url: https(f(d, "url")) }).where(eq(schema.coupons.id, f(d, "id"))); await audit("updateCoupon", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/content");
}
export async function updateArticle(d: FormData) {
  await requireAdmin(); if (!db) return;
  const title = f(d, "title"), body = f(d, "body"); if (!title || !body) redirect("/admin/content?e=1");
  await db.update(schema.articles).set({ slug: slugify(f(d, "slug") || title), title, excerpt: f(d, "excerpt"), body }).where(eq(schema.articles.id, f(d, "id"))); await audit("updateArticle", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/content");
}

export async function saveMerchant(d: FormData) {
  await requireAdmin(); if (!db) return;
  const name = f(d, "name"), website = f(d, "website"); if (!name || (website && !website.startsWith("https://"))) redirect("/admin/merchants?e=1");
  await db.update(schema.merchants).set({ name, website }).where(eq(schema.merchants.id, f(d, "id")));
  await db.update(schema.offers).set({ merchant: name }).where(eq(schema.offers.merchantId, f(d, "id"))); await audit("saveMerchant", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/merchants");
}
export async function deleteMerchant(d: FormData) {
  await requireAdmin(); if (!db) return;
  const [u] = await db.select({ n: count() }).from(schema.offers).where(eq(schema.offers.merchantId, f(d, "id")));
  if (u.n > 0) redirect("/admin/merchants?e=2");
  await db.delete(schema.merchants).where(eq(schema.merchants.id, f(d, "id"))); await audit("deleteMerchant", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/merchants");
}
export async function saveCollection(d: FormData) {
  await requireAdmin(); if (!db) return;
  const id = f(d, "id"), title = f(d, "title"), slug = slugify(f(d, "slug") || title); if (!title || !slug) redirect("/admin/collections?e=1");
  const v = { slug, title, description: f(d, "description"), position: Math.round(Number(f(d, "position"))) || 0 };
  let cid = id;
  if (id) await db.update(schema.collections).set(v).where(eq(schema.collections.id, id));
  else cid = (await db.insert(schema.collections).values(v).onConflictDoUpdate({ target: schema.collections.slug, set: v }).returning({ id: schema.collections.id }))[0].id;
  await db.delete(schema.collectionProducts).where(eq(schema.collectionProducts.collectionId, cid));
  const ids = d.getAll("products").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (ids.length) await db.insert(schema.collectionProducts).values(ids.map((productId, position) => ({ collectionId: cid, productId, position })));
  await audit("saveCollection", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/collections");
}
export async function deleteCollection(d: FormData) {
  await requireAdmin(); if (!db) return;
  await db.delete(schema.collections).where(eq(schema.collections.id, f(d, "id"))); await audit("deleteCollection", f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name")); refresh(); redirect("/admin/collections");
}

export async function bulkProducts(d: FormData) {
  await requireAdmin(); if (!db) return;
  const ids = d.getAll("ids").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200), intent = f(d, "intent");
  if (ids.length && ["publish", "draft", "delete"].includes(intent)) {
    if (intent === "delete") await db.delete(schema.products).where(inArray(schema.products.id, ids));
    else await db.update(schema.products).set({ status: intent === "publish" ? "published" : "draft" }).where(inArray(schema.products.id, ids));
    await audit(`bulk_${intent}`, `${ids.length} products`);
  }
  refresh(); redirect("/admin");
}
