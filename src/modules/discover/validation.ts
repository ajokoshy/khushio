import { z } from "zod";
import { checkbox, intField, nameField, optionalSlugField, optionalText, optionalUrl, optionalUuid } from "@/core/validation/fields";

export const categoryInputSchema = z.object({
  name: nameField(),
  slug: optionalSlugField,
  parentId: optionalUuid,
  description: optionalText(500),
  sortOrder: intField(0, 9999, 0),
  /** Edit form only: must be ticked for the slug to change (see core/validation/slug-rules.ts). */
  confirmSlugChange: checkbox,
});
export type CategoryInput = z.output<typeof categoryInputSchema>;

export const brandInputSchema = z.object({
  name: nameField(),
  slug: optionalSlugField,
  description: optionalText(1000),
  logoUrl: optionalUrl({ httpsOnly: true }),
  isFeatured: checkbox,
  confirmSlugChange: checkbox,
});
export type BrandInput = z.output<typeof brandInputSchema>;

export { idSchema } from "@/core/validation/fields";

export const statusFilterSchema = z.enum(["all", "active", "archived"]).catch("all");
