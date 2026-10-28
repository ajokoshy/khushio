"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkLogin, endSession, requireAdmin, startSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { categories } from "@/lib/config/site";

const f = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const refresh = () => revalidatePath("/", "layout");

export async function login(d: FormData) {
  if (!checkLogin(f(d, "email"), f(d, "password"))) redirect("/admin/login?e=1");
  await startSession(); redirect("/admin");
}
export async function logout() { await endSession(); redirect("/admin/login"); }

export async function createProduct(d: FormData) {
  await requireAdmin(); if (!db) throw new Error("DATABASE_URL not set");
  const name = f(d, "name"), url = f(d, "url"), price = Math.round(Number(f(d, "price")));
  const category = f(d, "category"), mrp = Number(f(d, "mrp")) || null;
  if (!name || !price || price < 0 || !url.startsWith("https://") || !categories.some((c) => c.slug === category)) redirect("/admin/products/new?e=1");
  const [row] = await db.insert(schema.products).values({ slug: slugify(f(d, "slug") || name), name, brand: slugify(f(d, "brand")), category, blurb: f(d, "blurb"), price, mrp, status: f(d, "status") === "draft" ? "draft" : "published" }).returning();
  await db.insert(schema.offers).values({ productId: row.id, merchant: f(d, "merchant") || "Store", url });
  refresh(); redirect("/admin");
}
export async function toggleStatus(d: FormData) {
  await requireAdmin(); if (!db) return;
  await db.update(schema.products).set({ status: f(d, "status") === "published" ? "draft" : "published" }).where(eq(schema.products.id, f(d, "id"))); refresh(); redirect("/admin");
}
export async function deleteProduct(d: FormData) {
  await requireAdmin(); if (!db) return;
  await db.delete(schema.products).where(eq(schema.products.id, f(d, "id"))); refresh(); redirect("/admin");
}

export async function updateProduct(d: FormData) {
  await requireAdmin(); if (!db) throw new Error("DATABASE_URL not set");
  const id = f(d, "id"), name = f(d, "name"), url = f(d, "url"), price = Math.round(Number(f(d, "price"))), category = f(d, "category");
  if (!name || !price || price < 0 || !url.startsWith("https://") || !categories.some((c) => c.slug === category)) redirect(`/admin/products/${id}?e=1`);
  await db.update(schema.products).set({ slug: slugify(f(d, "slug") || name), name, brand: slugify(f(d, "brand")), category, blurb: f(d, "blurb"), price, mrp: Number(f(d, "mrp")) || null, status: f(d, "status") === "draft" ? "draft" : "published" }).where(eq(schema.products.id, id));
  const merchant = f(d, "merchant") || "Store";
  const upd = await db.update(schema.offers).set({ merchant, url }).where(eq(schema.offers.productId, id)).returning({ id: schema.offers.id });
  if (!upd.length) await db.insert(schema.offers).values({ productId: id, merchant, url });
  refresh(); redirect("/admin");
}
const https = (u: string) => (u.startsWith("https://") ? u : redirect("/admin/content?e=1"));
export async function createDeal(d: FormData) {
  await requireAdmin(); if (!db) return;
  await db.insert(schema.deals).values({ title: f(d, "title") || redirect("/admin/content?e=1"), merchant: f(d, "merchant"), url: https(f(d, "url")), ends: f(d, "ends") }); refresh(); redirect("/admin/content");
}
export async function createCoupon(d: FormData) {
  await requireAdmin(); if (!db) return;
  await db.insert(schema.coupons).values({ code: f(d, "code") || redirect("/admin/content?e=1"), merchant: f(d, "merchant"), detail: f(d, "detail"), url: https(f(d, "url")) }); refresh(); redirect("/admin/content");
}
export async function createArticle(d: FormData) {
  await requireAdmin(); if (!db) return;
  const title = f(d, "title"), body = f(d, "body"); if (!title || !body) redirect("/admin/content?e=1");
  await db.insert(schema.articles).values({ slug: slugify(f(d, "slug") || title), title, excerpt: f(d, "excerpt"), body, date: new Date().toISOString().slice(0, 10) }); refresh(); redirect("/admin/content");
}
export async function deleteContent(d: FormData) {
  await requireAdmin(); if (!db) return; const id = f(d, "id"), t = f(d, "table");
  if (t === "deals") await db.delete(schema.deals).where(eq(schema.deals.id, id));
  else if (t === "coupons") await db.delete(schema.coupons).where(eq(schema.coupons.id, id));
  else if (t === "articles") await db.delete(schema.articles).where(eq(schema.articles.id, id));
  refresh(); redirect("/admin/content");
}
