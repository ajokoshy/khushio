import { asc, desc, eq } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { toCsv as csv } from "@/lib/csv";
import { db, schema } from "@/lib/db";

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
/** CSV of one table. The first six kinds use the same columns as the importer, so an export can be edited and re-imported. */
export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  if (!db) return new Response("No database", { status: 503 });
  const { kind } = await params; let body: string;
  if (kind === "products") {
    const rows = await db.select().from(schema.products).leftJoin(schema.offers, eq(schema.offers.productId, schema.products.id)).orderBy(asc(schema.products.createdAt), asc(schema.offers.createdAt));
    const seen = new Set<string>(), first = rows.filter((r) => !seen.has(r.products.id) && !!seen.add(r.products.id));
    body = csv(["slug", "name", "brand", "category", "blurb", "price", "mrp", "status", "merchant", "url"], first.map((r) => [r.products.slug, r.products.name, r.products.brand, r.products.category, r.products.blurb, r.offers?.price ?? r.products.price, r.offers?.mrp ?? r.products.mrp, r.products.status, r.offers?.merchant, r.offers?.url]));
  } else if (kind === "offers") {
    const rows = await db.select({ o: schema.offers, slug: schema.products.slug }).from(schema.offers).innerJoin(schema.products, eq(schema.offers.productId, schema.products.id)).orderBy(asc(schema.products.slug), asc(schema.offers.createdAt));
    body = csv(["product_slug", "merchant", "url", "price", "mrp", "active", "expires", "price_checked"], rows.map(({ o, slug }) => [slug, o.merchant, o.url, o.price, o.mrp, o.isActive ? "yes" : "no", day(o.expiresAt), ""]));
  } else if (kind === "merchants") {
    body = csv(["name", "slug", "website", "approved_domains", "active"], (await db.select().from(schema.merchants).orderBy(asc(schema.merchants.name))).map((m) => [m.name, m.slug, m.website, m.approvedDomains, m.isActive ? "yes" : "no"]));
  } else if (kind === "brands") {
    body = csv(["name", "slug", "about"], (await db.select().from(schema.brands).orderBy(asc(schema.brands.name))).map((b) => [b.name, b.slug, b.about]));
  } else if (kind === "categories") {
    const rows = await db.select().from(schema.categories).orderBy(asc(schema.categories.position)), slugOf = new Map(rows.map((c) => [c.id, c.slug]));
    body = csv(["label", "slug", "icon", "tone", "position", "parent"], rows.map((c) => [c.label, c.slug, c.icon, c.tone, c.position, c.parentId ? slugOf.get(c.parentId) : ""]));
  } else if (kind === "articles") {
    body = csv(["title", "slug", "excerpt", "date", "body"], (await db.select().from(schema.articles).orderBy(desc(schema.articles.createdAt))).map((a) => [a.title, a.slug, a.excerpt, a.date, a.body]));
  } else if (kind === "redirects") {
    body = csv(["from", "to", "status", "note"], (await db.select().from(schema.redirects).orderBy(asc(schema.redirects.fromPath))).map((r) => [r.fromPath, r.toPath, r.status, r.note]));
  } else if (kind === "deals") {
    body = csv(["title", "merchant", "url", "ends", "active"], (await db.select().from(schema.deals).orderBy(desc(schema.deals.createdAt))).map((d) => [d.title, d.merchant, d.url, d.ends, d.isActive ? "yes" : "no"]));
  } else if (kind === "coupons") {
    body = csv(["code", "merchant", "detail", "url", "expires", "last_checked", "active"], (await db.select().from(schema.coupons).orderBy(desc(schema.coupons.createdAt))).map((c) => [c.code, c.merchant, c.detail, c.url, day(c.expiresAt), day(c.verifiedAt), c.isActive ? "yes" : "no"]));
  } else if (kind === "clicks") {
    body = csv(["at", "offer_id", "merchant_id", "referrer"], (await db.select().from(schema.clicks).orderBy(desc(schema.clicks.at)).limit(50000)).map((r) => [r.at, r.offerId, r.merchantId, r.referrer]));
  } else return new Response("Not found", { status: 404 });
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="khushio-${kind}.csv"`, "cache-control": "no-store" } });
}
