import { z } from "zod";
import { isRedirectStatus, normalizePath, PATH_MAX_LENGTH } from "./path";

export { idSchema } from "@/core/validation/fields";

const BAD_PATH = "Enter a path on this site that starts with /, for example /products/old-name (no https://, no ? and no spaces).";

const pathField = (required: string) =>
  z
    .string({ required_error: required })
    .trim()
    .min(1, required)
    .max(PATH_MAX_LENGTH, `Keep it under ${PATH_MAX_LENGTH} characters`)
    .transform((v, ctx) => {
      const path = normalizePath(v);
      if (path === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: BAD_PATH });
      return path ?? v;
    });

/** The form posts the status as text; an empty "to" means none (only a 410 may have none: the service checks the combination). */
export const redirectInputSchema = z.object({
  fromPath: pathField("Enter the old address"),
  toPath: z
    .string()
    .trim()
    .max(PATH_MAX_LENGTH)
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const path = normalizePath(v);
      if (path === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: BAD_PATH });
      return path ?? v;
    }),
  statusCode: z.coerce.number({ invalid_type_error: "Choose a status" }).int().refine(isRedirectStatus, "Choose 301, 302 or 410"),
});
export type RedirectInput = z.output<typeof redirectInputSchema>;
