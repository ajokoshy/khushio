import type { SeoEntityType } from "@/core/database/schema/content";
import type { SeoFields } from "@/modules/content/types";
import type { SeoIssue } from "./metadata";

export { SEO_ENTITY_TYPES, type SeoEntityType } from "@/core/database/schema/content";
export type { SeoFields };

/** The kinds whose search fields are edited on /admin/seo/[type]/[id]. Articles and pages keep theirs in their own editor. */
export const OVERRIDE_TYPES = ["product", "category", "brand", "store"] as const satisfies readonly SeoEntityType[];
export type OverrideType = (typeof OVERRIDE_TYPES)[number];
export const isOverrideType = (value: string): value is OverrideType => (OVERRIDE_TYPES as readonly string[]).includes(value);

export const AUDIT_TYPES = ["product", "category", "brand", "store", "article", "page"] as const satisfies readonly SeoEntityType[];
export type AuditType = (typeof AUDIT_TYPES)[number];
export const isAuditType = (value: string): value is AuditType => (AUDIT_TYPES as readonly string[]).includes(value);
export const AUDIT_TYPE_LABELS: Record<AuditType, string> = { product: "Products", category: "Categories", brand: "Brands", store: "Stores", article: "Articles and guides", page: "Pages" };
export const AUDIT_TYPE_SINGULAR: Record<AuditType, string> = { product: "Product", category: "Category", brand: "Brand", store: "Store", article: "Article", page: "Page" };

export type AuditRow = {
  type: AuditType;
  id: string;
  slug: string;
  name: string;
  /** The page's address. */
  path: string;
  /** What the editor typed in the search fields, if anything. */
  overrideTitle: string | null;
  overrideDescription: string | null;
  robots: string | null;
  issues: SeoIssue[];
};

export type EntitySummary = { type: OverrideType; id: string; slug: string; name: string; path: string };
