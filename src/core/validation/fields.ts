import { z } from "zod";
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from "./slug";

/**
 * Zod building blocks for admin forms. Forms post FormData, so every value arrives as a string
 * (or is missing): empty text means "not given", a ticked checkbox is "on".
 */

/** A record id coming from a URL or a bound action argument. */
export const idSchema = z.string().uuid();

export const nameField = (label = "name") =>
  z.string({ required_error: `Enter a ${label}` }).trim().min(1, `Enter a ${label}`).max(120, "Keep it under 120 characters");

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .optional()
    .transform((v) => (v ? v : null));

/** Empty means "generate one from the name". Anything else must already be a clean slug. */
export const optionalSlugField = z
  .string()
  .trim()
  .toLowerCase()
  .max(SLUG_MAX_LENGTH, `Keep it under ${SLUG_MAX_LENGTH} characters`)
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || SLUG_PATTERN.test(v), "Use lower-case letters, numbers and single hyphens, for example home-kitchen");

export const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.string().uuid().safeParse(v).success, "Choose one of the listed options");

export const checkbox = z.unknown().transform((v) => v === "on" || v === "true" || v === "1" || v === true);

export const intField = (min: number, max: number, fallback: number) =>
  z.preprocess(
    (v) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? fallback : v),
    z.coerce.number({ invalid_type_error: "Enter a whole number" }).int("Enter a whole number").min(min, `At least ${min}`).max(max, `At most ${max}`),
  );

/** http(s) only, no username or password in the address. Empty means "none". */
export function optionalUrl(options: { httpsOnly?: boolean } = {}) {
  return z
    .string()
    .trim()
    .max(2048, "Keep it under 2048 characters")
    .optional()
    .transform((v) => (v ? v : null))
    .superRefine((value, ctx) => {
      if (value === null) return;
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        ctx.addIssue({ code: "custom", message: "Enter a full web address starting with https://" });
        return;
      }
      const allowed = options.httpsOnly ? ["https:"] : ["https:", "http:"];
      if (!allowed.includes(url.protocol)) ctx.addIssue({ code: "custom", message: options.httpsOnly ? "The address must start with https://" : "The address must start with https:// or http://" });
      else if (url.username || url.password) ctx.addIssue({ code: "custom", message: "Remove the username and password from the address" });
    });
}

/** Turns a Zod error into { fieldName: firstMessage } for forms. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** FormData to a plain object of strings (files and repeated keys are not used by these forms). */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue; // React/Next internals
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
