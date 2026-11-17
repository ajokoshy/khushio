import { toCsv } from "@/core/csv/write";
import { logAuditBestEffort } from "@/core/audit";
import { ValidationError } from "@/core/errors";
import { brandsHandler, BRAND_COLUMNS, exportBrandRows } from "@/modules/discover/import";
import { dealsHandler, DEAL_COLUMNS, exportDealRows } from "@/modules/deals/import";
import { linksHandler, LINK_COLUMNS, exportLinkRows } from "@/modules/affiliate/import";
import { productsHandler, PRODUCT_COLUMNS, exportProductRows } from "@/modules/products/import";
import { exportClickRows } from "@/modules/reports/report-service";
import type { ReportRange } from "@/modules/reports/days";
import { previewImport, runImport } from "./engine";
import * as repo from "./repository";
import { buildTemplateCsv } from "./template";
import { isImportEntity, type ColumnSpec, type EntityHandler, type ImportEntity, type ImportLogRow, type ImportPreview, type ImportResult } from "./types";

/**
 * CSV import and export (Release 5B). Imports: read, map, preview, then write in batches (engine.ts); each kind of row is
 * understood by the module that owns the data. Exports use the same columns as the templates, so an export can be edited
 * in a spreadsheet and imported back.
 */

const HANDLERS: Record<ImportEntity, EntityHandler> = { products: productsHandler, links: linksHandler, deals: dealsHandler, brands: brandsHandler };
const COLUMNS: Record<ImportEntity, readonly ColumnSpec[]> = { products: PRODUCT_COLUMNS, links: LINK_COLUMNS, deals: DEAL_COLUMNS, brands: BRAND_COLUMNS };

export const handlerFor = (entity: ImportEntity): EntityHandler => HANDLERS[entity];
export const columnsFor = (entity: ImportEntity): readonly ColumnSpec[] => COLUMNS[entity];
export const templateFor = (entity: ImportEntity): string => buildTemplateCsv(COLUMNS[entity]);

type FileInput = { text: string; filename: string; mapping: Record<string, unknown> | null };

export async function preview(entity: ImportEntity, input: FileInput): Promise<ImportPreview> {
  return previewImport(HANDLERS[entity], input);
}

/** Runs the import, records it in the history and the audit log, and returns the summary with the error CSV. */
export async function run(entity: ImportEntity, input: FileInput, actorId: string): Promise<ImportResult> {
  const startedAt = new Date();
  const result = await runImport(HANDLERS[entity], input, { actorId });
  const source = `csv:${entity}:${input.filename}`.slice(0, 200);
  let logId: string | null = null;
  try {
    logId = await repo.insertImportLog({ source, entity, rowsProcessed: result.rowsInFile, rowsFailed: result.failed, startedAt });
  } catch (error) {
    console.error("Import log failed", error);
  }
  await logAuditBestEffort({ actor: actorId, action: "import.completed", entityType: "import", entityId: logId, metadata: { entity, file: input.filename.slice(0, 100), rows: result.rowsInFile, created: result.created, updated: result.updated, unchanged: result.unchanged, failed: result.failed } });
  return { ...result, logId };
}

export async function recentImports(limit = 15): Promise<ImportLogRow[]> {
  return repo.selectRecentImports(limit);
}

/* ================================== export ================================== */

const PAGE = 500;
export const EXPORT_ROW_LIMIT = 20_000;
export const EXPORT_NAMES = ["products", "links", "deals", "brands", "clicks"] as const;
export type ExportName = (typeof EXPORT_NAMES)[number];
export const isExportName = (v: string): v is ExportName => (EXPORT_NAMES as readonly string[]).includes(v);

type Pager = (limit: number, offset: number) => Promise<{ rows: (string | number)[][]; more: boolean }>;
const PAGERS: Record<Exclude<ExportName, "clicks">, Pager> = { products: exportProductRows, links: exportLinkRows, deals: exportDealRows, brands: exportBrandRows };

/** The CSV of one kind of data, paged so memory and database use stay small, capped at EXPORT_ROW_LIMIT rows. */
export async function exportCsv(name: ExportName, opts: { range?: ReportRange; actorId: string }): Promise<{ filename: string; csv: string; truncated: boolean; rows: number }> {
  const day = new Date().toISOString().slice(0, 10);
  let csv: string;
  let truncated = false;
  let count = 0;

  if (name === "clicks") {
    const range = opts.range ?? 30;
    const data = await exportClickRows(range);
    csv = toCsv(["day", "link", "merchant", "product", "clicks"], data.rows);
    truncated = data.truncated;
    count = data.rows.length;
  } else {
    const headers = COLUMNS[name as ImportEntity].map((c) => c.name);
    const all: (string | number)[][] = [];
    for (let offset = 0; offset < EXPORT_ROW_LIMIT; offset += PAGE) {
      const page = await PAGERS[name](PAGE, offset);
      all.push(...page.rows);
      if (!page.more) break;
      if (all.length >= EXPORT_ROW_LIMIT) { truncated = true; break; }
    }
    csv = toCsv(headers, all);
    count = all.length;
  }
  await logAuditBestEffort({ actor: opts.actorId, action: "export.downloaded", entityType: "export", entityId: null, metadata: { name, rows: count, truncated } });
  return { filename: `khushio-${name}-${day}.csv`, csv, truncated, rows: count };
}

export function assertEntity(value: string): ImportEntity {
  if (isImportEntity(value)) return value;
  throw new ValidationError("Unknown kind of import", { entity: "Choose what you are importing." });
}
