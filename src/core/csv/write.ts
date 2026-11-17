/**
 * CSV writer for exports and error files (Release 5B). Opens in Excel and Google Sheets: UTF-8 with a byte-order mark,
 * CRLF line ends, and every value that needs it in quotes.
 *
 * Spreadsheet formula injection: a text cell that starts with = + - @ (or a tab or carriage return) would be run as a
 * formula by Excel. Such text gets a leading apostrophe. The importer removes that apostrophe again (unprotectCell), so an
 * exported file can be imported back unchanged. Numbers are written as numbers and never touched.
 */
export type CsvCell = string | number | boolean | null | undefined;

const NEEDS_GUARD = /^[=+\-@\t\r]/;
const LOOKS_NUMERIC = /^-?\d+(\.\d+)?$/;

export function protectCell(text: string): string {
  return NEEDS_GUARD.test(text) && !LOOKS_NUMERIC.test(text) ? `'${text}` : text;
}

/** Undoes protectCell: "'=SUM(A1)" -> "=SUM(A1)". Text that merely starts with an apostrophe is left alone. */
export function unprotectCell(text: string): string {
  return /^'[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) || value !== value.trim() ? `"${value.replace(/"/g, '""')}"` : value;
}

export function cellText(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return protectCell(value);
}

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [headers.map((h) => quote(h)).join(","), ...rows.map((r) => r.map((c) => quote(cellText(c))).join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
