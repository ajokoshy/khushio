export type DayClicks = { day: string; clicks: number };
export type ClickLinkRow = { linkId: string; slug: string; merchantName: string; productName: string | null; clicks: number };
export type ClickMerchantRow = { merchantId: string; merchantName: string; clicks: number };
export type ClickProductRow = { productId: string; productName: string; productSlug: string; clicks: number };
export type ZeroClickLink = { linkId: string; slug: string; merchantName: string; productName: string | null; createdAt: Date };
export type ConversionTotals = { status: string; currency: string; orders: number; commissionMinor: number };

export type ClickReport = {
  range: { from: string; to: string; days: number };
  totalClicks: number;
  todaySoFar: number;
  byDay: DayClicks[];
  topLinks: ClickLinkRow[];
  byMerchant: ClickMerchantRow[];
  byProduct: ClickProductRow[];
  zeroClickLinks: ZeroClickLink[];
  conversions: ConversionTotals[];
};
