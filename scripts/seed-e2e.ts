/**
 * Creates (or resets the password of) the two users the Playwright suite signs in as.
 * ONLY for a dedicated Neon test branch. Refuses to run unless E2E_SEED_CONFIRM=yes and both
 * emails end in @example.test.
 *   E2E_SEED_CONFIRM=yes E2E_ADMIN_EMAIL=e2e-admin@example.test E2E_ADMIN_PASSWORD=... \
 *   E2E_ANALYST_EMAIL=e2e-analyst@example.test E2E_ANALYST_PASSWORD=... npm run test:e2e:seed
 */
import { createAdminUser, resetAdminPassword } from "@/core/auth/service";
import { syncRbac } from "@/core/permissions/repository";
import type { RoleKey } from "@/core/permissions/matrix";

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function upsert(email: string, password: string, role: RoleKey) {
  if (!email.endsWith("@example.test")) throw new Error(`${email}: E2E users must use an @example.test address`);
  try {
    await createAdminUser({ email, password, role, name: `E2E ${role}` });
    console.log(`created ${email} (${role})`);
  } catch (error) {
    if (!(error instanceof Error) || !/already exists/.test(error.message)) throw error;
    await resetAdminPassword(email, password);
    console.log(`reset password for ${email}`);
  }
}

async function main() {
  if (process.env.E2E_SEED_CONFIRM !== "yes") throw new Error("Set E2E_SEED_CONFIRM=yes to confirm this is a test database.");
  await syncRbac();
  await upsert(need("E2E_ADMIN_EMAIL"), need("E2E_ADMIN_PASSWORD"), "super_admin");
  await upsert(need("E2E_ANALYST_EMAIL"), need("E2E_ANALYST_PASSWORD"), "analyst");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
