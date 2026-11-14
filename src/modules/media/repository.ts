import { and, asc, count, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db } from "@/core/database/client";
import { mediaAssets, productImages } from "@/core/database/schema";
import { escapeLike } from "@/core/validation/like";
import type { MediaListRow, MediaRow, MediaUsageFilter, MediaWrite } from "./types";

/** Repository: the only code in this module that talks to the database. */

const mediaColumns = {
  id: mediaAssets.id,
  publicId: mediaAssets.publicId,
  contentHash: mediaAssets.contentHash,
  width: mediaAssets.width,
  height: mediaAssets.height,
  bytes: mediaAssets.bytes,
  alt: mediaAssets.alt,
  createdAt: mediaAssets.createdAt,
};

/** Uses media_hash_uq. */
export async function selectMediaByHash(hash: string): Promise<MediaRow | null> {
  const [row] = await db().select(mediaColumns).from(mediaAssets).where(eq(mediaAssets.contentHash, hash)).limit(1);
  return row ?? null;
}

export async function selectMediaByPublicId(publicId: string): Promise<MediaRow | null> {
  const [row] = await db().select(mediaColumns).from(mediaAssets).where(eq(mediaAssets.publicId, publicId)).limit(1);
  return row ?? null;
}

export async function selectMediaById(id: string): Promise<MediaRow | null> {
  const [row] = await db().select(mediaColumns).from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  return row ?? null;
}

export async function insertMedia(values: MediaWrite): Promise<MediaRow> {
  const [row] = await db().insert(mediaAssets).values(values).returning(mediaColumns);
  if (!row) throw new Error("Media insert returned no row");
  return row;
}

export async function updateMediaAltRow(id: string, alt: string | null): Promise<MediaRow | null> {
  const [row] = await db().update(mediaAssets).set({ alt }).where(eq(mediaAssets.id, id)).returning(mediaColumns);
  return row ?? null;
}

export async function deleteMediaRow(id: string): Promise<void> {
  await db().delete(mediaAssets).where(eq(mediaAssets.id, id));
}

/** Uses images_public_id_idx. */
export async function countImageUses(publicId: string): Promise<number> {
  const [row] = await db().select({ n: count() }).from(productImages).where(eq(productImages.publicId, publicId));
  return Number(row?.n ?? 0);
}

/** Newest first, with how many product images use each file. "unused" keeps only files nothing uses. */
export async function selectMedia(opts: { q?: string; usage: MediaUsageFilter; limit: number; offset: number }): Promise<MediaListRow[]> {
  const usedBy = sql<number>`(select count(*)::int from ${productImages} where ${productImages.publicId} = ${mediaAssets.publicId})`;
  const conditions: (SQL | undefined)[] = [];
  if (opts.q) conditions.push(ilike(mediaAssets.publicId, `%${escapeLike(opts.q)}%`));
  if (opts.usage === "unused") conditions.push(sql`not exists (select 1 from ${productImages} where ${productImages.publicId} = ${mediaAssets.publicId})`);
  const rows = await db()
    .select({ ...mediaColumns, usedBy })
    .from(mediaAssets)
    .where(and(...conditions))
    .orderBy(desc(mediaAssets.createdAt), asc(mediaAssets.id))
    .limit(opts.limit)
    .offset(opts.offset);
  return rows.map((r) => ({ ...r, usedBy: Number(r.usedBy) }));
}
