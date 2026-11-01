"use server";
import { randomUUID } from "node:crypto";
import { and, asc, count, eq, gt, inArray, like, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { SETTINGS, SETTING_DEFAULTS, cleanSetting } from "@/lib/settings-schema";
import { MENUS, cleanNavItem, type Menu } from "@/lib/nav-core";
import { defaultMenu } from "@/lib/nav";
import { cleanPageSlug, DEFAULT_PAGES } from "@/lib/pages-core";
import { redirect } from "next/navigation";
import { checkLogin, endSession, requireAdmin, startSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { categoryIcons, toneClass } from "@/lib/config/site";
import { loadCategories } from "@/lib/data/catalog";
import { createHash } from "node:crypto";
import { mediaMaxItems } from "@/lib/config/env";
import { getProvider } from "@/lib/media/provider";
import { mediaUsage } from "@/lib/data/media";
import { audit } from "@/lib/audit";
import { approvedFor, checkDestination, parseDomains } from "@/lib/affiliate/rules";
import { strictDomains } from "@/lib/config/env";
import { buildImportPlan } from "@/lib/import-db";
import { buildStatements, newState, orderForImport, TAGS_FOR } from "@/lib/import-apply";
import { slugify } from "@/lib/slug";
import { invalidate, type Tag } from "@/lib/cache";
import { addRedirect } from "@/lib/redirects-db";
import { findDuplicates } from "@/lib/duplicates-db";
import { parentCreatesCycle } from "@/lib/categories";
import { IMPORT_CHUNK, IMPORT_KINDS, type ImportKind } from "@/lib/import-kinds";
import { DEFAULT_LAYOUT, MAX_SECTIONS, SECTION_TYPES, cleanConfig, isSectionType, type SectionDef } from "@/lib/home/sections";
import { runMaintenance } from "@/lib/maintenance";
import { cleanComparison, cleanOccasion, dealSlug } from "@/lib/curation-core";
import { MAX_REVISIONS, cleanArticle, cleanTags, deriveFromBody, istDate, parsePublishAt } from "@/lib/journal-core";

const f = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
const tgt = (d: FormData) => f(d, "id") || f(d, "slug") || f(d, "title") || f(d, "name") || f(d, "code");
const UUID = /^[0-9a-f-]{36}$/i;
/** End of the given YYYY-MM-DD in India time (IST), or null when empty/invalid. */
const endOfDay = (s: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const d = new Date(`${s}T23:59:59+05:30`); return Number.isNaN(+d) ? null : d; };
/** The product image: a media-library pick (stored as the bare public id), else the current one is kept. Uploading happens only in the media library. */
async function imageFrom(d: FormData): Promise<string | null> {
  const id = f(d, "media_id");
  if (UUID.test(id)) { const [m] = await db!.select({ publicId: schema.media.publicId }).from(schema.media).where(eq(schema.media.id, id)); if (m) return m.publicId; }
  return f(d, "image_url") || null;
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
/** Invalidates only the cached data the change can affect (all of it when no tags are given). */
const refresh = (...tags: Tag[]) => invalidate(...tags);

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

export async function deleteContent(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id"), t = f(d, "table");
  if (t === "deals") await db.delete(schema.deals).where(eq(schema.deals.id, id));
  else if (t === "coupons") await db.delete(schema.coupons).where(eq(schema.coupons.id, id));
  else if (t === "articles") await db.delete(schema.articles).where(eq(schema.articles.id, id));
  await audit("deleteContent", tgt(d)); refresh("deals", "coupons", "articles"); redirect("/admin/content");
}

export async function saveSettings(d: FormData) {
  await requireAdmin(); if (!db) return;
  const clean: [string, string][] = [];
  for (const def of SETTINGS) {
    const r = cleanSetting(def, d.get(def.key) === null ? def.default : String(d.get(def.key)));
    if (!r.ok) redirect(`/admin/settings?e=${def.key}&why=${encodeURIComponent(r.reason)}`);
    clean.push([def.key, r.value]);
  }
  // Only values that differ from the built-in default are stored. An empty value means "use the default".
  const custom = clean.filter(([k, v]) => v !== "" && v !== SETTING_DEFAULTS[k as keyof typeof SETTING_DEFAULTS]);
  const reset = clean.map(([k]) => k).filter((k) => !custom.some(([c]) => c === k));
  await db.batch([
    db.delete(schema.siteSettings).where(inArray(schema.siteSettings.key, reset)),
    ...(custom.length ? [db.insert(schema.siteSettings).values(custom.map(([key, value]) => ({ key, value }))).onConflictDoUpdate({ target: schema.siteSettings.key, set: { value: sql`excluded.value`, updatedAt: new Date() } })] : []),
  ] as unknown as [never, ...never[]]);
  await audit("saveSettings", `${custom.length} customised`); refresh("settings"); redirect("/admin/settings?saved=1");
}

// ---- Pages (only customised pages are stored) -------------------------------------------------------------------
export async function savePage(d: FormData) {
  await requireAdmin(); if (!db) return;
  const slug = cleanPageSlug(f(d, "slug")), title = f(d, "title").slice(0, 120), body = String(d.get("body") ?? "").replace(/\r\n?/g, "\n").slice(0, 20000), status = f(d, "status") === "draft" ? "draft" : "published";
  const back = (q: string) => `/admin/pages?${q}`;
  if (!slug) redirect(back("e=slug")); if (!title) redirect(back("e=title"));
  if (!(slug in DEFAULT_PAGES) && !body.trim()) redirect(back("e=body"));
  await db.insert(schema.pages).values({ slug, title, body, seoDescription: f(d, "seo_description").slice(0, 170), status }).onConflictDoUpdate({ target: schema.pages.slug, set: { title, body, seoDescription: f(d, "seo_description").slice(0, 170), status, updatedAt: new Date() } });
  await audit("savePage", slug); refresh("pages"); redirect(back(`saved=${slug}`));
}
/** Deletes the customised copy. Built-in pages return to their default text; custom pages disappear. */
export async function resetPage(d: FormData) {
  await requireAdmin(); if (!db) return; const slug = cleanPageSlug(f(d, "slug")); if (!slug) redirect("/admin/pages");
  await db.delete(schema.pages).where(eq(schema.pages.slug, slug)); await audit("resetPage", slug); refresh("pages"); redirect("/admin/pages?reset=1");
}

// ---- Navigation menus ------------------------------------------------------------------------------------------
const menuOf = (d: FormData): Menu => ((MENUS as readonly string[]).includes(f(d, "menu")) ? (f(d, "menu") as Menu) : "header");
export async function customiseNav(d: FormData) {
  await requireAdmin(); if (!db) return; const menu = menuOf(d);
  const have = await db.select({ id: schema.navItems.id }).from(schema.navItems).where(eq(schema.navItems.menu, menu));
  if (!have.length) await db.insert(schema.navItems).values(defaultMenu(menu).map((l, position) => ({ menu, label: l.label, href: l.href, position, newTab: l.newTab })));
  await audit("customiseNav", menu); refresh("nav"); redirect("/admin/navigation");
}
export async function resetNav(d: FormData) {
  await requireAdmin(); if (!db) return; const menu = menuOf(d);
  await db.delete(schema.navItems).where(eq(schema.navItems.menu, menu)); await audit("resetNav", menu); refresh("nav"); redirect("/admin/navigation");
}
export async function saveNavItem(d: FormData) {
  await requireAdmin(); if (!db) return; const menu = menuOf(d), id = f(d, "id");
  const c = cleanNavItem(f(d, "label"), f(d, "href")); if (!c.ok) redirect(`/admin/navigation?e=${c.reason}`);
  const v = { label: c.label, href: c.href, enabled: d.get("enabled") === "on", newTab: d.get("new_tab") === "on" };
  if (UUID.test(id)) await db.update(schema.navItems).set(v).where(eq(schema.navItems.id, id));
  else { const [m] = await db.select({ n: count() }).from(schema.navItems).where(eq(schema.navItems.menu, menu)); await db.insert(schema.navItems).values({ menu, position: m.n, ...v }); }
  await audit("saveNavItem", `${menu}:${c.label}`); refresh("nav"); redirect("/admin/navigation");
}
export async function deleteNavItem(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id");
  if (UUID.test(id)) await db.delete(schema.navItems).where(eq(schema.navItems.id, id));
  await audit("deleteNavItem", id); refresh("nav"); redirect("/admin/navigation");
}
/** Moves an item one place up or down by rewriting the menu's positions 0..n in one atomic batch. */
export async function moveNavItem(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id"), dir = f(d, "dir") === "up" ? -1 : 1;
  const [row] = UUID.test(id) ? await db.select().from(schema.navItems).where(eq(schema.navItems.id, id)) : []; if (!row) redirect("/admin/navigation");
  const rows = await db.select().from(schema.navItems).where(eq(schema.navItems.menu, row.menu)).orderBy(asc(schema.navItems.position), asc(schema.navItems.label));
  const i = rows.findIndex((r) => r.id === id), j = i + dir; if (j < 0 || j >= rows.length) redirect("/admin/navigation");
  [rows[i], rows[j]] = [rows[j], rows[i]];
  await db.batch(rows.map((r, position) => db!.update(schema.navItems).set({ position }).where(eq(schema.navItems.id, r.id))) as unknown as [never, ...never[]]);
  refresh("nav"); redirect("/admin/navigation");
}
export async function saveBrand(d: FormData) {
  await requireAdmin(); if (!db) return;
  const name = f(d, "name"), slug = slugify(f(d, "slug") || name); if (!name || !slug) redirect("/admin/brands?e=1");
  await db.insert(schema.brands).values({ slug, name, about: f(d, "about") }).onConflictDoUpdate({ target: schema.brands.slug, set: { name, about: f(d, "about") } });
  await audit("saveBrand", tgt(d)); refresh("brands", "products"); redirect("/admin/brands");
}
export async function deleteBrand(d: FormData) {
  await requireAdmin(); if (!db) return;
  const [b] = await db.select().from(schema.brands).where(eq(schema.brands.id, f(d, "id"))); if (!b) redirect("/admin/brands");
  const [used] = await db.select({ n: count() }).from(schema.products).where(eq(schema.products.brand, b.slug));
  if (used.n > 0) redirect("/admin/brands?e=2");
  await db.delete(schema.brands).where(eq(schema.brands.id, b.id)); await audit("deleteBrand", tgt(d)); refresh("brands", "products"); redirect("/admin/brands");
}
export async function saveCategory(d: FormData) {
  await requireAdmin(); if (!db) return;
  const label = f(d, "label"), slug = slugify(f(d, "slug") || label), icon = f(d, "icon"), tone = f(d, "tone"), parentSlug = slugify(f(d, "parent"));
  if (!label || !slug || !(categoryIcons as readonly string[]).includes(icon) || !(tone in toneClass)) redirect("/admin/categories?e=1");
  const position = Math.round(Number(f(d, "position"))) || 0;
  const all = await db.select({ id: schema.categories.id, slug: schema.categories.slug, parentId: schema.categories.parentId }).from(schema.categories);
  const self = all.find((c) => c.slug === slug), parent = parentSlug ? all.find((c) => c.slug === parentSlug) : undefined;
  if (parentSlug && !parent) redirect("/admin/categories?e=4");
  if (self && parent && parentCreatesCycle(all, self.id, parent.id)) redirect("/admin/categories?e=5");
  const parentId = parent?.id ?? null;
  await db.insert(schema.categories).values({ slug, label, icon, tone, position, parentId }).onConflictDoUpdate({ target: schema.categories.slug, set: { label, icon, tone, position, parentId } });
  await audit("saveCategory", tgt(d)); refresh("categories", "products"); redirect("/admin/categories");
}
export async function deleteCategory(d: FormData) {
  await requireAdmin(); if (!db) return;
  const [c] = await db.select().from(schema.categories).where(eq(schema.categories.id, f(d, "id"))); if (!c) redirect("/admin/categories");
  const [used] = await db.select({ n: count() }).from(schema.products).where(eq(schema.products.category, c.slug));
  if (used.n > 0) redirect("/admin/categories?e=2");
  const [kids] = await db.select({ n: count() }).from(schema.categories).where(eq(schema.categories.parentId, c.id));
  if (kids.n > 0) redirect("/admin/categories?e=3");
  await db.delete(schema.categories).where(eq(schema.categories.id, c.id)); await audit("deleteCategory", tgt(d)); refresh("categories", "products"); redirect("/admin/categories");
}
export async function deleteMerchant(d: FormData) {
  await requireAdmin(); if (!db) return;
  const [u] = await db.select({ n: count() }).from(schema.offers).where(eq(schema.offers.merchantId, f(d, "id")));
  if (u.n > 0) redirect("/admin/merchants?e=2");
  await db.delete(schema.merchants).where(eq(schema.merchants.id, f(d, "id"))); await audit("deleteMerchant", tgt(d)); refresh("products", "deals", "coupons"); redirect("/admin/merchants");
}
export async function deleteCollection(d: FormData) {
  await requireAdmin(); if (!db) return;
  await db.delete(schema.collections).where(eq(schema.collections.id, f(d, "id"))); await audit("deleteCollection", tgt(d)); refresh("collections"); redirect("/admin/collections");
}


// ---- Products ---------------------------------------------------------------------------------------------
const productFields = (d: FormData) => ({
  name: f(d, "name"), slug: slugify(f(d, "slug") || f(d, "name")), brand: slugify(f(d, "brand")), category: f(d, "category"), blurb: f(d, "blurb"),
  price: Math.round(Number(f(d, "price"))), mrp: Number(f(d, "mrp")) || null, status: f(d, "status") === "draft" ? "draft" : "published",
  featured: d.get("featured") === "on", seoTitle: f(d, "seo_title").slice(0, 70) || null, seoDescription: f(d, "seo_description").slice(0, 170) || null,
});
const productValid = async (p: ReturnType<typeof productFields>) => !!p.name && !!p.slug && p.price > 0 && (!p.mrp || p.mrp > p.price) && (await loadCategories()).some((c) => c.slug === p.category);
const withQ = (back: string, q: string) => `${back}${back.includes("?") ? "&" : "?"}${q}`;
/** Resolves the brand and category foreign keys. An unknown brand is refused instead of being stored as free text. */
async function productRefs(p: ReturnType<typeof productFields>, back: string) {
  const [c] = await db!.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.slug, p.category));
  const [b] = p.brand ? await db!.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.slug, p.brand)) : [];
  if (p.brand && !b) redirect(withQ(back, "e=7"));
  return { categoryId: c?.id ?? null, brandId: b?.id ?? null };
}
const slugTaken = async (slug: string, exceptId?: string) => (await db!.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.slug, slug))).some((r) => r.id !== exceptId);

export async function createProduct(d: FormData) {
  await requireAdmin(); if (!db) throw new Error("DATABASE_URL not set");
  const p = productFields(d), url = f(d, "url"), merchant = f(d, "merchant") || "Store", back = "/admin/products/new";
  const keep = new URLSearchParams({ name: p.name, slug: f(d, "slug"), brand: p.brand, category: p.category, blurb: p.blurb, price: f(d, "price"), mrp: f(d, "mrp"), merchant, url, status: p.status }).toString();
  if (!(await productValid(p)) || !url.startsWith("https://")) redirect(withQ(back, `e=1&${keep}`));
  if (!(await destinationOk(merchant, url))) redirect(withQ(back, `e=4&${keep}`));
  if (await slugTaken(p.slug)) redirect(withQ(back, `e=6&${keep}`));
  const refs = await productRefs(p, withQ(back, keep));
  const dups = await findDuplicates({ name: p.name, slug: p.slug, urls: [url] });
  if (dups.length && d.get("confirm_duplicate") !== "on") redirect(withQ(back, `e=5&dup=${dups.map((x) => x.slug).join(",")}&${keep}`));
  const image = await imageFrom(d);
  const m = await ensureMerchant(merchant), id = randomUUID();
  // Product and first offer are written together or not at all. The first offer starts from the reference price, unverified.
  await db.batch([db.insert(schema.products).values({ id, ...p, ...refs, imageUrl: image }), db.insert(schema.offers).values({ productId: id, merchant: m.name, merchantId: m.id, url, price: p.price, mrp: p.mrp })]);
  await audit("createProduct", p.slug); refresh("products", "collections"); redirect(`/admin/products/${id}`);
}

export async function updateProduct(d: FormData) {
  await requireAdmin(); if (!db) throw new Error("DATABASE_URL not set");
  const id = f(d, "id"), p = productFields(d), back = `/admin/products/${id}`; if (!UUID.test(id)) redirect("/admin");
  if (!(await productValid(p))) redirect(withQ(back, "e=1"));
  const [old] = await db.select({ slug: schema.products.slug }).from(schema.products).where(eq(schema.products.id, id)); if (!old) redirect("/admin");
  if (p.slug !== old.slug && (await slugTaken(p.slug, id))) redirect(withQ(back, "e=6"));
  const refs = await productRefs(p, back);
  const image = await imageFrom(d);
  await db.update(schema.products).set({ ...p, ...refs, imageUrl: image, updatedAt: new Date() }).where(eq(schema.products.id, id));
  // Old links, bookmarks and search results keep working after a slug change.
  if (p.slug !== old.slug) await addRedirect(`/products/${old.slug}`, `/products/${p.slug}`, "slug changed");
  await audit("updateProduct", p.slug); refresh("products", "collections", "redirects"); redirect(withQ(back, "saved=1"));
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
  refresh("products", "collections"); redirect("/admin");
}

// ---- Offers (one product can have several retailers, each with its own price) -------------------------------------
export async function saveOffer(d: FormData) {
  await requireAdmin(); if (!db) return;
  const productId = f(d, "product_id"), id = f(d, "id"), merchant = f(d, "merchant"), url = f(d, "url"), back = `/admin/products/${productId}`;
  if (!UUID.test(productId)) redirect("/admin");
  const expires = f(d, "expires") ? endOfDay(f(d, "expires")) : null;
  const price = f(d, "price") ? Math.round(Number(f(d, "price"))) : null, mrp = f(d, "mrp") ? Math.round(Number(f(d, "mrp"))) : null;
  if (!merchant || !url.startsWith("https://") || (f(d, "expires") && !expires) || (price !== null && !(price > 0)) || (mrp !== null && (price === null || !(mrp > price)))) redirect(withQ(back, "o=1"));
  if (!(await destinationOk(merchant, url))) redirect(withQ(back, "o=2"));
  const m = await ensureMerchant(merchant);
  const v = { merchant: m.name, merchantId: m.id, url, price, mrp, expiresAt: expires, isActive: d.get("active") === "on", ...(d.get("verified") === "on" ? { lastVerifiedAt: new Date() } : {}), ...(d.get("price_checked") === "on" && price ? { priceCheckedAt: new Date() } : {}) };
  if (UUID.test(id)) await db.update(schema.offers).set(v).where(and(eq(schema.offers.id, id), eq(schema.offers.productId, productId)));
  else await db.insert(schema.offers).values({ productId, ...v });
  await db.update(schema.products).set({ updatedAt: new Date() }).where(eq(schema.products.id, productId));
  await audit("saveOffer", `${productId}:${merchant}`); refresh("products", "collections"); redirect(withQ(back, "saved=1"));
}

/** Marks an offer's link, or a coupon code, as checked today (from the Affiliate links page). */
export async function markVerified(d: FormData) {
  await requireAdmin(); if (!db) return;
  const id = f(d, "id"), kind = f(d, "kind"), back = f(d, "back").startsWith("/admin/links") ? f(d, "back") : "/admin/links"; if (!UUID.test(id)) redirect(back);
  if (kind === "coupon") await db.update(schema.coupons).set({ verifiedAt: new Date() }).where(eq(schema.coupons.id, id));
  else await db.update(schema.offers).set({ lastVerifiedAt: new Date() }).where(eq(schema.offers.id, id));
  await audit("markVerified", `${kind}:${id}`); refresh(kind === "coupon" ? "coupons" : "products"); redirect(back);
}

// ---- Redirects --------------------------------------------------------------------------------------------------
export async function saveRedirect(d: FormData) {
  await requireAdmin(); if (!db) return;
  const plan = await addRedirect(f(d, "from"), f(d, "to"), f(d, "note").slice(0, 200), Number(f(d, "status")));
  if (!plan.ok) redirect(`/admin/redirects?e=${plan.reason}`);
  await audit("saveRedirect", `${plan.from} -> ${plan.to}`); refresh("redirects"); redirect("/admin/redirects?saved=1");
}
export async function deleteRedirect(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id");
  if (UUID.test(id)) await db.delete(schema.redirects).where(eq(schema.redirects.id, id));
  await audit("deleteRedirect", id); refresh("redirects"); redirect("/admin/redirects");
}

// ---- Deals and coupons -------------------------------------------------------------------------------------
export async function createDeal(d: FormData) {
  await requireAdmin(); if (!db) return;
  const title = f(d, "title"), url = f(d, "url"), ends = f(d, "ends"), expiresAt = ends ? endOfDay(ends) : null;
  if (!title || !url.startsWith("https://") || (ends && !expiresAt)) redirect("/admin/content?e=1");
  if (!(await destinationOk(f(d, "merchant"), url))) redirect("/admin/content?e=4");
  const base = slugify(title).slice(0, 50) || "deal", taken = new Set((await db.select({ s: schema.deals.slug }).from(schema.deals).where(like(schema.deals.slug, `${base}%`))).map((r) => r.s));
  await db.insert(schema.deals).values({ title, merchant: f(d, "merchant"), url, ends, expiresAt, slug: dealSlug(title, (x) => taken.has(x)), description: f(d, "description").slice(0, 400) }); await audit("createDeal", title); refresh("deals"); redirect("/admin/content");
}
export async function updateDeal(d: FormData) {
  await requireAdmin(); if (!db) return;
  const title = f(d, "title"), url = f(d, "url"), ends = f(d, "ends"), expiresAt = ends ? endOfDay(ends) : null;
  if (!UUID.test(f(d, "id")) || !title || !url.startsWith("https://") || (ends && !expiresAt)) redirect("/admin/content?e=1");
  if (!(await destinationOk(f(d, "merchant"), url))) redirect("/admin/content?e=4");
  await db.update(schema.deals).set({ title, merchant: f(d, "merchant"), url, ends, expiresAt, description: f(d, "description").slice(0, 400), isActive: d.get("active") !== null ? d.get("active") === "on" : true, updatedAt: new Date() }).where(eq(schema.deals.id, f(d, "id")));
  await audit("updateDeal", title); refresh("deals"); redirect("/admin/content");
}
export async function createCoupon(d: FormData) {
  await requireAdmin(); if (!db) return;
  const code = f(d, "code"), url = f(d, "url"), expires = f(d, "expires"), expiresAt = expires ? endOfDay(expires) : null;
  if (!code || !url.startsWith("https://") || (expires && !expiresAt)) redirect("/admin/content?e=1");
  if (!(await destinationOk(f(d, "merchant"), url))) redirect("/admin/content?e=4");
  await db.insert(schema.coupons).values({ code, merchant: f(d, "merchant"), detail: f(d, "detail"), url, expiresAt, verifiedAt: d.get("verified") === "on" ? new Date() : null });
  await audit("createCoupon", code); refresh("coupons"); redirect("/admin/content");
}
export async function updateCoupon(d: FormData) {
  await requireAdmin(); if (!db) return;
  const code = f(d, "code"), url = f(d, "url"), expires = f(d, "expires"), expiresAt = expires ? endOfDay(expires) : null;
  if (!UUID.test(f(d, "id")) || !code || !url.startsWith("https://") || (expires && !expiresAt)) redirect("/admin/content?e=1");
  if (!(await destinationOk(f(d, "merchant"), url))) redirect("/admin/content?e=4");
  await db.update(schema.coupons).set({ code, merchant: f(d, "merchant"), detail: f(d, "detail"), url, expiresAt, isActive: d.get("active") !== null ? d.get("active") === "on" : true, ...(d.get("verified") === "on" ? { verifiedAt: new Date() } : {}) }).where(eq(schema.coupons.id, f(d, "id")));
  await audit("updateCoupon", code); refresh("coupons"); redirect("/admin/content");
}

// ---- Merchants ---------------------------------------------------------------------------------------------
export async function saveMerchant(d: FormData) {
  await requireAdmin(); if (!db) return;
  const id = f(d, "id"), name = f(d, "name"), website = f(d, "website"), domains = parseDomains(f(d, "approved_domains"));
  if (!UUID.test(id) || !name || (website && !website.startsWith("https://"))) redirect("/admin/merchants?e=1");
  await db.update(schema.merchants).set({ name, website, approvedDomains: domains.join(", "), isActive: d.get("active") === "on" }).where(eq(schema.merchants.id, id));
  await db.update(schema.offers).set({ merchant: name }).where(eq(schema.offers.merchantId, id));
  await audit("saveMerchant", name); refresh("products", "deals", "coupons"); redirect("/admin/merchants");
}

// ---- Collections (atomic: the collection and its product list change together) ---------------------------------
export async function saveCollection(d: FormData) {
  await requireAdmin(); if (!db) return;
  const id = f(d, "id"), title = f(d, "title"), slug = slugify(f(d, "slug") || title); if (!title || !slug) redirect("/admin/collections?e=1");
  const v = { slug, title, description: f(d, "description"), position: Math.round(Number(f(d, "position"))) || 0 };
  const cid = UUID.test(id) ? id : randomUUID();
  const old = UUID.test(id) ? (await db.select({ slug: schema.collections.slug }).from(schema.collections).where(eq(schema.collections.id, id)))[0] : undefined;
  const ids = [...new Set(d.getAll("products").map(String).filter((x) => UUID.test(x)))];
  await db.batch([
    UUID.test(id) ? db.update(schema.collections).set(v).where(eq(schema.collections.id, cid)) : db.insert(schema.collections).values({ id: cid, ...v }).onConflictDoUpdate({ target: schema.collections.slug, set: v }),
    db.delete(schema.collectionProducts).where(eq(schema.collectionProducts.collectionId, cid)),
    ...(ids.length ? [db.insert(schema.collectionProducts).values(ids.map((productId, position) => ({ collectionId: cid, productId, position })))] : []),
  ] as unknown as [never, ...never[]]);
  if (old && old.slug !== slug) await addRedirect(`/collections/${old.slug}`, `/collections/${slug}`, "slug changed");
  await audit("saveCollection", slug); refresh("collections", "redirects"); redirect("/admin/collections");
}

// ---- CSV import: upload -> preview -> confirm -----------------------------------------------------------------
export async function previewImport(d: FormData) {
  await requireAdmin(); if (!db) return;
  const kind = f(d, "kind") in IMPORT_KINDS ? (f(d, "kind") as ImportKind) : "products";
  const file = d.get("file"); if (!(file instanceof File) || file.size === 0 || file.size > 1_000_000) redirect("/admin/import?e=1");
  try { await db.execute(sql`DELETE FROM import_staging WHERE created_at < now() - interval '1 day'`); } catch {}
  const [row] = await db.insert(schema.importStaging).values({ kind, csv: await file.text() }).returning({ id: schema.importStaging.id });
  redirect(`/admin/import?stage=${row.id}`);
}
export async function cancelImport(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "stage");
  if (UUID.test(id)) await db.delete(schema.importStaging).where(eq(schema.importStaging.id, id));
  redirect("/admin/import");
}
/**
 * Re-reads the staged file and re-validates it on the server (nothing from the browser is trusted), then writes it in
 * atomic chunks of IMPORT_CHUNK rows. A failure in a later chunk leaves earlier chunks saved; the staged file is kept,
 * and re-running is safe because existing rows are skipped (or updated, if ticked).
 */
export async function confirmImport(d: FormData) {
  await requireAdmin(); if (!db) return;
  const stage = f(d, "stage"), allowUpdate = d.get("update") === "on"; if (!UUID.test(stage)) redirect("/admin/import?e=1");
  const [st] = await db.select().from(schema.importStaging).where(eq(schema.importStaging.id, stage)); if (!st) redirect("/admin/import?e=2");
  const kind = (st.kind in IMPORT_KINDS ? st.kind : "products") as ImportKind;
  const plan = await buildImportPlan(kind, st.csv, allowUpdate);
  const todo = orderForImport(kind, plan.items.filter((i) => !i.blocked && i.action !== "skip-existing"));
  if (!todo.length) redirect(`/admin/import?stage=${stage}&e=3`);
  const state = newState();
  for (let i = 0; i < todo.length; i += IMPORT_CHUNK) {
    const stmts = await buildStatements(kind, todo.slice(i, i + IMPORT_CHUNK), state);
    if (stmts.length) await db.batch(stmts as unknown as [never, ...never[]]);
  }
  await db.delete(schema.importStaging).where(eq(schema.importStaging.id, stage));
  await audit("import", `${kind}: ${state.counts.created} created, ${state.counts.updated} updated`); refresh(...TAGS_FOR[kind]);
  redirect(`/admin/import?done=1&kind=${kind}&created=${state.counts.created}&updated=${state.counts.updated}&skipped=${plan.items.length - todo.length + plan.errors.length}`);
}

// ---- Media library ---------------------------------------------------------------------------------------------
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"], MEDIA_MAX_BYTES = 3 * 1024 * 1024;
/**
 * Cost guards: type and size limits, a cap on library size, a hash check so the same picture is never sent twice,
 * and (in lib/cloudinary.ts) a stored-size cap with a hash-derived id so even a lost database row cannot cause duplicates.
 */
export async function uploadMedia(d: FormData) {
  await requireAdmin(); if (!db) return;
  const file = d.get("file"), alt = f(d, "alt").slice(0, 125);
  if (!(file instanceof File) || file.size === 0) redirect("/admin/media?e=file");
  if (!MEDIA_TYPES.includes(file.type)) redirect("/admin/media?e=type"); if (file.size > MEDIA_MAX_BYTES) redirect("/admin/media?e=size"); if (!alt) redirect("/admin/media?e=alt");
  if (!getProvider().configured()) redirect("/admin/media?e=config");
  const hash = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
  const [dup] = await db.select({ id: schema.media.id }).from(schema.media).where(eq(schema.media.hash, hash)); if (dup) redirect(`/admin/media?dup=${dup.id}`);
  const [n] = await db.select({ n: count() }).from(schema.media); if (n.n >= mediaMaxItems()) redirect("/admin/media?e=limit");
  let up; try { up = await getProvider().upload(file, hash); } catch { redirect("/admin/media?e=upload"); }
  await db.insert(schema.media).values({ publicId: up.publicId, hash, alt, width: up.width, height: up.height, bytes: up.bytes, format: up.format }).onConflictDoUpdate({ target: schema.media.publicId, set: { hash, alt } });
  await audit("uploadMedia", up.publicId); refresh("media"); redirect("/admin/media?saved=1");
}
export async function saveMediaAlt(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id"), alt = f(d, "alt").slice(0, 125);
  if (!UUID.test(id) || !alt) redirect("/admin/media?e=alt");
  await db.update(schema.media).set({ alt }).where(eq(schema.media.id, id)); refresh("media"); redirect(f(d, "back").startsWith("/admin/media") ? f(d, "back") : "/admin/media");
}
/** Deletes an UNUSED image from Cloudinary (giving the storage back) and from the library. */
export async function deleteMedia(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id");
  const [m] = UUID.test(id) ? await db.select().from(schema.media).where(eq(schema.media.id, id)) : []; if (!m) redirect("/admin/media");
  if ((await mediaUsage(id)) > 0) redirect("/admin/media?e=used");
  try { await getProvider().destroy(m.publicId); } catch { redirect("/admin/media?e=remote"); }
  await db.delete(schema.media).where(eq(schema.media.id, id)); await audit("deleteMedia", m.publicId); refresh("media"); redirect("/admin/media?deleted=1");
}

// ---- Journal ----------------------------------------------------------------------------------------------------
const pruneRevisions = (articleId: string) => db!.delete(schema.articleRevisions).where(and(eq(schema.articleRevisions.articleId, articleId),
  sql`${schema.articleRevisions.id} not in (select id from article_revisions where article_id = ${articleId} order by created_at desc, id desc limit ${MAX_REVISIONS})`));

/** Saves an article. The previous text is kept as a revision (only the last MAX_REVISIONS are ever stored). */
export async function saveArticle(d: FormData) {
  await requireAdmin(); if (!db) return;
  const id = f(d, "id"), isNew = !UUID.test(id), back = isNew ? "/admin/articles/new" : `/admin/articles/${id}`;
  const c = cleanArticle({ title: f(d, "title"), slug: f(d, "slug"), excerpt: f(d, "excerpt"), body: String(d.get("body") ?? ""), author: f(d, "author"), seoTitle: f(d, "seo_title"), seoDescription: f(d, "seo_description") });
  if (!c.ok) redirect(withQ(back, `e=${c.error}`)); const v = c.value;
  const [clash] = await db.select({ id: schema.articles.id }).from(schema.articles).where(eq(schema.articles.slug, v.slug)); if (clash && clash.id !== id) redirect(withQ(back, "e=slug-taken"));
  const [catClash] = await db.select({ id: schema.articleCategories.id }).from(schema.articleCategories).where(eq(schema.articleCategories.slug, v.slug)); if (catClash) redirect(withQ(back, "e=slug-category"));
  const rawWhen = f(d, "publish_at"), publishAt = parsePublishAt(rawWhen); if (rawWhen && !publishAt) redirect(withQ(back, "e=date"));
  const status = f(d, "status") === "published" ? "published" : "draft";
  const [cat] = f(d, "category") ? await db.select({ id: schema.articleCategories.id }).from(schema.articleCategories).where(eq(schema.articleCategories.slug, f(d, "category"))) : [];
  const [cover] = UUID.test(f(d, "cover_media_id")) ? await db.select({ id: schema.media.id }).from(schema.media).where(eq(schema.media.id, f(d, "cover_media_id"))) : [];
  const [old] = isNew ? [] : await db.select().from(schema.articles).where(eq(schema.articles.id, id)); if (!isNew && !old) redirect("/admin/articles");
  const row = { slug: v.slug, title: v.title, excerpt: v.excerpt, body: v.body, author: v.author, seoTitle: v.seoTitle, seoDescription: v.seoDescription, status, publishAt, categoryId: cat?.id ?? null, coverMediaId: cover?.id ?? null,
    tags: cleanTags(f(d, "tags")), productSlugs: deriveFromBody(v.body).productSlugs, date: publishAt ? istDate(publishAt) : old?.date ?? istDate(new Date()), updatedAt: new Date() };
  if (isNew) {
    const [made] = await db.insert(schema.articles).values(row).returning({ id: schema.articles.id });
    await audit("createArticle", v.slug); refresh("articles"); redirect(`/admin/articles/${made.id}?saved=1`);
  }
  const changed = old.title !== v.title || old.excerpt !== v.excerpt || old.body !== v.body;
  await db.batch([
    ...(changed ? [db.insert(schema.articleRevisions).values({ articleId: id, title: old.title, excerpt: old.excerpt, body: old.body })] : []),
    db.update(schema.articles).set(row).where(eq(schema.articles.id, id)),
    ...(changed ? [pruneRevisions(id)] : []),
  ] as unknown as [never, ...never[]]);
  if (old.slug !== v.slug) await addRedirect(`/journal/${old.slug}`, `/journal/${v.slug}`, "slug changed");
  await audit("updateArticle", v.slug); refresh("articles", "redirects"); redirect(`/admin/articles/${id}?saved=1`);
}
/** Puts an older version back. The current text becomes a revision first, so a restore can itself be undone. */
export async function restoreRevision(d: FormData) {
  await requireAdmin(); if (!db) return; const rid = f(d, "revision");
  const [rev] = UUID.test(rid) ? await db.select().from(schema.articleRevisions).where(eq(schema.articleRevisions.id, rid)) : []; if (!rev) redirect("/admin/articles");
  const [cur] = await db.select().from(schema.articles).where(eq(schema.articles.id, rev.articleId)); if (!cur) redirect("/admin/articles");
  await db.batch([
    db.insert(schema.articleRevisions).values({ articleId: cur.id, title: cur.title, excerpt: cur.excerpt, body: cur.body }),
    db.update(schema.articles).set({ title: rev.title, excerpt: rev.excerpt, body: rev.body, productSlugs: deriveFromBody(rev.body).productSlugs, updatedAt: new Date() }).where(eq(schema.articles.id, cur.id)),
    db.delete(schema.articleRevisions).where(eq(schema.articleRevisions.id, rev.id)), pruneRevisions(cur.id),
  ] as unknown as [never, ...never[]]);
  await audit("restoreRevision", cur.slug); refresh("articles"); redirect(`/admin/articles/${cur.id}?restored=1`);
}
export async function deleteArticle(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id");
  if (UUID.test(id)) { const [a] = await db.select({ slug: schema.articles.slug }).from(schema.articles).where(eq(schema.articles.id, id)); await db.delete(schema.articles).where(eq(schema.articles.id, id)); await audit("deleteArticle", a?.slug ?? id); }
  refresh("articles"); redirect("/admin/articles?deleted=1");
}
export async function saveArticleCategory(d: FormData) {
  await requireAdmin(); if (!db) return;
  const id = f(d, "id"), name = f(d, "name").slice(0, 60), slug = slugify(f(d, "slug") || name), position = Math.round(Number(f(d, "position"))) || 0;
  if (!name || !slug) redirect("/admin/articles/categories?e=name");
  const [art] = await db.select({ id: schema.articles.id }).from(schema.articles).where(eq(schema.articles.slug, slug)); if (art) redirect("/admin/articles/categories?e=slug");
  const v = { name, slug, description: f(d, "description").slice(0, 300), position };
  if (UUID.test(id)) await db.update(schema.articleCategories).set(v).where(eq(schema.articleCategories.id, id)); else await db.insert(schema.articleCategories).values(v).onConflictDoUpdate({ target: schema.articleCategories.slug, set: v });
  await audit("saveArticleCategory", slug); refresh("articles"); redirect("/admin/articles/categories?saved=1");
}
export async function deleteArticleCategory(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id");
  if (UUID.test(id)) await db.delete(schema.articleCategories).where(eq(schema.articleCategories.id, id));
  await audit("deleteArticleCategory", id); refresh("articles"); redirect("/admin/articles/categories");
}

// ---- Homepage sections -------------------------------------------------------------------------------------------
export async function createDefaultHome() {
  await requireAdmin(); if (!db) return;
  const [n] = await db.select({ n: count() }).from(schema.homeSections);
  if (!n.n) await db.insert(schema.homeSections).values(DEFAULT_LAYOUT.map((s, position) => ({ type: s.type, position, config: s.config })));
  await audit("createDefaultHome", ""); refresh("home"); redirect("/admin/home");
}
export async function resetHome() { await requireAdmin(); if (!db) return; await db.delete(schema.homeSections); await audit("resetHome", ""); refresh("home"); redirect("/admin/home"); }
export async function addHomeSection(d: FormData) {
  await requireAdmin(); if (!db) return; const type = f(d, "type"); if (!isSectionType(type)) redirect("/admin/home");
  const [n] = await db.select({ n: count() }).from(schema.homeSections); if (n.n >= MAX_SECTIONS) redirect("/admin/home?e=limit");
  const [made] = await db.insert(schema.homeSections).values({ type, position: n.n, config: {} }).returning({ id: schema.homeSections.id });
  await audit("addHomeSection", type); refresh("home"); redirect(`/admin/home/${made.id}`);
}
export async function saveHomeSection(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id"), back = `/admin/home/${id}`;
  const [row] = UUID.test(id) ? await db.select().from(schema.homeSections).where(eq(schema.homeSections.id, id)) : []; if (!row || !isSectionType(row.type)) redirect("/admin/home");
  const raw: Record<string, string | undefined> = {}; for (const fd of (SECTION_TYPES[row.type] as SectionDef).fields) raw[fd.key] = d.get(fd.key) === null ? undefined : String(d.get(fd.key));
  const c = cleanConfig(row.type, raw); if (!c.ok) redirect(`${back}?e=${c.field}&why=${encodeURIComponent(c.reason)}`);
  const pub = f(d, "publish_at"), unpub = f(d, "unpublish_at"), publishAt = pub ? parsePublishAt(pub) : null, unpublishAt = unpub ? parsePublishAt(unpub) : null;
  if ((pub && !publishAt) || (unpub && !unpublishAt) || (publishAt && unpublishAt && unpublishAt <= publishAt)) redirect(`${back}?e=dates`);
  await db.update(schema.homeSections).set({ config: c.config, enabled: d.get("enabled") === "on", publishAt, unpublishAt }).where(eq(schema.homeSections.id, id));
  await audit("saveHomeSection", row.type); refresh("home", "media"); redirect(`${back}?saved=1`);
}
export async function moveHomeSection(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id"), dir = f(d, "dir") === "up" ? -1 : 1;
  const rows = await db.select().from(schema.homeSections).orderBy(asc(schema.homeSections.position), asc(schema.homeSections.id));
  const i = rows.findIndex((r) => r.id === id), j = i + dir; if (i < 0 || j < 0 || j >= rows.length) redirect("/admin/home");
  [rows[i], rows[j]] = [rows[j], rows[i]];
  await db.batch(rows.map((r, position) => db!.update(schema.homeSections).set({ position }).where(eq(schema.homeSections.id, r.id))) as unknown as [never, ...never[]]);
  refresh("home"); redirect("/admin/home");
}
export async function deleteHomeSection(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id"); if (UUID.test(id)) await db.delete(schema.homeSections).where(eq(schema.homeSections.id, id));
  await audit("deleteHomeSection", id); refresh("home"); redirect("/admin/home");
}

// ---- Gift occasions and curated comparisons ---------------------------------------------------------------------
export async function saveOccasion(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id");
  const c = cleanOccasion({ title: f(d, "title"), slug: f(d, "slug"), intro: f(d, "intro"), categories: f(d, "categories"), min: f(d, "min_price"), max: f(d, "max_price"), query: f(d, "query"), position: f(d, "position"), enabled: d.get("enabled") === "on" });
  if (!c.ok) redirect(`/admin/occasions?e=${c.error}`);
  if (UUID.test(id)) await db.update(schema.giftOccasions).set(c.value).where(eq(schema.giftOccasions.id, id)); else await db.insert(schema.giftOccasions).values(c.value).onConflictDoUpdate({ target: schema.giftOccasions.slug, set: c.value });
  await audit("saveOccasion", c.value.slug); refresh("occasions"); redirect("/admin/occasions?saved=1");
}
export async function deleteOccasion(d: FormData) { await requireAdmin(); if (!db) return; const id = f(d, "id"); if (UUID.test(id)) await db.delete(schema.giftOccasions).where(eq(schema.giftOccasions.id, id)); refresh("occasions"); redirect("/admin/occasions"); }
export async function saveComparison(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id");
  const c = cleanComparison({ title: f(d, "title"), slug: f(d, "slug"), intro: f(d, "intro"), verdict: String(d.get("verdict") ?? ""), products: f(d, "products"), status: f(d, "status") });
  if (!c.ok) redirect(`/admin/comparisons?e=${c.error}`);
  const v = { ...c.value, updatedAt: new Date() };
  const old = UUID.test(id) ? (await db.select({ slug: schema.comparisons.slug }).from(schema.comparisons).where(eq(schema.comparisons.id, id)))[0] : undefined;
  if (UUID.test(id)) await db.update(schema.comparisons).set(v).where(eq(schema.comparisons.id, id)); else await db.insert(schema.comparisons).values(v).onConflictDoUpdate({ target: schema.comparisons.slug, set: v });
  if (old && old.slug !== v.slug) await addRedirect(`/compare/${old.slug}`, `/compare/${v.slug}`, "slug changed");
  await audit("saveComparison", v.slug); refresh("comparisons", "redirects"); redirect("/admin/comparisons?saved=1");
}
export async function deleteComparison(d: FormData) { await requireAdmin(); if (!db) return; const id = f(d, "id"); if (UUID.test(id)) await db.delete(schema.comparisons).where(eq(schema.comparisons.id, id)); refresh("comparisons"); redirect("/admin/comparisons"); }

export async function runMaintenanceNow() {
  await requireAdmin(); if (!db) return; const r = await runMaintenance();
  await audit("maintenance", `${r.clicksRolledUp} clicks rolled up`); redirect(`/admin/costs?ran=1&clicks=${r.clicksRolledUp}&audit=${r.auditDeleted}&login=${r.loginDeleted}&staging=${r.stagingDeleted}`);
}
