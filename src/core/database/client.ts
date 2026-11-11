import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { requireEnv } from "@/core/config/env";
import * as schema from "./schema";

let _db: ReturnType<typeof makeDb> | undefined;

function makeDb() {
  return drizzle(neon(requireEnv("DATABASE_URL")), { schema });
}

/** Lazy so builds and tests without a database do not fail on import. */
export function db() {
  return (_db ??= makeDb());
}
