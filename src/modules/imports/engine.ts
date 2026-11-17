import { parseCsv } from "@/core/csv/parse";
import { toCsv } from "@/core/csv/write";
import { ValidationError } from "@/core/errors";
import { cleanMapping, missingRequired, suggestMapping, toRawRows } from "./mapping";
import { IMPORT_BATCH_SIZE, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, type EntityHandler, type ImportCounts, type ImportPreview, type ImportResult, type PlanUnit, type RowError } from "./types";

/**
 * The import engine (Release 5B). Pure orchestration: it reads the CSV, applies the column mapping, asks the entity's
 * handler to plan, and applies the plan in batches of IMPORT_BATCH_SIZE. A batch is one all-or-nothing database write, so
 * a failure rolls back only that batch: its rows are reported, the other batches still import.
 */

const SHOWN_ERRORS = 25;

export type ParsedFile = { headerCells: string[]; body: ReturnType<typeof parseCsv>; rowsInFile: number };

export function readFile(text: string): ParsedFile {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new ValidationError("File too large", { file: `The file is larger than ${MAX_IMPORT_BYTES / 1_000_000} MB. Split it into smaller files.` });
  const lines = parseCsv(text);
  const header = lines[0];
  if (!header) throw new ValidationError("Empty file", { file: "The file is empty." });
  const body = lines.slice(1);
  if (body.length === 0) throw new ValidationError("No rows", { file: "The file has a header line but no rows." });
  if (body.length > MAX_IMPORT_ROWS) throw new ValidationError("Too many rows", { file: `The file has ${body.length} rows. The limit is ${MAX_IMPORT_ROWS}; split it into smaller files.` });
  return { headerCells: header.cells, body, rowsInFile: body.length };
}

const countOf = (units: readonly PlanUnit[], errors: readonly RowError[]): ImportCounts => ({
  create: units.filter((u) => u.action === "create").length,
  update: units.filter((u) => u.action === "update").length,
  unchanged: units.filter((u) => u.action === "unchanged").length,
  failed: new Set(errors.map((e) => e.line)).size,
});

const sortedErrors = (errors: readonly RowError[]) => [...errors].sort((a, b) => a.line - b.line);
const describe = (errors: readonly RowError[]) => sortedErrors(errors).slice(0, SHOWN_ERRORS).map((e) => `Line ${e.line}: ${e.message}`);

function prepare(handler: EntityHandler, text: string, wanted: Record<string, unknown> | null) {
  const file = readFile(text);
  const mapping = wanted ? cleanMapping(handler.columns, file.headerCells, wanted) : suggestMapping(handler.columns, file.headerCells);
  const missing = missingRequired(handler.columns, mapping);
  return { file, mapping, missing };
}

/** Checks the whole file and says what an import would do. Writes nothing. */
export async function previewImport(handler: EntityHandler, input: { text: string; filename: string; mapping: Record<string, unknown> | null }): Promise<ImportPreview> {
  const { file, mapping, missing } = prepare(handler, input.text, input.mapping);
  const base = { entity: handler.entity, filename: input.filename, rowsInFile: file.rowsInFile, headers: file.headerCells, mapping, columns: handler.columns, missingRequired: missing };
  if (missing.length > 0) return { ...base, counts: { create: 0, update: 0, unchanged: 0, failed: 0 }, errors: [], errorTotal: 0 };
  const plan = await handler.plan(toRawRows(handler.columns, file.headerCells, mapping, file.body));
  return { ...base, counts: countOf(plan.units, plan.errors), errors: describe(plan.errors), errorTotal: new Set(plan.errors.map((e) => e.line)).size };
}

/** The problems as a CSV: line, error, then the file's own columns, so it can be fixed and uploaded again. */
export function buildErrorCsv(file: ParsedFile, errors: readonly RowError[]): string {
  if (errors.length === 0) return "";
  const byLine = new Map(file.body.map((l) => [l.line, l.cells]));
  const rows = sortedErrors(errors).map((e) => [e.line, e.message, ...file.headerCells.map((_, i) => byLine.get(e.line)?.[i] ?? "")]);
  return toCsv(["line", "error", ...file.headerCells], rows);
}

export type RunDeps = { actorId: string; batchSize?: number };

/**
 * Imports the file. Rows that fail validation are skipped; the rest are written in batches. A batch that fails at the
 * database is rolled back as a whole and every row in it is reported (the cause is logged on the server, not shown).
 */
export async function runImport(handler: EntityHandler, input: { text: string; filename: string; mapping: Record<string, unknown> | null }, deps: RunDeps): Promise<Omit<ImportResult, "logId">> {
  const { file, mapping, missing } = prepare(handler, input.text, input.mapping);
  if (missing.length > 0) throw new ValidationError("Missing columns", { file: `Map these required columns first: ${missing.join(", ")}.` });

  const plan = await handler.plan(toRawRows(handler.columns, file.headerCells, mapping, file.body));
  const errors: RowError[] = [...plan.errors];
  const todo = plan.units.filter((u) => u.action !== "unchanged");
  const size = deps.batchSize ?? IMPORT_BATCH_SIZE;
  let created = 0;
  let updated = 0;

  for (let i = 0; i < todo.length; i += size) {
    const batch = todo.slice(i, i + size);
    try {
      await handler.apply(batch, deps.actorId);
      created += batch.filter((u) => u.action === "create").length;
      updated += batch.filter((u) => u.action === "update").length;
    } catch (error) {
      console.error(`Import batch failed (${handler.entity}, rows ${batch.length})`, error);
      for (const unit of batch) for (const line of unit.lines) errors.push({ line, message: "This row was not saved: its batch of rows was rolled back because the database refused it. Fix any problem listed for the other rows and import the file again." });
    }
  }
  const failedLines = new Set(errors.map((e) => e.line));
  return {
    entity: handler.entity,
    filename: input.filename,
    rowsInFile: file.rowsInFile,
    created,
    updated,
    unchanged: plan.units.filter((u) => u.action === "unchanged").length,
    failed: failedLines.size,
    errors: describe(errors),
    errorTotal: failedLines.size,
    errorCsv: buildErrorCsv(file, errors),
  };
}
