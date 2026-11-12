import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/core/database/schema";

const DIR = path.resolve(__dirname, "../../drizzle/migrations");

/**
 * A real Postgres (embedded, in memory) with firstload and every phase script applied, wrapped in the
 * same Drizzle schema the app uses. Repository and service tests run real SQL against it, no Neon needed.
 */
export async function createTestDatabase() {
  const client = new PGlite({ extensions: { pgcrypto } });
  const files = ["khushio-sql-firstload.sql", ...fs.readdirSync(DIR).filter((f) => /^khushio-sql-phase-.+\.sql$/.test(f)).sort()];
  for (const file of files) await client.exec(fs.readFileSync(path.join(DIR, file), "utf8"));
  return { client, db: drizzle(client, { schema }) };
}
