import { z } from "zod";
import { parseAdminDateTime } from "@/core/validation/datetime";
import { SLUG_PATTERN } from "@/core/validation/slug";
import { CURRENCY_CODES, DEFAULT_CURRENCY } from "@/core/validation/money";
import { parseCommission } from "./rows";
import { CONVERSION_STATUSES } from "./types";

export { idSchema } from "@/core/validation/fields";

export const conversionInputSchema = z
  .object({
    networkId: z.string({ required_error: "Choose a network" }).uuid("Choose a network"),
    externalOrderId: z.string({ required_error: "Enter the order id" }).trim().min(1, "Enter the order id").max(120, "Keep it under 120 characters"),
    linkSlug: z
      .string()
      .trim()
      .toLowerCase()
      .max(80, "Keep it under 80 characters")
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || SLUG_PATTERN.test(v), "Enter the link's slug as shown in the links list"),
    commission: z.string({ required_error: "Enter the commission (0 if none)" }).trim().min(1, "Enter the commission (0 if none)"),
    currency: z.enum(CURRENCY_CODES, { errorMap: () => ({ message: "Choose a currency" }) }).default(DEFAULT_CURRENCY),
    status: z.enum(CONVERSION_STATUSES, { errorMap: () => ({ message: "Choose a status" }) }),
    convertedAt: z.string({ required_error: "Enter the date and time" }).trim().min(1, "Enter the date and time"),
  })
  .transform((v, ctx) => {
    const commission = parseCommission(v.commission, v.currency);
    if (!commission.ok) ctx.addIssue({ code: "custom", path: ["commission"], message: commission.error.charAt(0).toUpperCase() + commission.error.slice(1) });
    const convertedAt = parseAdminDateTime(v.convertedAt);
    if (!convertedAt) ctx.addIssue({ code: "custom", path: ["convertedAt"], message: "Enter a real date and time" });
    if (!commission.ok || !convertedAt) return z.NEVER;
    return {
      networkId: v.networkId,
      externalOrderId: v.externalOrderId,
      linkSlug: v.linkSlug,
      commissionMinor: commission.value,
      currency: v.currency,
      status: v.status,
      convertedAt,
    };
  });
export type ConversionInput = z.output<typeof conversionInputSchema>;

export const importFormSchema = z.object({
  networkId: z.string({ required_error: "Choose a network" }).uuid("Choose a network"),
  currency: z.enum(CURRENCY_CODES).default(DEFAULT_CURRENCY),
});
