import { z } from "zod";
import { checkbox, nameField, optionalSlugField, optionalText, optionalUuid } from "@/core/validation/fields";
import { parseAdminDateTime } from "@/core/validation/datetime";
import { CURRENCY_CODES, DEFAULT_CURRENCY, parsePriceToMinor } from "@/core/validation/money";
import { PRODUCT_STATUSES } from "./types";

export const MAX_VARIANTS = 50;
export const MAX_ATTRIBUTES = 30;
export const MAX_TAGS = 20;
export const MAX_EXTRA_CATEGORIES = 10;

const variantSchema = z
  .object({
    id: optionalUuid,
    label: z.string({ required_error: "Enter a label" }).trim().min(1, "Enter a label such as 128 GB or Size 9").max(120, "Keep it under 120 characters"),
    sku: z
      .string()
      .trim()
      .max(80, "Keep it under 80 characters")
      .optional()
      .transform((v) => (v ? v : null)),
    price: z.string().optional(),
    currency: z.enum(CURRENCY_CODES, { errorMap: () => ({ message: "Choose a currency from the list" }) }).default(DEFAULT_CURRENCY),
  })
  .transform((v, ctx) => {
    const parsed = parsePriceToMinor(v.price, v.currency);
    if (!parsed.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.message, path: ["price"] });
      return z.NEVER;
    }
    return { id: v.id, label: v.label, sku: v.sku, currency: v.currency as string, priceMinor: parsed.minor };
  });

const attributeSchema = z.object({
  name: z.string().trim().min(1, "Enter the attribute name").max(60, "Keep it under 60 characters"),
  value: z.string().trim().min(1, "Enter the value").max(200, "Keep it under 200 characters"),
});

/** "Running, trail  shoes\nsale" -> ["running", "trail shoes"...]: comma or new line separated, lower case, no duplicates. */
export function parseTags(input: string | undefined): string[] {
  const out: string[] = [];
  for (const part of (input ?? "").split(/[,\n]/)) {
    const tag = part.trim().toLowerCase().replace(/\s+/g, " ");
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

const tagsField = z
  .string()
  .optional()
  .transform(parseTags)
  .refine((tags) => tags.length <= MAX_TAGS, `Use at most ${MAX_TAGS} tags`)
  .refine((tags) => tags.every((t) => t.length <= 40), "Keep each tag under 40 characters");

const publishAtField = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const date = parseAdminDateTime(v);
    if (!date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid date and time" });
      return z.NEVER;
    }
    return date;
  });

export const productInputSchema = z
  .object({
    name: nameField("product name"),
    slug: optionalSlugField,
    summary: optionalText(500),
    description: optionalText(10_000),
    brandId: optionalUuid,
    status: z.enum(PRODUCT_STATUSES, { errorMap: () => ({ message: "Choose a status from the list" }) }),
    publishAt: publishAtField,
    isFeatured: checkbox,
    primaryCategoryId: optionalUuid,
    categoryIds: z.array(z.string().uuid("Choose categories from the list")).max(MAX_EXTRA_CATEGORIES, `Choose at most ${MAX_EXTRA_CATEGORIES} extra categories`).default([]),
    tags: tagsField,
    attributes: z.array(attributeSchema).max(MAX_ATTRIBUTES, `Use at most ${MAX_ATTRIBUTES} attributes`).default([]),
    variants: z.array(variantSchema).max(MAX_VARIANTS, `Use at most ${MAX_VARIANTS} variants`).default([]),
    /** Edit form only: must be ticked for the slug to change (see core/validation/slug-rules.ts). */
    confirmSlugChange: checkbox,
  })
  .superRefine((value, ctx) => {
    if (value.status === "SCHEDULED" && !value.publishAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["publishAt"], message: "Choose when the product goes live" });
    }
    const seen = new Set<string>();
    value.variants.forEach((variant, index) => {
      if (!variant.sku) return;
      const key = variant.sku.toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variants", index, "sku"], message: "This SKU is used by another variant of this product" });
      seen.add(key);
    });
  })
  .transform((value) => ({
    ...value,
    // The primary category is stored with the others; the extras never repeat it.
    categoryIds: value.categoryIds.filter((id, i, all) => id !== value.primaryCategoryId && all.indexOf(id) === i),
    // Only a scheduled product has a go-live time.
    publishAt: value.status === "SCHEDULED" ? value.publishAt : null,
  }));

export type ProductInput = z.output<typeof productInputSchema>;

export const productFilterSchema = z.enum(["all", ...PRODUCT_STATUSES]).catch("all");

/** One image's alt text, edited in the product screen. */
export const altTextSchema = z.string().trim().min(1, "Describe the image for people who cannot see it").max(200, "Keep it under 200 characters");

export { idSchema } from "@/core/validation/fields";
