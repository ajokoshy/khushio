import { revalidateTag } from "next/cache";
import { z } from "zod";
import { logAuditBestEffort } from "@/core/audit";
import { CACHE_TAGS } from "@/core/config/cache";
import { CURRENCY_CODES, DEFAULT_CURRENCY, minorToInput, parsePriceToMinor, type CurrencyCode } from "@/core/validation/money";
import { SLUG_MAX_LENGTH, SLUG_PATTERN, slugify } from "@/core/validation/slug";
import * as discover from "@/modules/discover/service";
import { given } from "@/modules/imports/values";
import type { ColumnSpec, EntityHandler, PlanUnit, RawRow, RowError } from "@/modules/imports/types";
import * as repo from "./import-repository";
import { MAX_TAGS, MAX_VARIANTS, parseTags } from "./validation";

/**
 * Products CSV (Release 5B). One row per variant; rows with the same slug are one product. A product is matched by its
 * slug (made from the name when empty) and a variant by its SKU (or, with no SKU, by its label inside the product), so
 * importing the same file again changes nothing. Rules:
 *   - an empty cell never clears a value; only cells with text change an existing product;
 *   - new products are saved as Draft (or In review). Publishing needs images and a category check, so it stays in the
 *     product screen; the status column is ignored for products that already exist;
 *   - brand and category are slugs of brands and categories that already exist (import brands first).
 */

export const PRODUCT_COLUMNS: readonly ColumnSpec[] = [
  { name: "slug", required: false, aliases: ["product_slug", "handle", "id"], help: "Identifies the product. Empty: made from the name.", example: "sony-wh-1000xm5" },
  { name: "name", required: true, aliases: ["product", "product_name", "title"], help: "Required for a new product (on its first row).", example: "Sony WH-1000XM5" },
  { name: "summary", required: false, aliases: ["short_description", "tagline"], help: "Up to 500 characters.", example: "Noise cancelling headphones" },
  { name: "description", required: false, aliases: ["long_description", "details"], help: "Up to 10,000 characters.", example: "Full description text." },
  { name: "brand", required: false, aliases: ["brand_slug"], help: "The slug of an existing brand.", example: "sony" },
  { name: "category", required: false, aliases: ["main_category", "category_slug"], help: "The slug of an existing category: the main category.", example: "headphones" },
  { name: "tags", required: false, aliases: ["tag"], help: "Separated by | or commas. Replaces the product's tags.", example: "wireless|noise cancelling" },
  { name: "status", required: false, aliases: ["product_status"], help: "draft or review for new products. Ignored for products that already exist.", example: "draft" },
  { name: "sku", required: false, aliases: ["variant_sku", "item_code"], help: "Identifies a variant. Unique across all products.", example: "XM5-BLK" },
  { name: "variant", required: false, aliases: ["variant_label", "option", "label"], help: "The variant's label, for example Black.", example: "Black" },
  { name: "price", required: false, aliases: ["variant_price", "mrp", "amount"], help: "A normal amount such as 29990 or 29,990.50.", example: "29990" },
  { name: "currency", required: false, aliases: ["currency_code"], help: `One of ${CURRENCY_CODES.join(", ")}. Default ${DEFAULT_CURRENCY}.`, example: "INR" },
];

const optionalSlug = (what: string) => z.string().trim().toLowerCase().max(SLUG_MAX_LENGTH, `${what} is too long`).refine((v) => v === "" || SLUG_PATTERN.test(v), `${what} may use lower-case letters, numbers and single hyphens only`);

const rowSchema = z.object({
  slug: optionalSlug("slug"),
  name: z.string().trim().max(120, "name is longer than 120 characters"),
  summary: z.string().trim().max(500, "summary is longer than 500 characters"),
  description: z.string().trim().max(10_000, "description is longer than 10,000 characters"),
  brand: optionalSlug("brand"),
  category: optionalSlug("category"),
  tags: z.string(),
  status: z.string().trim().toLowerCase().refine((v) => v === "" || (["draft", "review", "scheduled", "published", "archived", "discontinued"] as const).includes(v as never), "status is not one of draft, review, scheduled, published, archived, discontinued"),
  sku: z.string().trim().max(80, "sku is longer than 80 characters"),
  variant: z.string().trim().max(120, "variant is longer than 120 characters"),
  price: z.string(),
  currency: z.string().trim().toUpperCase().refine((v) => v === "" || (CURRENCY_CODES as readonly string[]).includes(v), `currency must be one of ${CURRENCY_CODES.join(", ")}`),
});

type RowVariant = { line: number; sku: string | null; label: string; priceMinor: number | null; currency: CurrencyCode | null; priceGiven: boolean };
type ParsedRow = {
  line: number;
  key: string;
  name: string;
  summary: string;
  description: string;
  brand: string;
  category: string;
  tags: string;
  status: "DRAFT" | "REVIEW" | "OTHER" | null;
  variant: RowVariant | null;
};

function parseRow(row: RawRow): { ok: true; value: ParsedRow } | { ok: false; error: string } {
  const r = rowSchema.safeParse(row.cells);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "invalid row" };
  const c = r.data;
  const key = c.slug || slugify(c.name);
  if (!key) return { ok: false, error: c.name ? "a slug could not be made from this name; add a slug" : "the row has no slug and no name" };

  let variant: RowVariant | null = null;
  if (c.sku || c.variant || given(c.price)) {
    const currency = (c.currency || DEFAULT_CURRENCY) as CurrencyCode;
    const price = parsePriceToMinor(c.price, currency);
    if (!price.ok) return { ok: false, error: `price: ${price.message}` };
    variant = { line: row.line, sku: c.sku || null, label: c.variant || (c.sku ? c.sku : "Default"), priceMinor: price.minor, currency: c.currency ? (c.currency as CurrencyCode) : null, priceGiven: given(c.price) };
  }
  return { ok: true, value: { line: row.line, key, name: c.name, summary: c.summary, description: c.description, brand: c.brand, category: c.category, tags: c.tags, status: c.status === "review" ? "REVIEW" : c.status === "draft" ? "DRAFT" : c.status ? "OTHER" : null, variant } };
}

const PRODUCT_LEVEL = ["name", "summary", "description", "brand", "category", "tags"] as const;

export const productsHandler: EntityHandler = {
  entity: "products",
  columns: PRODUCT_COLUMNS,

  async plan(rows) {
    const errors: RowError[] = [];

    // 1. read every row, then group rows by product
    const groups = new Map<string, ParsedRow[]>();
    const badKeys = new Map<string, number>(); // product key -> first line of a row that could not be read
    for (const row of rows) {
      const p = parseRow(row);
      if (!p.ok) {
        errors.push({ line: row.line, message: p.error });
        const key = (row.cells.slug ?? "").trim().toLowerCase() || slugify(row.cells.name ?? "");
        if (key && !badKeys.has(key)) badKeys.set(key, row.line);
        continue;
      }
      const list = groups.get(p.value.key) ?? [];
      list.push(p.value);
      groups.set(p.value.key, list);
    }
    // A product must never be half imported: if one of its rows is unreadable, its other rows are skipped too.
    const failGroup = (list: ParsedRow[], message: string) => {
      for (const r of list) errors.push({ line: r.line, message });
      groups.delete(list[0]?.key ?? "");
    };
    for (const [key, list] of [...groups]) {
      const badLine = badKeys.get(key);
      if (badLine !== undefined) failGroup(list, `line ${badLine}, another row of product "${key}", has a problem, so the whole product was skipped`);
    }

    // 2. product-level cells must agree on every row of a product
    const resolved: { key: string; rows: ParsedRow[]; first: Record<(typeof PRODUCT_LEVEL)[number], string>; status: "DRAFT" | "REVIEW" | "OTHER" | null }[] = [];
    for (const [key, list] of groups) {
      const first = { name: "", summary: "", description: "", brand: "", category: "", tags: "" };
      let status: "DRAFT" | "REVIEW" | "OTHER" | null = null;
      let conflict: { line: number; field: string; with: number } | null = null;
      const owner: Record<string, number> = {};
      for (const r of list) {
        for (const f of PRODUCT_LEVEL) {
          const v = r[f];
          if (!given(v)) continue;
          if (!given(first[f])) { first[f] = v; owner[f] = r.line; }
          else if (first[f] !== v && !conflict) conflict = { line: r.line, field: f, with: owner[f] ?? 0 };
        }
        if (r.status && !status) status = r.status;
      }
      if (conflict) { failGroup(list, `${conflict.field} differs from line ${conflict.with}. Every row of one product must give the same product details (or leave them empty).`); continue; }
      if (list.length > MAX_VARIANTS) { failGroup(list, `a product can have at most ${MAX_VARIANTS} variants`); continue; }
      resolved.push({ key, rows: list, first, status });
    }

    // 3. look everything up in a few queries
    const brandSlugs = [...new Set(resolved.map((g) => g.first.brand).filter(Boolean))];
    const categorySlugs = [...new Set(resolved.map((g) => g.first.category).filter(Boolean))];
    const skus = [...new Set(resolved.flatMap((g) => g.rows.map((r) => r.variant?.sku).filter((s): s is string => !!s)))];
    const [existing, brandMap, categoryIds] = await Promise.all([repo.loadForImport(resolved.map((g) => g.key), skus), discover.findBrandsBySlugs(brandSlugs), discover.findCategoryIdsBySlugs(categorySlugs)]);
    const categories = new Map((await discover.findCategoriesByIds([...categoryIds.values()])).map((c) => [c.slug, c] as const));
    const byProduct = new Map(existing.products.map((p) => [p.slug, p] as const));
    const skuTaken = new Map<string, string>(); // sku -> product key that uses it in THIS file

    // 4. one unit per product
    const units: PlanUnit[] = [];
    for (const g of resolved) {
      const lines = g.rows.map((r) => r.line);
      const fail = (message: string, only?: number) => void (only === undefined ? lines : [only]).forEach((line) => errors.push({ line, message }));
      const current = byProduct.get(g.key);

      let brandId: string | undefined;
      if (g.first.brand) {
        const brand = brandMap.get(g.first.brand);
        if (!brand) { fail(`brand "${g.first.brand}" does not exist. Import your brands first, or fix the slug.`); continue; }
        if (!brand.isActive && brand.id !== current?.brandId) { fail(`brand "${g.first.brand}" is archived`); continue; }
        brandId = brand.id;
      }
      let categoryId: string | undefined;
      if (g.first.category) {
        const category = categories.get(g.first.category);
        if (!category) { fail(`category "${g.first.category}" does not exist. Add it under Categories, or fix the slug.`); continue; }
        if (!category.isActive && category.id !== current?.primaryCategoryId) { fail(`category "${g.first.category}" is archived`); continue; }
        categoryId = category.id;
      }
      if (!current && !g.first.name) { fail("name is required for a new product"); continue; }
      if (!current && g.status === "OTHER") { fail("a new product can only be imported as draft or review. Publish it on the product screen once it has images."); continue; }

      let tags: string[] | undefined;
      if (given(g.first.tags)) {
        tags = parseTags(g.first.tags.replace(/\|/g, ","));
        if (tags.length > MAX_TAGS || tags.some((t) => t.length > 40)) { fail(`use at most ${MAX_TAGS} tags of up to 40 characters`); continue; }
      }

      // variants: match by SKU, else by label inside the product
      const seenKeys = new Set<string>();
      const newVariants: repo.NewVariant[] = [];
      const changedVariants: repo.ChangedVariant[] = [];
      let variantProblem = false;
      let nextSort = (current?.variants.length ?? 0);
      for (const r of g.rows) {
        const v = r.variant;
        if (!v) continue;
        const vKey = (v.sku ?? `label:${v.label}`).toLowerCase();
        if (seenKeys.has(vKey)) { fail(v.sku ? `the SKU "${v.sku}" appears twice in this product` : `the variant "${v.label}" appears twice in this product`, v.line); variantProblem = true; continue; }
        seenKeys.add(vKey);
        if (v.sku) {
          const owner = existing.skuOwners.get(v.sku.toLowerCase());
          if (owner && owner.slug !== g.key) { fail(`the SKU "${v.sku}" already belongs to product "${owner.slug}"`, v.line); variantProblem = true; continue; }
          const inFile = skuTaken.get(v.sku.toLowerCase());
          if (inFile && inFile !== g.key) { fail(`the SKU "${v.sku}" is also used by product "${inFile}" in this file`, v.line); variantProblem = true; continue; }
          skuTaken.set(v.sku.toLowerCase(), g.key);
        }
        const match = current?.variants.find((x) => (v.sku ? x.sku?.toLowerCase() === v.sku.toLowerCase() : x.sku === null && x.label.toLowerCase() === v.label.toLowerCase()));
        if (!match) {
          newVariants.push({ id: crypto.randomUUID(), sku: v.sku, label: v.label, priceMinor: v.priceMinor, currency: v.currency ?? DEFAULT_CURRENCY, sortOrder: nextSort++ });
          continue;
        }
        const change: repo.ChangedVariant = { id: match.id };
        if (v.label !== match.label && given(rows.find((x) => x.line === v.line)?.cells.variant ?? "")) change.label = v.label;
        if (v.priceGiven && v.priceMinor !== match.priceMinor) change.priceMinor = v.priceMinor;
        if (v.currency && v.currency !== match.currency) change.currency = v.currency;
        if (Object.keys(change).length > 1) changedVariants.push(change);
      }
      if (variantProblem) continue;

      if (!current) {
        units.push({ lines, action: "create", data: { id: crypto.randomUUID(), isNew: true, slug: g.key, fields: { name: g.first.name, summary: g.first.summary || null, description: g.first.description || null, brandId: brandId ?? null, status: g.status === "REVIEW" ? "REVIEW" : "DRAFT" }, primaryCategoryId: categoryId, tags, newVariants, changedVariants } satisfies repo.ProductBatchUnit });
        continue;
      }
      const fields: repo.ProductBatchUnit["fields"] = {};
      if (given(g.first.name) && g.first.name !== current.name) fields.name = g.first.name;
      if (given(g.first.summary) && g.first.summary !== current.summary) fields.summary = g.first.summary;
      if (given(g.first.description) && g.first.description !== current.description) fields.description = g.first.description;
      if (brandId && brandId !== current.brandId) fields.brandId = brandId;
      const categoryChanged = !!categoryId && categoryId !== current.primaryCategoryId;
      const tagsChanged = !!tags && [...tags].sort().join("\n") !== current.tags.join("\n");
      const changed = Object.keys(fields).length > 0 || categoryChanged || tagsChanged || newVariants.length > 0 || changedVariants.length > 0;
      units.push({ lines, action: changed ? "update" : "unchanged", data: { id: current.id, isNew: false, slug: g.key, fields, primaryCategoryId: categoryChanged ? categoryId : undefined, tags: tagsChanged ? tags : undefined, newVariants, changedVariants } satisfies repo.ProductBatchUnit });
    }
    return { units, errors };
  },

  async apply(units, actorId) {
    const batch = units.map((u) => u.data as repo.ProductBatchUnit);
    await repo.writeProductBatch(batch);
    revalidateTag(CACHE_TAGS.products);
    revalidateTag(CACHE_TAGS.dashboard);
    await logAuditBestEffort({ actor: actorId, action: "product.imported", entityType: "product", entityId: null, metadata: { created: batch.filter((b) => b.isNew).length, updated: batch.filter((b) => !b.isNew).length, variantsAdded: batch.reduce((n, b) => n + b.newVariants.length, 0) } });
  },
};

export const parseProductRow = parseRow;

/** The products CSV: one row per variant (one row for a product with none), same columns as the import template. */
export async function exportProductRows(limit: number, offset: number): Promise<{ rows: string[][]; more: boolean }> {
  const page = await repo.selectProductsForExport(limit + 1, offset);
  const rows: string[][] = [];
  for (const p of page.slice(0, limit)) {
    const head = [p.slug, p.name, p.summary ?? "", p.description ?? "", p.brandSlug ?? "", p.categorySlug ?? "", p.tags.join("|"), p.status.toLowerCase()];
    if (p.variants.length === 0) rows.push([...head, "", "", "", ""]);
    // Product details are written on every row: the importer requires the rows of one product to agree.
    for (const v of p.variants) rows.push([...head, v.sku ?? "", v.label, minorToInput(v.priceMinor, (CURRENCY_CODES as readonly string[]).includes(v.currency) ? (v.currency as CurrencyCode) : DEFAULT_CURRENCY), v.priceMinor === null ? "" : v.currency]);
  }
  return { rows, more: page.length > limit };
}
