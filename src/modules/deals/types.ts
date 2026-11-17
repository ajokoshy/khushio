import type { CurrencyCode } from "@/core/validation/money";

export const DEAL_TYPES = ["deal", "coupon", "promotion"] as const;
export type DealType = (typeof DEAL_TYPES)[number];
export const DEAL_TYPE_LABELS: Record<DealType, string> = { deal: "Deal", coupon: "Coupon", promotion: "Store promotion" };

export const DEAL_STATUSES = ["draft", "published", "archived"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];
export const DEAL_STATUS_LABELS: Record<DealStatus, string> = { draft: "Draft", published: "Published", archived: "Archived" };

/** What an offer is doing right now. Computed from status and dates, never stored. */
export const DEAL_STATES = ["draft", "archived", "scheduled", "live", "expired"] as const;
export type DealState = (typeof DEAL_STATES)[number];
export const DEAL_STATE_LABELS: Record<DealState, string> = { draft: "Draft", archived: "Archived", scheduled: "Scheduled", live: "Live", expired: "Expired" };

/** The filter on the admin list: one state, or everything. */
export type DealStateFilter = "all" | DealState;

export const DISCOUNT_TYPES = ["percent", "fixed", "free_shipping", "other"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];
export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = { percent: "Percent off", fixed: "Amount off", free_shipping: "Free shipping", other: "Other" };

export type DealRow = {
  id: string;
  slug: string;
  title: string;
  merchantId: string;
  merchantName: string;
  merchantActive: boolean;
  type: string;
  description: string | null;
  affiliateLinkId: string | null;
  affiliateLinkSlug: string | null;
  startsAt: Date;
  endsAt: Date | null;
  isFeatured: boolean;
  sortOrder: number;
  status: string;
  productCount: number;
  categoryCount: number;
  couponCount: number;
};

export type DealWrite = {
  slug: string;
  title: string;
  merchantId: string;
  type: DealType;
  description: string | null;
  affiliateLinkId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  isFeatured: boolean;
  sortOrder: number;
  status: DealStatus;
};

export type DealFilters = { q?: string; state: DealStateFilter; merchantId?: string };

export type CouponRow = {
  id: string;
  dealId: string | null;
  dealSlug: string | null;
  dealTitle: string | null;
  merchantId: string;
  merchantName: string;
  code: string;
  discountType: string;
  discountValue: number;
  currency: string;
  minSpendMinor: number | null;
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
};

export type CouponWrite = {
  dealId: string | null;
  merchantId: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  currency: CurrencyCode;
  minSpendMinor: number | null;
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
};

export type CouponFilters = { q?: string; merchantId?: string; liveOnly?: boolean };

/**
 * What the public site gets. Times are ISO strings, not Dates, because these rows pass through Next's data cache
 * (JSON): a Date would come back as a string anyway. The page filters them again with the clock at render time.
 */
export type PublicCoupon = {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  currency: string;
  minSpendMinor: number | null;
  startsAt: string;
  endsAt: string | null;
};

export type PublicDeal = {
  id: string;
  slug: string;
  title: string;
  type: string;
  description: string | null;
  merchantName: string;
  merchantSlug: string;
  /** Slug of the affiliate link behind the offer's button, only when that link and its store are active. */
  linkSlug: string | null;
  startsAt: string;
  endsAt: string | null;
  isFeatured: boolean;
  /** "store" (no product or category attached), "products" or "categories". */
  scope: "store" | "products" | "categories";
  coupons: PublicCoupon[];
};

export type PublicStandaloneCoupon = PublicCoupon & { merchantName: string; merchantSlug: string };

export type DealsPage = { deals: PublicDeal[]; coupons: PublicStandaloneCoupon[] };
