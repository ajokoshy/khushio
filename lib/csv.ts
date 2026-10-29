/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}
/** Undo the formula-protection prefix the exporter adds. */
export const unescapeCell = (s: string) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s).trim();
/** Escapes one CSV cell and neutralises spreadsheet formulas (=, +, -, @). */
export const csvEscape = (v: unknown) => { let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
export const toCsv = (head: string[], rows: unknown[][]) => [head.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
