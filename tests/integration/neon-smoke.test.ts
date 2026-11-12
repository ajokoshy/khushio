/**
 * Runs only when TEST_DATABASE_URL (the Neon `test` branch, pooled string) is set, for example in CI
 * with the TEST_DATABASE_URL secret. It checks the branch was prepared with firstload and every phase
 * script. It only reads. Never point TEST_DATABASE_URL at production.
 */
import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Neon test branch", () => {
  it("has every table and the Release 2C and 3A additions", async () => {
    const run = neon(url as string);
    const tables = (await run`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`).map((r) => r.table_name as string);
    expect(tables).toContain("login_attempts");
    expect(tables.length).toBe(30);
    const cols = await run`SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'is_active'`;
    expect(cols.length).toBe(1);
    const idx = await run`SELECT 1 FROM pg_indexes WHERE indexname = 'categories_parent_name_uq'`;
    expect(idx.length).toBe(1);
  });
});
