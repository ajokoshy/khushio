import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().url().optional(),
  DATABASE_URL_UNPOOLED: z.string().url().optional(),
  AUTH_SECRET: z.string().min(32).optional(),
  AUTH_TRUST_HOST: z.string().optional(),
  // Local-only, read by scripts/create-admin.ts. Do not set these in Vercel.
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_NAME: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

// Empty strings (e.g. a blank line in .env.local or an unset CI secret) count as "not set".
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
const parsed = schema.safeParse(raw);
if (!parsed.success) {
  throw new Error("Invalid environment: " + JSON.stringify(parsed.error.flatten().fieldErrors));
}

/** Server-only. Never import this file from a client component. */
export const env = parsed.data;

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const v = env[key];
  if (v === undefined || v === null || v === "") throw new Error(`Missing required env var ${String(key)}`);
  return v as NonNullable<(typeof env)[K]>;
}
