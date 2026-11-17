import { z } from "zod";
import { parseAdminDateTime } from "@/core/validation/datetime";
import { checkbox, intField, nameField, optionalSlugField, optionalText } from "@/core/validation/fields";
import { CURRENCY_CODES, DEFAULT_CURRENCY, parsePriceToMinor } from "@/core/validation/money";
import { SLUG_PATTERN } from "@/core/validation/slug";
import { parseDiscountValue } from "./discount";
import { DEAL_STATE_LABELS, DEAL_STATES, DEAL_STATUSES, DEAL_TYPES, DISCOUNT_TYPES } from "./types";

export { idSchema } from "@/core/validation/fields";

export const MAX_DEAL_PRODUCTS = 50;
export const MAX_DEAL_CATEGORIES = 20;

const optionalSlugRef = (what: string) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .max(80, "Keep it under 80 characters")
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || SLUG_PATTERN.test(v), `Enter the ${what} slug exactly as shown in its list`);

/** "a-b, c-d\ne-f" -> ["a-b", "c-d", "e-f"]: comma or new line separated slugs, no duplicates. Each one is checked against the slug rule. */
export function parseSlugList(input: string | undefined, max: number, what: string): { ok: true; value: string[] } | { ok: false; message: string } {
  const out: string[] = [];
  for (const part of (input ?? "").split(/[,\n;]/)) {
    const slug = part.trim().toLowerCase();
    if (!slug) continue;
    if (!SLUG_PATTERN.test(slug) || slug.length > 80) return { ok: false, message: `"${slug.slice(0, 40)}" is not a ${what} slug. Use the slug shown in its list, one per line or separated by commas.` };
    if (!out.includes(slug)) out.push(slug);
  }
  if (out.length > max) return { ok: false, message: `Use at most ${max} ${what}s per deal` };
  return { ok: true, value: out };
}

const slugListField = (max: number, what: string) =>
  z
    .string()
    .optional()
    .transform((text, ctx) => {
      const parsed = parseSlugList(text, max, what);
      if (!parsed.ok) {
        ctx.addIssue({ code: "custom", message: parsed.message });
        return z.NEVER;
      }
      return parsed.value;
    });

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

export const dealInputSchema = z
  .object({
    title: nameField("title"),
    slug: optionalSlugField,
    merchantId: z.string({ required_error: "Choose a store" }).uuid("Choose a store"),
    type: z.enum(DEAL_TYPES, { errorMap: () => ({ message: "Choose a type" }) }),
    description: optionalText(2000),
    affiliateLinkSlug: optionalSlugRef("affiliate link"),
    startsAt: optionalDateTime,
    endsAt: optionalDateTime,
    isFeatured: checkbox,
    sortOrder: intField(0, 9999, 0),
    status: z.enum(DEAL_STATUSES, { errorMap: () => ({ message: "Choose a status" }) }),
    productSlugs: slugListField(MAX_DEAL_PRODUCTS, "product"),
    categorySlugs: slugListField(MAX_DEAL_CATEGORIES, "category"),
    /** Edit form only (see core/validation/slug-rules.ts). */
    confirmSlugChange: checkbox,
  })
  .superRefine((v, ctx) => {
    if (v.startsAt && v.endsAt && v.endsAt.getTime() <= v.startsAt.getTime()) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start" });
    }
  });
/** startsAt stays null here when left empty: the service turns that into "now" so the same form schedules and starts at once. */
export type DealInput = z.output<typeof dealInputSchema>;

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-+%&]{1,59}$/;

export const couponInputSchema = z
  .object({
    merchantId: z.string({ required_error: "Choose a store" }).uuid("Choose a store"),
    dealSlug: optionalSlugRef("deal"),
    code: z
      .string({ required_error: "Enter the coupon code" })
      .trim()
      .min(2, "Enter the coupon code")
      .max(60, "Keep it under 60 characters")
      .refine((v) => CODE_PATTERN.test(v), "Use letters, numbers and . _ - + % & only, with no spaces"),
    discountType: z.enum(DISCOUNT_TYPES, { errorMap: () => ({ message: "Choose a discount type" }) }),
    discountValue: z.string().trim().optional(),
    currency: z.enum(CURRENCY_CODES, { errorMap: () => ({ message: "Choose a currency" }) }).default(DEFAULT_CURRENCY),
    minSpend: z.string().trim().optional(),
    startsAt: optionalDateTime,
    endsAt: optionalDateTime,
    isActive: checkbox,
  })
  .transform((v, ctx) => {
    const value = parseDiscountValue(v.discountType, v.discountValue ?? "", v.currency);
    if (!value.ok) ctx.addIssue({ code: "custom", path: ["discountValue"], message: value.message });
    const min = parsePriceToMinor(v.minSpend, v.currency);
    if (!min.ok) ctx.addIssue({ code: "custom", path: ["minSpend"], message: min.message });
    if (v.startsAt && v.endsAt && v.endsAt.getTime() <= v.startsAt.getTime()) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start" });
    if (!value.ok || !min.ok) return z.NEVER;
    return {
      merchantId: v.merchantId,
      dealSlug: v.dealSlug,
      code: v.code,
      discountType: v.discountType,
      discountValue: value.value,
      currency: v.currency,
      minSpendMinor: min.minor,
      startsAt: v.startsAt,
      endsAt: v.endsAt,
      isActive: v.isActive,
    };
  });
export type CouponInput = z.output<typeof couponInputSchema>;

export const dealStateFilterSchema = z.enum(["all", ...DEAL_STATES]).catch("all");
export const DEAL_STATE_FILTER_OPTIONS = [{ value: "all", label: "All" }, ...DEAL_STATES.map((s) => ({ value: s, label: DEAL_STATE_LABELS[s] }))] as const;

/** Ticked rows of the list, as posted by the bulk form: one `ids` value per ticked row. */
export const bulkIdsSchema = z.array(z.string().uuid()).min(1, "Tick at least one deal first").max(200, "Choose at most 200 deals at a time");
