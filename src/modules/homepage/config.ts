import { z } from "zod";
import { isPublicId } from "@/modules/content/document";
import { GUIDE_TYPES } from "@/modules/content/types";
import { TRENDING_MODES } from "@/modules/catalog/types";
import { isSafeLinkTarget, LINK_TARGET_MESSAGE } from "./links";

/**
 * The homepage sections (Release 6B). `homepage_sections.type` must be one of SECTION_TYPES, and each type is drawn by a
 * component registered in code (src/shared/homepage/sections.tsx). The database only stores a type and a small JSON
 * config, validated here per type with Zod on every write AND again when the page is built: a bad or hand-edited row is
 * skipped, never drawn. No HTML, no script and no addresses other than safe links can come from the database.
 */

export const SECTION_TYPES = ["hero_banner", "featured_categories", "trending_products", "deals", "collections", "guides", "promo_banner"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_LABELS: Record<SectionType, string> = {
  hero_banner: "Hero banner",
  featured_categories: "Featured categories",
  trending_products: "Trending products",
  deals: "Deals",
  collections: "Collections",
  guides: "Guides",
  promo_banner: "Promo banner",
};

export const SECTION_HELP: Record<SectionType, string> = {
  hero_banner: "A large banner with an optional headline and button. With no picture chosen it shows the Khushio brand banner.",
  featured_categories: "Tiles that link to categories. With none chosen it shows the top-level categories.",
  trending_products: "A row of products: featured ones, the newest, or the most clicked in the last 30 days.",
  deals: "The current offers, ending offers are removed by themselves.",
  collections: "Tiles for the curated collections you choose.",
  guides: "The newest buying guides, reviews, comparisons and how-tos.",
  promo_banner: "A single line of text with an optional button, for a sale or an announcement.",
};

export const MAX_SECTIONS = 20;

const optionalText = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters`).nullable().default(null);
const linkTarget = z.string().trim().max(2048).refine(isSafeLinkTarget, LINK_TARGET_MESSAGE);
const uuid = z.string().uuid();
const intIn = (min: number, max: number, fallback: number) =>
  z.number({ invalid_type_error: "Enter a whole number" }).int("Enter a whole number").min(min, `At least ${min}`).max(max, `At most ${max}`).default(fallback);

/** A button needs both its text and its address, or neither. */
function buttonPair<T extends { ctaLabel: string | null; ctaHref: string | null }>(value: T, ctx: z.RefinementCtx) {
  if (value.ctaLabel && !value.ctaHref) ctx.addIssue({ code: "custom", path: ["ctaHref"], message: "Add the address the button opens, or clear the button text." });
  if (value.ctaHref && !value.ctaLabel) ctx.addIssue({ code: "custom", path: ["ctaLabel"], message: "Add the button text, or clear the address." });
}

export const heroConfigSchema = z
  .object({
    /** A media-library picture. Null shows the Khushio brand banner (public/brand/banner.png). */
    imagePublicId: z.string().trim().refine(isPublicId, "Choose the picture from the library").nullable().default(null),
    imageAlt: z.string().trim().max(200, "Keep it under 200 characters").default(""),
    headline: optionalText(100),
    subheadline: optionalText(200),
    ctaLabel: optionalText(40),
    ctaHref: linkTarget.nullable().default(null),
  })
  .superRefine(buttonPair);

export const featuredCategoriesConfigSchema = z.object({
  /** Empty means "the top-level categories". Order is the order shown. */
  categoryIds: z.array(uuid).max(12, "Choose at most 12 categories").default([]),
});

export const trendingConfigSchema = z.object({
  mode: z.enum(TRENDING_MODES, { errorMap: () => ({ message: "Choose one of the listed options" }) }).default("featured"),
  limit: intIn(4, 12, 8),
});

export const dealsConfigSchema = z.object({ limit: intIn(2, 12, 6) });

export const collectionsConfigSchema = z.object({
  collectionIds: z.array(uuid).min(1, "Choose at least one collection").max(4, "Choose at most 4 collections"),
});

const guideTypeEnum = z.enum(GUIDE_TYPES as unknown as [string, ...string[]]);
export const guidesConfigSchema = z.object({
  /** Empty means every guide type. */
  types: z.array(guideTypeEnum).max(4).default([]),
  limit: intIn(3, 9, 3),
});

export const promoConfigSchema = z
  .object({
    text: z.string({ required_error: "Enter the text" }).trim().min(1, "Enter the text").max(160, "Keep it under 160 characters"),
    ctaLabel: optionalText(40),
    ctaHref: linkTarget.nullable().default(null),
    tone: z.enum(["forest", "coral", "cream"], { errorMap: () => ({ message: "Choose one of the listed options" }) }).default("forest"),
  })
  .superRefine(buttonPair);

export const SECTION_SCHEMAS = {
  hero_banner: heroConfigSchema,
  featured_categories: featuredCategoriesConfigSchema,
  trending_products: trendingConfigSchema,
  deals: dealsConfigSchema,
  collections: collectionsConfigSchema,
  guides: guidesConfigSchema,
  promo_banner: promoConfigSchema,
} as const;

export type HeroConfig = z.output<typeof heroConfigSchema>;
export type FeaturedCategoriesConfig = z.output<typeof featuredCategoriesConfigSchema>;
export type TrendingConfig = z.output<typeof trendingConfigSchema>;
export type DealsConfig = z.output<typeof dealsConfigSchema>;
export type CollectionsConfig = z.output<typeof collectionsConfigSchema>;
export type GuidesConfig = z.output<typeof guidesConfigSchema>;
export type PromoConfig = z.output<typeof promoConfigSchema>;

export type SectionConfigMap = {
  hero_banner: HeroConfig;
  featured_categories: FeaturedCategoriesConfig;
  trending_products: TrendingConfig;
  deals: DealsConfig;
  collections: CollectionsConfig;
  guides: GuidesConfig;
  promo_banner: PromoConfig;
};

export function isSectionType(value: string): value is SectionType {
  return (SECTION_TYPES as readonly string[]).includes(value);
}

/** The values a new section of this type starts with in the admin form. */
export const STARTING_CONFIG: { [K in SectionType]: unknown } = {
  hero_banner: { imagePublicId: null, imageAlt: "", headline: null, subheadline: null, ctaLabel: null, ctaHref: null },
  featured_categories: { categoryIds: [] },
  trending_products: { mode: "featured", limit: 8 },
  deals: { limit: 6 },
  collections: { collectionIds: [] },
  guides: { types: [], limit: 3 },
  promo_banner: { text: "", ctaLabel: null, ctaHref: null, tone: "forest" },
};

/** The form input names differ from the config keys only for the hero picture (it reuses the cover picture field). */
export const formFieldName = (type: SectionType, key: string): string => {
  if (type === "hero_banner" && key === "imagePublicId") return "coverPublicId";
  if (type === "hero_banner" && key === "imageAlt") return "coverAlt";
  return `c_${key}`;
};

export type ConfigResult<T extends SectionType> = { ok: true; config: SectionConfigMap[T] } | { ok: false; fields: Record<string, string> };

/** Validates a config for its type. Failures are keyed by the form's input names, one message each. */
export function parseSectionConfig<T extends SectionType>(type: T, raw: unknown): ConfigResult<T> {
  const parsed = SECTION_SCHEMAS[type].safeParse(raw);
  if (parsed.success) return { ok: true, config: parsed.data as unknown as SectionConfigMap[T] };
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = formFieldName(type, String(issue.path[0] ?? "config"));
    if (!(key in fields)) fields[key] = issue.message;
  }
  return { ok: false, fields };
}

/**
 * The config as the admin form posts it: every value is text (or missing), repeated choices travel as one comma-separated
 * value, empty text means "not given". Pure, so it is tested without a form.
 */
export function configFromForm(type: SectionType, raw: Record<string, unknown>): Record<string, unknown> {
  const text = (name: string): string | null => {
    const v = raw[name];
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  const list = (name: string): string[] => (text(name) ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  const int = (name: string): number | undefined => {
    const v = text(name);
    return v === null ? undefined : Number(v);
  };
  switch (type) {
    case "hero_banner":
      return { imagePublicId: text("coverPublicId"), imageAlt: text("coverAlt") ?? "", headline: text("c_headline"), subheadline: text("c_subheadline"), ctaLabel: text("c_ctaLabel"), ctaHref: text("c_ctaHref") };
    case "featured_categories":
      return { categoryIds: list("c_categoryIds") };
    case "trending_products":
      return { mode: text("c_mode") ?? undefined, limit: int("c_limit") };
    case "deals":
      return { limit: int("c_limit") };
    case "collections":
      return { collectionIds: list("c_collectionIds") };
    case "guides":
      return { types: list("c_types"), limit: int("c_limit") };
    case "promo_banner":
      return { text: text("c_text") ?? "", ctaLabel: text("c_ctaLabel"), ctaHref: text("c_ctaHref"), tone: text("c_tone") ?? undefined };
  }
}

/** The values the edit form shows for a stored config (text for every input; lists joined by commas). */
export function formValuesFromConfig(type: SectionType, config: unknown): Record<string, string> {
  const c = (config && typeof config === "object" ? config : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
  const l = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").join(",") : "");
  switch (type) {
    case "hero_banner":
      return { coverPublicId: s(c.imagePublicId), coverAlt: s(c.imageAlt), c_headline: s(c.headline), c_subheadline: s(c.subheadline), c_ctaLabel: s(c.ctaLabel), c_ctaHref: s(c.ctaHref) };
    case "featured_categories":
      return { c_categoryIds: l(c.categoryIds) };
    case "trending_products":
      return { c_mode: s(c.mode), c_limit: s(c.limit) };
    case "deals":
      return { c_limit: s(c.limit) };
    case "collections":
      return { c_collectionIds: l(c.collectionIds) };
    case "guides":
      return { c_types: l(c.types), c_limit: s(c.limit) };
    case "promo_banner":
      return { c_text: s(c.text), c_ctaLabel: s(c.ctaLabel), c_ctaHref: s(c.ctaHref), c_tone: s(c.tone) };
  }
}
