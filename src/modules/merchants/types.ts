export type { StatusFilter } from "@/modules/discover/types";

export type MerchantRow = {
  id: string;
  slug: string;
  name: string;
  websiteUrl: string | null;
  allowedDomains: string[];
  logoUrl: string | null;
  isActive: boolean;
};

export type MerchantWrite = {
  slug: string;
  name: string;
  websiteUrl: string | null;
  allowedDomains: string[];
  logoUrl: string | null;
};

export type MerchantUsage = { affiliateLinks: number; programs: number };
