import { z } from "zod";
import { SLUG_PATTERN } from "@/core/validation/slug";
import { checkbox, nameField, optionalSlugField, optionalText } from "@/core/validation/fields";
import { parseTrackingParams } from "./destination";

export { idSchema } from "@/core/validation/fields";

export const networkInputSchema = z.object({
  name: nameField(),
  key: optionalSlugField,
  isActive: checkbox,
});
export type NetworkInput = z.output<typeof networkInputSchema>;

export const programInputSchema = z.object({
  merchantId: z.string({ required_error: "Choose a merchant" }).uuid("Choose a merchant"),
  networkId: z.string({ required_error: "Choose a network" }).uuid("Choose a network"),
  externalProgramId: optionalText(120),
  commissionNote: optionalText(500),
  isActive: checkbox,
});
export type ProgramInput = z.output<typeof programInputSchema>;

const trackingField = z
  .string()
  .optional()
  .transform((text, ctx) => {
    const parsed = parseTrackingParams(text);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.error });
      return z.NEVER;
    }
    return parsed.value;
  });

const productSlugField = z
  .string()
  .trim()
  .toLowerCase()
  .max(80, "Keep it under 80 characters")
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || SLUG_PATTERN.test(v), "Enter the product's slug exactly as shown on its edit page");

export const linkInputSchema = z.object({
  merchantId: z.string({ required_error: "Choose a merchant" }).uuid("Choose a merchant"),
  productSlug: productSlugField,
  destinationUrl: z.string({ required_error: "Enter the destination address" }).trim().min(1, "Enter the destination address").max(2048, "Keep it under 2048 characters"),
  trackingParams: trackingField,
  slug: optionalSlugField,
  confirmSlugChange: checkbox,
  isActive: checkbox,
});
export type LinkInput = z.output<typeof linkInputSchema>;
