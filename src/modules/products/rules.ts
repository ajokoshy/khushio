import { PRODUCT_STATUSES, type ProductStatus } from "./types";

/** Statuses that put a product in front of visitors, take it away, or mark it as finished. They need product:publish. */
const PUBLISH_CONTROLLED: ReadonlySet<ProductStatus> = new Set(["SCHEDULED", "PUBLISHED", "ARCHIVED", "DISCONTINUED"]);

export function isProductStatus(value: string): value is ProductStatus {
  return (PRODUCT_STATUSES as readonly string[]).includes(value);
}

/**
 * A message when this status change is not allowed for this person, otherwise null.
 * Without product:publish a person can edit a product and move it between DRAFT and REVIEW, but cannot
 * publish, schedule, archive or discontinue it, and cannot pull a live product back to a draft.
 */
export function statusChangeProblem(current: ProductStatus | null, next: ProductStatus, canPublish: boolean): string | null {
  if (current === next || canPublish) return null;
  if (PUBLISH_CONTROLLED.has(next)) return "Your account can save drafts but cannot publish, schedule or archive products.";
  if (current !== null && PUBLISH_CONTROLLED.has(current)) return "Your account cannot change the status of a product that is published, scheduled or archived.";
  return null;
}

/** New products start as a draft or in review. Images are added afterwards, so publishing happens on the edit screen. */
export function creationStatusProblem(status: ProductStatus): string | null {
  return status === "DRAFT" || status === "REVIEW" ? null : "Save the product as a draft first. Add images, then publish it from the edit screen.";
}

/** What a product still needs before visitors can see it (empty list: ready). Only checked for PUBLISHED and SCHEDULED. */
export function publishBlockers(input: { status: ProductStatus; primaryCategoryActive: boolean; imageCount: number }): string[] {
  if (input.status !== "PUBLISHED" && input.status !== "SCHEDULED") return [];
  const out: string[] = [];
  if (!input.primaryCategoryActive) out.push("Choose an active main category.");
  if (input.imageCount < 1) out.push("Add at least one image.");
  return out;
}

/** A published or scheduled product, or one with affiliate links, is archived rather than deleted. */
export function deleteProblem(input: { status: ProductStatus; affiliateLinks: number }): string | null {
  if (input.status === "PUBLISHED" || input.status === "SCHEDULED") return "Archive this product before deleting it.";
  if (input.affiliateLinks > 0) return `${input.affiliateLinks} affiliate link${input.affiliateLinks === 1 ? " uses" : "s use"} this product, so it cannot be deleted. Archive it instead.`;
  return null;
}
