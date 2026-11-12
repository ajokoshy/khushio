import { z } from "zod";
import { checkbox, nameField, optionalSlugField, optionalUrl } from "@/core/validation/fields";
import { parseAllowedDomains } from "./domains";

const allowedDomainsField = z
  .string()
  .max(4000, "That list is too long")
  .optional()
  .transform((text, ctx) => {
    const { domains, errors } = parseAllowedDomains(text ?? "");
    if (errors.length > 0) {
      ctx.addIssue({ code: "custom", message: errors.join(" ") });
      return z.NEVER;
    }
    return domains;
  });

export const merchantInputSchema = z.object({
  name: nameField(),
  slug: optionalSlugField,
  websiteUrl: optionalUrl(),
  allowedDomains: allowedDomainsField,
  logoUrl: optionalUrl({ httpsOnly: true }),
  confirmSlugChange: checkbox,
});
export type MerchantInput = z.output<typeof merchantInputSchema>;

export { idSchema } from "@/core/validation/fields";
