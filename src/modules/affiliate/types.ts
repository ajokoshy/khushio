export type { StatusFilter } from "@/modules/discover/types";

export type NetworkRow = { id: string; key: string; name: string; isActive: boolean };
export type NetworkWrite = { key: string; name: string; isActive: boolean };
export type NetworkUsage = { programs: number; conversions: number };

export type ProgramRow = {
  id: string;
  merchantId: string;
  merchantName: string;
  networkId: string;
  networkName: string;
  externalProgramId: string | null;
  commissionNote: string | null;
  isActive: boolean;
};
export type ProgramWrite = {
  merchantId: string;
  networkId: string;
  externalProgramId: string | null;
  commissionNote: string | null;
  isActive: boolean;
};

export type LinkRow = {
  id: string;
  slug: string;
  destinationUrl: string;
  trackingParams: string | null;
  isActive: boolean;
  lastVerifiedAt: Date | null;
  merchantId: string;
  merchantName: string;
  merchantActive: boolean;
  merchantDomains: string[];
  productId: string | null;
  productName: string | null;
  productSlug: string | null;
};
/** A link as shown in the admin list, with the live result of the destination safety check. */
export type LinkListRow = LinkRow & { problem: string | null };
export type LinkWrite = {
  slug: string;
  merchantId: string;
  productId: string | null;
  destinationUrl: string;
  trackingParams: string | null;
  isActive: boolean;
};
/** What a link has collected: any of these makes deleting it unsafe (archive instead). */
export type LinkHistory = { clicks: number; dailyRows: number; conversions: number };

export type ProductRef = { id: string; slug: string; name: string };
export type MerchantOption = { id: string; name: string; isActive: boolean; allowedDomains: string[] };
export type NetworkOption = { id: string; name: string; isActive: boolean };

export type VerifyOutcome = "ok" | "problem" | "unclear" | "unreachable" | "refused";
export type VerifyResult = { outcome: VerifyOutcome; status: number | null; message: string };
