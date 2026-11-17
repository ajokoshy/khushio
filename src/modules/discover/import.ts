import { revalidateTag } from "next/cache";
import { z } from "zod";
import { logAuditBestEffort } from "@/core/audit";
import { CACHE_TAGS } from "@/core/config/cache";
import { SLUG_MAX_LENGTH, SLUG_PATTERN, slugify } from "@/core/validation/slug";
import { given, readBool } from "@/modules/imports/values";
import type { ColumnSpec, EntityHandler, PlanUnit, RawRow, RowError } from "@/modules/imports/types";
import * as repo from "./import-repository";
import * as discover from "./service";

/**
 * Brands CSV (Release 5B). A brand is matched by its slug (made from the name when the slug column is empty), so importing
 * the same file again changes nothing. A cell left empty never clears an existing value.
 */

export const BRAND_COLUMNS: readonly ColumnSpec[] = [
  { name: "slug", required: false, aliases: ["brand_slug", "id"], help: "Identifies the brand. Empty: made from the name.", example: "sony" },
  { name: "name", required: true, aliases: ["brand", "brand_name", "title"], help: "The brand's name (unique, ignoring case).", example: "Sony" },
  { name: "description", required: false, aliases: ["about", "summary"], help: "Up to 1,000 characters.", example: "Electronics and entertainment." },
  { name: "logo_url", required: false, aliases: ["logo", "image", "logo_address"], help: "A full https:// address.", example: "https://example.com/sony.png" },
  { name: "is_featured", required: false, aliases: ["featured"], help: "yes or no.", example: "yes" },
  { name: "is_active", required: false, aliases: ["active", "status"], help: "yes or no. No archives the brand.", example: "yes" },
];

const httpsUrl = z.string().trim().max(2048, "logo_url is longer than 2048 characters").superRefine((v, ctx) => {
  if (v === "") return;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") ctx.addIssue({ code: "custom", message: "logo_url must start with https://" });
    else if (u.username || u.password) ctx.addIssue({ code: "custom", message: "logo_url must not contain a username or password" });
  } catch {
    ctx.addIssue({ code: "custom", message: "logo_url is not a web address" });
  }
});

const rowSchema = z.object({
  slug: z.string().trim().toLowerCase().max(SLUG_MAX_LENGTH, "slug is too long").refine((v) => v === "" || SLUG_PATTERN.test(v), "slug may use lower-case letters, numbers and single hyphens only"),
  name: z.string().trim().min(1, "name is empty").max(120, "name is longer than 120 characters"),
  description: z.string().trim().max(1000, "description is longer than 1,000 characters"),
  logo_url: httpsUrl,
  is_featured: z.string(),
  is_active: z.string(),
});

type Parsed = { line: number; slug: string; name: string; description: string; logoUrl: string; isFeatured: boolean | null; isActive: boolean | null };

function parseRow(row: RawRow): { ok: true; value: Parsed } | { ok: false; error: string } {
  const r = rowSchema.safeParse(row.cells);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "invalid row" };
  const featured = readBool(r.data.is_featured, "is_featured");
  if (!featured.ok) return featured;
  const active = readBool(r.data.is_active, "is_active");
  if (!active.ok) return active;
  const slug = r.data.slug || slugify(r.data.name);
  if (!slug) return { ok: false, error: "a slug could not be made from this name; add a slug column value" };
  return { ok: true, value: { line: row.line, slug, name: r.data.name, description: r.data.description, logoUrl: r.data.logo_url, isFeatured: featured.value, isActive: active.value } };
}

export const brandsHandler: EntityHandler = {
  entity: "brands",
  columns: BRAND_COLUMNS,

  async plan(rows) {
    const errors: RowError[] = [];
    const parsed: Parsed[] = [];
    const seenSlug = new Map<string, number>();
    const seenName = new Map<string, { line: number; slug: string }>();
    for (const row of rows) {
      const p = parseRow(row);
      if (!p.ok) { errors.push({ line: row.line, message: p.error }); continue; }
      const v = p.value;
      if (seenSlug.has(v.slug)) { errors.push({ line: v.line, message: `the slug "${v.slug}" is already used on line ${seenSlug.get(v.slug)}` }); continue; }
      const sameName = seenName.get(v.name.toLowerCase());
      if (sameName) { errors.push({ line: v.line, message: `the name "${v.name}" is already used on line ${sameName.line}` }); continue; }
      seenSlug.set(v.slug, v.line);
      seenName.set(v.name.toLowerCase(), { line: v.line, slug: v.slug });
      parsed.push(v);
    }

    const existing = await discover.findBrandsBySlugs(parsed.map((p) => p.slug));
    const nameOwners = new Map((await discover.findBrandsByNames(parsed.map((p) => p.name))).map((b) => [b.name.toLowerCase(), b] as const));
    const units: PlanUnit[] = [];
    for (const v of parsed) {
      const owner = nameOwners.get(v.name.toLowerCase());
      if (owner && owner.slug !== v.slug) { errors.push({ line: v.line, message: `another brand (${owner.slug}) already has the name "${v.name}"` }); continue; }
      const current = existing.get(v.slug);
      if (!current) {
        units.push({ lines: [v.line], action: "create", data: { slug: v.slug, name: v.name, description: v.description || null, logoUrl: v.logoUrl || null, isFeatured: v.isFeatured ?? false, isActive: v.isActive ?? true } });
        continue;
      }
      const next = {
        id: current.id,
        name: v.name,
        description: given(v.description) ? v.description : current.description,
        logoUrl: given(v.logoUrl) ? v.logoUrl : current.logoUrl,
        isFeatured: v.isFeatured ?? current.isFeatured,
        isActive: v.isActive ?? current.isActive,
      };
      const changed = next.name !== current.name || next.description !== current.description || next.logoUrl !== current.logoUrl || next.isFeatured !== current.isFeatured || next.isActive !== current.isActive;
      units.push({ lines: [v.line], action: changed ? "update" : "unchanged", data: next });
    }
    return { units, errors };
  },

  async apply(units, actorId) {
    const creates = units.filter((u) => u.action === "create").map((u) => u.data as repo.BrandCreate);
    const updates = units.filter((u) => u.action === "update").map((u) => u.data as repo.BrandUpdate);
    await repo.writeBrandBatch(creates, updates);
    revalidateTag(CACHE_TAGS.brands);
    revalidateTag(CACHE_TAGS.products);
    await logAuditBestEffort({ actor: actorId, action: "brand.imported", entityType: "brand", entityId: null, metadata: { created: creates.length, updated: updates.length } });
  },
};

/** Used by the unit tests: the pure part of reading one row. */
export const parseBrandRow = parseRow;

const yes = (v: boolean) => (v ? "yes" : "no");

/** The brands CSV, same columns as the import template, so it can be edited and imported back. */
export async function exportBrandRows(limit: number, offset: number): Promise<{ rows: string[][]; more: boolean }> {
  const page = await repo.selectBrandsForExport(limit + 1, offset);
  return { rows: page.slice(0, limit).map((b) => [b.slug, b.name, b.description ?? "", b.logoUrl ?? "", yes(b.isFeatured), yes(b.isActive)]), more: page.length > limit };
}
