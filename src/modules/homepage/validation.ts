import { z } from "zod";
import { parseAdminDateTime } from "@/core/validation/datetime";
import { checkbox, optionalText } from "@/core/validation/fields";
import { SECTION_TYPES } from "./config";

export { idSchema } from "@/core/validation/fields";

const optionalDateTime = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const date = parseAdminDateTime(v);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "Enter a real date and time" });
      return z.NEVER;
    }
    return date;
  });

/** The fields every section has. The type-specific config is read separately (configFromForm) and validated per type. */
export const sectionInputSchema = z.object({
  type: z.enum(SECTION_TYPES, { errorMap: () => ({ message: "Choose a section type" }) }),
  heading: optionalText(80),
  isEnabled: checkbox,
  publishAt: optionalDateTime,
});
export type SectionInput = z.output<typeof sectionInputSchema>;

export const moveDirectionSchema = z.enum(["up", "down"]);
