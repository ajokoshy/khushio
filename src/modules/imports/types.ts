/**
 * CSV import (Release 5B). The engine in this module reads the file, maps its columns, shows a preview and imports in
 * batches. What each kind of row MEANS (validation, matching existing rows, writing) lives in the module that owns the
 * data: each owner exports an EntityHandler, and this module only drives them.
 */
export const IMPORT_ENTITIES = ["products", "links", "deals", "brands"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];
export const IMPORT_ENTITY_LABELS: Record<ImportEntity, string> = { products: "Products and variants", links: "Affiliate links", deals: "Deals", brands: "Brands" };

export function isImportEntity(value: string): value is ImportEntity {
  return (IMPORT_ENTITIES as readonly string[]).includes(value);
}

export const MAX_IMPORT_BYTES = 2_000_000;
export const MAX_IMPORT_ROWS = 2000;
export const IMPORT_BATCH_SIZE = 100;

export type ColumnSpec = {
  /** The field name; also the header of the template and the export. */
  name: string;
  required: boolean;
  /** Other header names that are recognised automatically (compared after normalising: lower case, symbols to underscores). */
  aliases: readonly string[];
  help: string;
  example: string;
};

/** One data row of the file: its line number and the cell text for every field of the entity (empty when not mapped). */
export type RawRow = { line: number; cells: Record<string, string> };
export type RowError = { line: number; message: string };

/**
 * What one file row (or, for products, one group of rows with the same slug) becomes. `unchanged` units are counted and
 * never written, which is what makes a second import of the same file change nothing.
 */
export type PlanUnit = { lines: number[]; action: "create" | "update" | "unchanged"; data: unknown };
export type Plan = { units: PlanUnit[]; errors: RowError[] };

export type EntityHandler = {
  entity: ImportEntity;
  columns: readonly ColumnSpec[];
  /** Validates every row (Zod), resolves references and matches existing rows. Reads the database; writes nothing. */
  plan(rows: RawRow[]): Promise<Plan>;
  /** Writes one batch (at most IMPORT_BATCH_SIZE units, all create or update) as ONE all-or-nothing unit. Throws on failure. */
  apply(units: PlanUnit[], actorId: string): Promise<void>;
};

export type ImportCounts = { create: number; update: number; unchanged: number; failed: number };

export type ImportPreview = {
  entity: ImportEntity;
  filename: string;
  rowsInFile: number;
  headers: string[];
  /** field name -> the file header mapped to it, or "" for "not in the file". */
  mapping: Record<string, string>;
  columns: readonly ColumnSpec[];
  /** Fields that are required and not mapped: the import cannot run until they are. */
  missingRequired: string[];
  counts: ImportCounts;
  errors: string[];
  errorTotal: number;
};

export type ImportResult = {
  entity: ImportEntity;
  filename: string;
  rowsInFile: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  /** The first few problems, each with its line number. */
  errors: string[];
  errorTotal: number;
  /** The problems as a CSV (line, error, then the original columns), ready to fix and upload again. Empty when nothing failed. */
  errorCsv: string;
  logId: string | null;
};

export type ImportLogRow = { id: string; source: string; entity: string | null; rowsProcessed: number; rowsFailed: number; startedAt: Date; finishedAt: Date | null };
