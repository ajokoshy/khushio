import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/core/database/client";
import { runAtomically } from "@/core/database/atomic";
import { brands } from "@/core/database/schema";
import type { BrandRow } from "./types";

/** Brand reads and writes for CSV import (Release 5B). The only database access of discover/import.ts. */

const brandColumns = { id: brands.id, slug: brands.slug, name: brands.name, description: brands.description, logoUrl: brands.logoUrl, isFeatured: brands.isFeatured, isActive: brands.isActive };

/** Brands whose lower-cased name is in the list (the name is unique among brands, ignoring case). */
export async function selectBrandsByNames(names: readonly string[]): Promise<BrandRow[]> {
  if (names.length === 0) return [];
  const lowered = names.map((n) => n.toLowerCase());
  return db().select(brandColumns).from(brands).where(sql`lower(${brands.name}) in (${sql.join(lowered.map((n) => sql`${n}`), sql`, `)})`);
}

export type BrandCreate = { slug: string; name: string; description: string | null; logoUrl: string | null; isFeatured: boolean; isActive: boolean };
export type BrandUpdate = { id: string; name: string; description: string | null; logoUrl: string | null; isFeatured: boolean; isActive: boolean };

/** One atomic write: all new brands in one statement, then each changed brand. */
export async function writeBrandBatch(creates: readonly BrandCreate[], updates: readonly BrandUpdate[]): Promise<void> {
  await runAtomically((d) => {
    const statements: unknown[] = [];
    if (creates.length > 0) statements.push(d.insert(brands).values([...creates]));
    for (const u of updates) statements.push(d.update(brands).set({ name: u.name, description: u.description, logoUrl: u.logoUrl, isFeatured: u.isFeatured, isActive: u.isActive }).where(eq(brands.id, u.id)));
    return statements;
  });
}

/** One page of brands for the CSV export, in slug order. */
export async function selectBrandsForExport(limit: number, offset: number): Promise<BrandRow[]> {
  return db().select(brandColumns).from(brands).orderBy(asc(brands.slug)).limit(limit).offset(offset);
}
