import { desc, eq } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { db, schema } from "@/lib/db";
const esc = (v: unknown) => { let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
const csv = (head: string[], rows: unknown[][]) => [head.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  if (!db) return new Response("No database", { status: 503 });
  const { kind } = await params; let body: string;
  if (kind === "products") {
    const rows = await db.select().from(schema.products).leftJoin(schema.offers, eq(schema.offers.productId, schema.products.id));
    body = csv(["slug", "name", "brand", "category", "blurb", "price", "mrp", "status", "merchant", "url"], rows.map((r) => [r.products.slug, r.products.name, r.products.brand, r.products.category, r.products.blurb, r.products.price, r.products.mrp, r.products.status, r.offers?.merchant, r.offers?.url]));
  } else if (kind === "clicks") {
    const rows = await db.select().from(schema.clicks).orderBy(desc(schema.clicks.at)).limit(50000);
    body = csv(["at", "offer_id", "referrer"], rows.map((r) => [r.at, r.offerId, r.referrer]));
  } else return new Response("Not found", { status: 404 });
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="khushio-${kind}.csv"`, "cache-control": "no-store" } });
}
