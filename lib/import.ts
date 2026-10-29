import { parseCsv, unescapeCell } from "./csv";
import { slugify } from "./slug";
export type ImportRow = { slug: string; name: string; brand: string; category: string; blurb: string; price: number; mrp: number | null; status: "draft" | "published"; merchant: string; url: string };
/** Validates product CSV rows. Invalid rows are counted as skipped; rows beyond `limit` are skipped too. */
export function parseProductRows(text: string, categories: string[], limit = 100): { rows: ImportRow[]; skipped: number } {
  const [head = [], ...data] = parseCsv(text);
  const idx = head.map((h) => h.trim().toLowerCase());
  const col = (r: string[], k: string) => unescapeCell(r[idx.indexOf(k)] ?? "");
  const rows: ImportRow[] = []; let skipped = Math.max(0, data.length - limit);
  for (const r of data.slice(0, limit)) {
    const name = col(r, "name"), price = Math.round(Number(col(r, "price"))), category = col(r, "category"), url = col(r, "url");
    if (!name || !(price > 0) || !url.startsWith("https://") || !categories.includes(category)) { skipped++; continue; }
    rows.push({ slug: slugify(col(r, "slug") || name), name, brand: slugify(col(r, "brand")), category, blurb: col(r, "blurb"), price, mrp: Number(col(r, "mrp")) || null, status: col(r, "status") === "draft" ? "draft" : "published", merchant: col(r, "merchant") || "Store", url });
  }
  return { rows, skipped };
}
