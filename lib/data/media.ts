import { inArray, sql } from "drizzle-orm";
import { cached } from "@/lib/cache";
import { db, schema } from "@/lib/db";

export type MediaInfo = { id: string; publicId: string; alt: string; width: number | null; height: number | null };
export type MediaRow = MediaInfo & { bytes: number | null; format: string | null; createdAt: string | null; used: number };
const UUID = /^[0-9a-f-]{36}$/i;

/** Delivery info for a set of media ids (one batched lookup per page render), cached under the "media" tag. */
export const loadMediaMap = cached(async (ids: string[]): Promise<Record<string, MediaInfo>> => {
  const want = [...new Set(ids.filter((i) => UUID.test(i)))].slice(0, 100);
  if (!db || !want.length) return {};
  const rows = await db.select({ id: schema.media.id, publicId: schema.media.publicId, alt: schema.media.alt, width: schema.media.width, height: schema.media.height }).from(schema.media).where(inArray(schema.media.id, want));
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}, "media-map", ["media"], 21600);

/** How many places use each image (products, articles, pages, homepage sections). Used to keep in-use images from being deleted. */
const USAGE = sql`(
  (select count(*) from products p where p.image_url = m.public_id or p.image_url like '%' || m.public_id || '%')
  + (select count(*) from articles a where a.cover_media_id = m.id or a.body like '%media:' || m.id::text || '%')
  + (select count(*) from pages g where g.body like '%media:' || m.id::text || '%')
  + (select count(*) from home_sections h where h.config::text like '%' || m.id::text || '%')
)::int`;

export async function mediaUsage(id: string): Promise<number> {
  if (!db || !UUID.test(id)) return 0;
  return Number(((await db.execute(sql`select ${USAGE} as n from media m where m.id = ${id}`)).rows as { n: number }[])[0]?.n ?? 0);
}

const PAGE = 24;
export async function listMedia({ page = 1, q = "", unused = false }: { page?: number; q?: string; unused?: boolean }) {
  if (!db) return { items: [] as MediaRow[], total: 0, pages: 1, page: 1 };
  const term = q.trim().slice(0, 60).replace(/[\\%_]/g, ""), where = [sql`true`];
  if (term) where.push(sql`(m.alt ilike ${`%${term}%`} or m.public_id ilike ${`%${term}%`})`);
  if (unused) where.push(sql`${USAGE} = 0`);
  const w = sql.join(where, sql` and `);
  const total = Number(((await db.execute(sql`select count(*)::int as n from media m where ${w}`)).rows as { n: number }[])[0]?.n ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE)), p = Math.min(Math.max(1, page), pages);
  const rows = (await db.execute(sql`select m.id, m.public_id, m.alt, m.width, m.height, m.bytes, m.format, m.created_at, ${USAGE} as used from media m where ${w} order by m.created_at desc, m.id limit ${PAGE} offset ${(p - 1) * PAGE}`)).rows as Record<string, unknown>[];
  return { total, pages, page: p, items: rows.map((r): MediaRow => ({ id: String(r.id), publicId: String(r.public_id), alt: String(r.alt), width: r.width as number | null, height: r.height as number | null, bytes: r.bytes as number | null, format: r.format as string | null, createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : null, used: Number(r.used) })) };
}

/** Totals for the cost panel: how many images and how many bytes Cloudinary stores for us. */
export async function mediaStats(): Promise<{ count: number; bytes: number; unused: number }> {
  if (!db) return { count: 0, bytes: 0, unused: 0 };
  const r = ((await db.execute(sql`select count(*)::int as n, coalesce(sum(m.bytes),0)::bigint as b, count(*) filter (where ${USAGE} = 0)::int as u from media m`)).rows as { n: number; b: string; u: number }[])[0];
  return { count: Number(r?.n ?? 0), bytes: Number(r?.b ?? 0), unused: Number(r?.u ?? 0) };
}

/** Most recent images for the picker. */
export async function recentMedia(limit = 36): Promise<MediaInfo[]> {
  if (!db) return [];
  return db.select({ id: schema.media.id, publicId: schema.media.publicId, alt: schema.media.alt, width: schema.media.width, height: schema.media.height }).from(schema.media).orderBy(sql`created_at desc`).limit(limit);
}
