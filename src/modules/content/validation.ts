import { z } from "zod";
import { parseAdminDateTime } from "@/core/validation/datetime";
import { checkbox, intField, nameField, optionalSlugField, optionalText, optionalUrl, optionalUuid } from "@/core/validation/fields";
import { slugify } from "@/core/validation/slug";
import { isPublicId, parseDocumentJson } from "./document";
import { ARTICLE_TYPES, CONTENT_STATUSES, ROBOTS_VALUES, type ContentFilter, type RobotsValue, type TypeFilter } from "./types";

export { idSchema } from "@/core/validation/fields";

export const MAX_CONTENT_JSON_CHARS = 600_000;
export const MAX_TAGS_PER_ARTICLE = 15;

/** An optional "datetime-local" value typed in India time. Empty means "not given". */
const optionalDateTime = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const date = parseAdminDateTime(v);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "Enter a real date and time" });
      return z.NEVER;
    }
    return date;
  });

/** The editor posts its document as JSON text in one hidden field. It is parsed and rebuilt through the whitelist here. */
const contentField = z
  .string({ required_error: "The text is missing. Reload the page and try again." })
  .max(MAX_CONTENT_JSON_CHARS, "This text is too long. Split it into two articles.")
  .transform((text, ctx) => {
    const doc = text.trim() === "" ? parseDocumentJson('{"type":"doc","content":[]}') : parseDocumentJson(text);
    if (!doc) {
      ctx.addIssue({ code: "custom", message: "The text could not be read. Copy it, reload the page and paste it again." });
      return z.NEVER;
    }
    return doc;
  });

const statusField = z.enum(CONTENT_STATUSES, { errorMap: () => ({ message: "Choose a status" }) });

/** Search fields. All optional; every field empty means "no SEO row". */
const seoFields = {
  seoTitle: optionalText(70),
  seoDescription: optionalText(170),
  seoCanonical: optionalUrl({ httpsOnly: true }),
  seoOgImage: optionalUrl({ httpsOnly: true }),
  seoRobots: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || (ROBOTS_VALUES as readonly string[]).includes(v), "Choose one of the listed options")
    .transform((v) => v as RobotsValue | null),
};

export const coverPublicIdField = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isPublicId(v), "Choose the cover image from the library");

/** "Tea, Home office, tea" -> ["Tea", "Home office"]: comma or new line separated names, no repeats (ignoring case). */
export function parseTagNames(input: string | undefined): { ok: true; value: string[] } | { ok: false; message: string } {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of (input ?? "").split(/[,\n;]/)) {
    const name = part.trim().replace(/\s+/g, " ");
    if (!name) continue;
    if (name.length > 40) return { ok: false, message: `"${name.slice(0, 30)}…" is longer than 40 characters.` };
    if (!slugify(name)) return { ok: false, message: `"${name}" has no letters or numbers to make a web address from.` };
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  if (out.length > MAX_TAGS_PER_ARTICLE) return { ok: false, message: `Use at most ${MAX_TAGS_PER_ARTICLE} tags.` };
  return { ok: true, value: out };
}

const tagsField = z
  .string()
  .optional()
  .transform((text, ctx) => {
    const parsed = parseTagNames(text);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.message });
      return z.NEVER;
    }
    return parsed.value;
  });

/** Release 6B. A form that does not send a type (an old bookmark, a script) means a plain article. */
const articleTypeField = z.enum(ARTICLE_TYPES, { errorMap: () => ({ message: "Choose a type" }) }).default("article");

export const articleInputSchema = z.object({
  title: nameField("title"),
  type: articleTypeField,
  slug: optionalSlugField,
  excerpt: optionalText(300),
  status: statusField,
  publishAt: optionalDateTime,
  authorId: optionalUuid,
  categoryId: optionalUuid,
  tags: tagsField,
  coverPublicId: coverPublicIdField,
  coverAlt: optionalText(200),
  content: contentField,
  ...seoFields,
  confirmSlugChange: checkbox,
});
export type ArticleInput = z.output<typeof articleInputSchema>;

export const pageInputSchema = z.object({
  title: nameField("title"),
  slug: optionalSlugField,
  status: statusField,
  publishAt: optionalDateTime,
  content: contentField,
  ...seoFields,
  confirmSlugChange: checkbox,
});
export type PageInput = z.output<typeof pageInputSchema>;

export const authorInputSchema = z.object({
  displayName: nameField("name"),
  slug: optionalSlugField,
  bio: optionalText(1000),
});
export type AuthorInput = z.output<typeof authorInputSchema>;

export const categoryInputSchema = z.object({
  name: nameField("name"),
  slug: optionalSlugField,
  description: optionalText(300),
  sortOrder: intField(0, 9999, 0),
  isActive: checkbox,
});
export type CategoryInput = z.output<typeof categoryInputSchema>;

export const tagInputSchema = z.object({ name: nameField("name"), slug: optionalSlugField });
export type TagInput = z.output<typeof tagInputSchema>;

/** The article and page lists filter by status through ?status=. */
export const CONTENT_FILTER_OPTIONS: readonly ContentFilter[] = ["all", ...CONTENT_STATUSES];
export const contentFilterSchema = z.enum(["all", ...CONTENT_STATUSES]).catch("all");

/** The article list filters by type through ?type=. */
export const TYPE_FILTER_OPTIONS: readonly TypeFilter[] = ["all", ...ARTICLE_TYPES];
export const typeFilterSchema = z.enum(["all", ...ARTICLE_TYPES]).catch("all");

/** Image-picker request: a search text only. */
export const pickerQuerySchema = z.string().trim().max(100).optional();

/** The upload result the browser reports after sending a file to Cloudinary (verified again by the service). */
export const uploadResultSchema = z.object({
  public_id: z.string().min(1).max(255),
  version: z.number().int().positive(),
  signature: z.string().min(10).max(128),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
  format: z.string().min(1).max(10),
  resource_type: z.string().max(20),
  etag: z.string().min(8).max(64).optional(),
});
