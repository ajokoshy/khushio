/**
 * Cursors for "next page". They are opaque to visitors (base64url JSON) but are NOT trusted: decode() checks every
 * field's shape, because the values go into SQL (as parameters, never as text). A bad cursor means "first page".
 *   new       newest first:   created_at (exact text from Postgres) + id
 *   name      A to Z:         lower(name) + id
 *   rank      relevance:      rank rounded to 4 decimals + id; mode says which search produced it
 */
export type Cursor =
  | { s: "new"; c: string; id: string }
  | { s: "name"; n: string; id: string }
  | { s: "rank"; r: string; id: string; m: "fts" | "fuzzy" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)$/;
const RANK = /^\d{1,3}(\.\d{1,4})?$/;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(value: string | undefined): Cursor | null {
  if (!value || value.length > 400) return null;
  try {
    const raw: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.id !== "string" || !UUID.test(o.id)) return null;
    if (o.s === "new" && typeof o.c === "string" && TIMESTAMP.test(o.c)) return { s: "new", c: o.c, id: o.id };
    if (o.s === "name" && typeof o.n === "string" && o.n.length <= 200) return { s: "name", n: o.n, id: o.id };
    if (o.s === "rank" && typeof o.r === "string" && RANK.test(o.r) && (o.m === "fts" || o.m === "fuzzy")) return { s: "rank", r: o.r, id: o.id, m: o.m };
    return null;
  } catch {
    return null;
  }
}
