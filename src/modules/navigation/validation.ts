import { z } from "zod";
import { checkbox } from "@/core/validation/fields";
import { isSafeLinkTarget, LINK_TARGET_MESSAGE } from "@/modules/homepage/links";
import { NAV_AREAS } from "./types";

export { idSchema } from "@/core/validation/fields";

export const navItemInputSchema = z.object({
  area: z.enum(NAV_AREAS, { errorMap: () => ({ message: "Choose header or footer" }) }),
  label: z.string({ required_error: "Enter the link text" }).trim().min(1, "Enter the link text").max(40, "Keep it under 40 characters"),
  href: z.string({ required_error: "Enter the address" }).trim().min(1, "Enter the address").max(2048).refine(isSafeLinkTarget, LINK_TARGET_MESSAGE),
  isActive: checkbox,
});
export type NavItemInput = z.output<typeof navItemInputSchema>;
