import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 12;
/** bcrypt only uses the first 72 bytes, so longer passwords would be silently truncated. */
export const MAX_PASSWORD_BYTES = 72;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // No policy checks at login: only bound the size so a huge body cannot be used to burn CPU.
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Policy for creating or changing a password (create-admin script, future user management). */
export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
  .refine((v) => new TextEncoder().encode(v).length <= MAX_PASSWORD_BYTES, `Use at most ${MAX_PASSWORD_BYTES} bytes`);

export const adminEmailSchema = z.string().trim().toLowerCase().email().max(254);
