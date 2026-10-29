import { parseCsv, unescapeCell } from "./csv";
import { slugify } from "./slug";
export type ImportRow = { line: number; slug: string; name: string; brand: string; category: string; blurb: string; price: number; mrp: number | null; status: "draft" | "published"; merchant: string; url: string };
export type ImportError = { line: number; reason: string };
export const IMPORT_ROW_LIMIT = 100;
export const REQUIRED_COLUMNS = ["name", "price", "category", "url"] as const;

/** Validates product CSV rows and says why each rejected row was rejected. `line` is the 1-based line in the file (header = 1). */
export function validateProductRows(text: string, categories: string[], limit = IMPORT_ROW_LIMIT): { rows: ImportRow[]; errors: ImportError[]; missingColumns: string[]; truncated: number } {
  const [head = [], ...data] = parseCsv(text);
  const idx = head.map((h) => h.trim().toLowerCase());
  const missingColumns = data.length || head.length ? REQUIRED_COLUMNS.filter((c) => !idx.includes(c)) : [];
  const col = (r: string[], k: string) => unescapeCell(r[idx.indexOf(k)] ?? "");
  const rows: ImportRow[] = [], errors: ImportError[] = [], seen = new Set<string>();
  if (missingColumns.length) return { rows, errors, missingColumns: [...missingColumns], truncated: 0 };
  data.slice(0, limit).forEach((r, i) => {
    const line = i + 2;
    const name = col(r, "name"), price = Math.round(Number(col(r, "price"))), category = col(r, "category"), url = col(r, "url"), mrp = Number(col(r, "mrp")) || null;
    const slug = slugify(col(r, "slug") || name);
    const bad = (reason: string) => errors.push({ line, reason });
    if (!name) return bad("name is empty");
    if (!slug) return bad("name has no letters or digits to build a slug from");
    if (!(price > 0)) return bad("price must be a positive number");
    if (mrp !== null && mrp <= price) return bad("mrp must be higher than price (or empty)");
    if (!categories.includes(category)) return bad(`unknown category "${category}"`);
    if (!url.startsWith("https://")) return bad("link must start with https://");
    if (seen.has(slug)) return bad(`slug "${slug}" appears more than once in this file`);
    seen.add(slug);
    rows.push({ line, slug, name, brand: slugify(col(r, "brand")), category, blurb: col(r, "blurb"), price, mrp, status: col(r, "status") === "draft" ? "draft" : "published", merchant: col(r, "merchant") || "Store", url });
  });
  return { rows, errors, missingColumns: [], truncated: Math.max(0, data.length - limit) };
}

/** Backwards-compatible wrapper: valid rows plus a count of everything skipped. */
export function parseProductRows(text: string, categories: string[], limit = IMPORT_ROW_LIMIT): { rows: ImportRow[]; skipped: number } {
  const v = validateProductRows(text, categories, limit);
  return { rows: v.rows, skipped: v.errors.length + v.truncated };
}

export type PlannedRow = ImportRow & { action: "create" | "update" | "skip-existing" };
/** Decides what each valid row would do. Existing slugs are only updated when `allowUpdate` is true; otherwise they are skipped. */
export function planImport(rows: ImportRow[], existingSlugs: Set<string>, allowUpdate: boolean): PlannedRow[] {
  return rows.map((r) => ({ ...r, action: !existingSlugs.has(r.slug) ? "create" : allowUpdate ? "update" : "skip-existing" }));
}
