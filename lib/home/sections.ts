import { safeHref } from "../markdown";
import { slugify } from "../slug";

/** Homepage sections: each type is declared once, and both the validator and the admin form are generated from it. */
export type FieldKind = "text" | "textarea" | "int" | "select" | "slugs" | "media" | "path" | "bool";
export type FieldDef = { key: string; label: string; kind: FieldKind; max?: number; min?: number; default?: string | number | boolean; options?: { value: string; label: string }[]; help?: string };
export type SectionDef = { label: string; description: string; fields: FieldDef[] };

const title = (def = ""): FieldDef => ({ key: "title", label: "Heading", kind: "text", max: 80, default: def });
const subtitle: FieldDef = { key: "subtitle", label: "Sub-heading", kind: "text", max: 160, default: "" };
const limit = (def: number, max: number): FieldDef => ({ key: "limit", label: "How many to show", kind: "int", min: 1, max, default: def });
const variant = (opts: [string, string][]): FieldDef => ({ key: "variant", label: "Layout", kind: "select", options: opts.map(([value, label]) => ({ value, label })), default: opts[0][0] });

export const SECTION_TYPES = {
  hero: { label: "Hero (headline and search)", description: "Headline, sub-text and search box. The wording comes from Site settings.", fields: [variant([["split", "Text and picture side by side"], ["centered", "Centred text only"]]), { key: "image", label: "Picture (optional)", kind: "media", help: "Leave empty to use the built-in picture." }] },
  category_strip: { label: "Category icons", description: "Top-level categories as a row of icons.", fields: [title()] },
  featured_products: { label: "Featured products", description: "Products marked “Featured” first, then the newest.", fields: [title("Featured"), subtitle, limit(4, 12)] },
  new_arrivals: { label: "New arrivals", description: "The newest products.", fields: [title("New arrivals"), subtitle, limit(4, 12)] },
  product_row: { label: "Hand-picked products", description: "Products you choose by address.", fields: [title("Our picks"), subtitle, { key: "slugs", label: "Product addresses", kind: "slugs", max: 12, help: "Comma or line separated, for example jute-basket, steel-bottle." }] },
  deals: { label: "Deals", description: "Live deals.", fields: [title("Today’s deals"), subtitle, limit(3, 6)] },
  coupons: { label: "Coupons", description: "Live coupon codes.", fields: [title("Coupons"), limit(3, 6)] },
  best_picks: { label: "Best picks", description: "The best saving in each top-level category.", fields: [title("Best picks"), limit(4, 8)] },
  brands: { label: "Brands", description: "Brand names with a link to each.", fields: [title("Brands to know"), limit(8, 24)] },
  collections: { label: "Collections", description: "Curated collections.", fields: [title("Collections"), limit(3, 6)] },
  journal_latest: { label: "Latest from the journal", description: "Newest articles, optionally from one category.", fields: [title("From the journal"), limit(3, 6), { key: "category", label: "Only this category (address, optional)", kind: "text", max: 60, default: "" }] },
  gift_finder: { label: "Gift finder", description: "Gift occasions and budgets.", fields: [title("Find the perfect gift"), subtitle] },
  trust_strip: { label: "Trust points", description: "Up to four short reassurances.", fields: [title(), { key: "items", label: "Points", kind: "textarea", max: 600, default: "Honest recommendations | We choose products for quality, not commission.\nReal prices | Prices are dated and deals expire on time.\nNo checkout here | You buy safely on the retailer’s own site.", help: "One per line as: Heading | Short text. Up to four lines." }] },
  newsletter: { label: "Newsletter", description: "A button to your email provider’s hosted sign-up page. Shown only when a sign-up address is set in Site settings.", fields: [title(), subtitle] },
  banner: { label: "Banner", description: "A message with a button and optional picture.", fields: [variant([["plain", "Plain"], ["accent", "Highlighted"]]), title("Special offer"), { key: "text", label: "Text", kind: "textarea", max: 400, default: "" }, { key: "cta_label", label: "Button label", kind: "text", max: 30, default: "" }, { key: "cta_href", label: "Button link", kind: "path", max: 300, default: "" }, { key: "image", label: "Picture (optional)", kind: "media" }] },
  stores: { label: "Stores", description: "Retailers with products on the site.", fields: [title("Shop by store"), limit(8, 24)] },
} as const satisfies Record<string, SectionDef>;

export type SectionType = keyof typeof SECTION_TYPES;
export const SECTION_ORDER = Object.keys(SECTION_TYPES) as SectionType[];
export const isSectionType = (t: string): t is SectionType => t in SECTION_TYPES;
export const MAX_SECTIONS = 30;

export type Config = Record<string, string | number | boolean | string[]>;
const UUID = /^[0-9a-f-]{36}$/i;
const clampInt = (v: string, f: FieldDef) => Math.min(Math.max(Math.round(Number(v)) || Number(f.default ?? f.min ?? 1), f.min ?? 0), f.max ?? 100);

/** Validates raw form values for a section type. Only values that differ from the defaults are kept, so rows stay tiny. */
export function cleanConfig(type: SectionType, raw: Record<string, string | undefined>): { ok: true; config: Config } | { ok: false; field: string; reason: string } {
  const out: Config = {};
  for (const f of (SECTION_TYPES[type] as SectionDef).fields) {
    const v = (raw[f.key] ?? "").replace(/\r\n?/g, "\n").trim();
    if (f.kind === "bool") { const on = raw[f.key] === "on"; if (on !== !!f.default) out[f.key] = on; continue; }
    if (f.kind === "int") { const n = clampInt(v, f); if (n !== f.default) out[f.key] = n; continue; }
    if (f.kind === "select") { if (f.options?.some((o) => o.value === v) && v !== f.default) out[f.key] = v; continue; }
    if (f.kind === "media") { if (UUID.test(v)) out[f.key] = v.toLowerCase(); continue; }
    if (f.kind === "slugs") { const list = [...new Set(v.split(/[,\n]/).map((x) => slugify(x)).filter(Boolean))].slice(0, f.max ?? 12); if (list.length) out[f.key] = list; continue; }
    if (v.length > (f.max ?? 200)) return { ok: false, field: f.key, reason: `is too long (maximum ${f.max} characters)` };
    if (f.kind === "path" && v && !safeHref(v)) return { ok: false, field: f.key, reason: "must be a site path like /deals or an https:// address" };
    if (f.kind !== "textarea" && v.includes("\n")) return { ok: false, field: f.key, reason: "must be a single line" };
    if (v && v !== f.default) out[f.key] = v;
  }
  return { ok: true, config: out };
}

/** Stored (sparse) config merged over the defaults. */
export function resolveConfig(type: SectionType, stored: Record<string, unknown> | null | undefined): Config {
  const out: Config = {};
  for (const f of (SECTION_TYPES[type] as SectionDef).fields) { const v = stored?.[f.key]; out[f.key] = (v ?? (f.kind === "slugs" ? [] : f.default ?? "")) as Config[string]; }
  return out;
}

export type Schedulable = { enabled: boolean; publishAt?: string | Date | null; unpublishAt?: string | Date | null };
export type Visibility = "live" | "hidden" | "scheduled" | "expired";
export function visibility(s: Schedulable, now = new Date()): Visibility {
  if (!s.enabled) return "hidden";
  if (s.publishAt && new Date(s.publishAt).getTime() > now.getTime()) return "scheduled";
  if (s.unpublishAt && new Date(s.unpublishAt).getTime() <= now.getTime()) return "expired";
  return "live";
}

/** "Heading | Text" lines for the trust strip (at most four). */
export function parseTrustItems(text: string): { heading: string; text: string }[] {
  return text.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0]).slice(0, 4).map((p) => ({ heading: p[0].slice(0, 60), text: (p[1] ?? "").slice(0, 160) }));
}

/** Used when no sections are stored: the site works out of the box and costs no storage until someone customises it. */
export const DEFAULT_LAYOUT: { type: SectionType; config: Config }[] = [
  { type: "hero", config: {} }, { type: "category_strip", config: {} }, { type: "featured_products", config: {} }, { type: "deals", config: {} },
  { type: "journal_latest", config: {} }, { type: "trust_strip", config: {} }, { type: "newsletter", config: {} },
];
