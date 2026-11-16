import type { CurrencyCode } from "@/core/validation/money";

export const CONVERSION_STATUSES = ["pending", "approved", "rejected", "paid"] as const;
export type ConversionStatus = (typeof CONVERSION_STATUSES)[number];

export const CONVERSION_STATUS_LABELS: Record<ConversionStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid",
};

export type ConversionRow = {
  id: string;
  linkId: string | null;
  linkSlug: string | null;
  networkId: string | null;
  networkName: string | null;
  externalOrderId: string | null;
  commissionMinor: number;
  currency: string;
  status: string;
  convertedAt: Date;
};

export type ConversionWrite = {
  networkId: string;
  externalOrderId: string;
  linkId: string | null;
  commissionMinor: number;
  currency: CurrencyCode;
  status: ConversionStatus;
  convertedAt: Date;
};

export type ConversionFilters = { q?: string; status?: ConversionStatus; networkId?: string };

export type ImportSummary = {
  filename: string;
  rowsInFile: number;
  inserted: number;
  updated: number;
  unchanged: number;
  failed: number;
  duplicatesInFile: number;
  attributed: number;
  /** The first few problems, each with its line number in the file. */
  errors: string[];
};
