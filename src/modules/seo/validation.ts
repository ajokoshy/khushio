import { z } from "zod";
import { optionalText, optionalUrl } from "@/core/validation/fields";
import { ROBOTS_VALUES, type RobotsValue } from "@/modules/content/types";
import { isAuditType, isOverrideType } from "./types";

export { idSchema } from "@/core/validation/fields";

/** The same search fields, with the same limits, as the article and page editors. Every field empty means "no override". */
export const seoOverrideSchema = z.object({
  seoTitle: optionalText(70),
  seoDescription: optionalText(170),
  seoCanonical: optionalUrl({ httpsOnly: true }),
  seoOgImage: optionalUrl({ httpsOnly: true }),
  seoRobots: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || (ROBOTS_VALUES as readonly string[]).includes(v), "Choose one of the listed options")
    .transform((v) => v as RobotsValue | null),
});
export type SeoOverrideInput = z.output<typeof seoOverrideSchema>;

export const overrideTypeSchema = z.string().refine(isOverrideType, "Unknown kind of page");
export const auditTypeSchema = z.string().refine(isAuditType);
