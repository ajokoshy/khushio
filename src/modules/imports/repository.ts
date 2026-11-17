import { desc, eq } from "drizzle-orm";
import { db } from "@/core/database/client";
import { affiliateImportLogs } from "@/core/database/schema";
import type { ImportLogRow } from "./types";

/** Import history (Release 5B), in affiliate_import_logs. Conversion imports (4B) write to the same table. */

export async function insertImportLog(values: { source: string; entity: string; rowsProcessed: number; rowsFailed: number; startedAt: Date }): Promise<string> {
  const [row] = await db().insert(affiliateImportLogs).values({ ...values, finishedAt: new Date() }).returning({ id: affiliateImportLogs.id });
  if (!row) throw new Error("Import log insert returned no row");
  return row.id;
}

export async function selectRecentImports(limit: number): Promise<ImportLogRow[]> {
  return db().select({ id: affiliateImportLogs.id, source: affiliateImportLogs.source, entity: affiliateImportLogs.entity, rowsProcessed: affiliateImportLogs.rowsProcessed, rowsFailed: affiliateImportLogs.rowsFailed, startedAt: affiliateImportLogs.startedAt, finishedAt: affiliateImportLogs.finishedAt }).from(affiliateImportLogs).orderBy(desc(affiliateImportLogs.startedAt)).limit(limit);
}

export async function selectImportById(id: string) {
  const [row] = await db().select().from(affiliateImportLogs).where(eq(affiliateImportLogs.id, id)).limit(1);
  return row ?? null;
}
