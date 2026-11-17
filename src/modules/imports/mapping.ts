import { unprotectCell } from "@/core/csv/write";
import type { CsvLine } from "@/core/csv/parse";
import { normaliseHeader } from "./values";
import type { ColumnSpec, RawRow } from "./types";

/**
 * Column mapping (Release 5B). A file's headers are matched to the fields of an entity by name, or by any alias, after
 * normalising ("Logo URL" and "logo_url" are the same). The wizard shows the result and lets the admin change it.
 */

/** field name -> the header text it was matched to, or "" when the file has no such column. */
export function suggestMapping(columns: readonly ColumnSpec[], headers: readonly string[]): Record<string, string> {
  const normalised = headers.map((h) => ({ header: h, key: normaliseHeader(h) }));
  const taken = new Set<string>();
  const out: Record<string, string> = {};
  for (const col of columns) {
    const names = new Set([normaliseHeader(col.name), ...col.aliases.map(normaliseHeader)]);
    const hit = normalised.find((h) => !taken.has(h.header) && h.key !== "" && names.has(h.key));
    out[col.name] = hit ? hit.header : "";
    if (hit) taken.add(hit.header);
  }
  return out;
}

/** Keeps only what makes sense: known fields, headers that exist in the file, and no header used twice. */
export function cleanMapping(columns: readonly ColumnSpec[], headers: readonly string[], wanted: Record<string, unknown>): Record<string, string> {
  const real = new Set(headers);
  const used = new Set<string>();
  const out: Record<string, string> = {};
  for (const col of columns) {
    const header = typeof wanted[col.name] === "string" ? (wanted[col.name] as string) : "";
    if (header && real.has(header) && !used.has(header)) {
      out[col.name] = header;
      used.add(header);
    } else out[col.name] = "";
  }
  return out;
}

export function missingRequired(columns: readonly ColumnSpec[], mapping: Record<string, string>): string[] {
  return columns.filter((c) => c.required && !mapping[c.name]).map((c) => c.name);
}

/** Data lines of the file as rows of field -> text. Spreadsheet-protected text ('=...) is unprotected here. */
export function toRawRows(columns: readonly ColumnSpec[], headerCells: readonly string[], mapping: Record<string, string>, body: readonly CsvLine[]): RawRow[] {
  const position = new Map<string, number>();
  headerCells.forEach((h, i) => {
    if (!position.has(h)) position.set(h, i);
  });
  return body.map(({ line, cells }) => {
    const row: Record<string, string> = {};
    for (const col of columns) {
      const header = mapping[col.name];
      const i = header ? position.get(header) : undefined;
      row[col.name] = i === undefined ? "" : unprotectCell((cells[i] ?? "").trim());
    }
    return { line, cells: row };
  });
}
