/**
 * Idempotent: inserts/updates roles, permissions and role_permissions to match src/core/permissions/matrix.ts.
 * Run once per environment (and again whenever the matrix changes):
 *   npm run db:seed-rbac
 * Against production, from your machine only:
 *   DATABASE_URL="<production pooled string>" npm run db:seed-rbac
 */
import { syncRbac } from "@/core/permissions/repository";

async function main() {
  const result = await syncRbac();
  console.log(`RBAC synced: ${result.roles} roles, ${result.permissions} permissions, ${result.grants} grants.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
