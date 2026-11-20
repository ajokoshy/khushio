/**
 * Runs only when TEST_DATABASE_URL (the Neon `test` branch, pooled string) is set, for example in CI
 * with the TEST_DATABASE_URL secret. It checks the branch was prepared with firstload and every phase
 * script. It only reads. Never point TEST_DATABASE_URL at production.
 */
import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Neon test branch", () => {
  it("has every table and the Release 2C, 3A, 3B, 3C, 5A, 6A and 6B additions", async () => {
    const run = neon(url as string);
    const tables = (await run`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`).map((r) => r.table_name as string);
    expect(tables).toContain("login_attempts");
    expect(tables).toEqual(expect.arrayContaining(["deals", "coupons", "deal_products", "deal_categories"]));
    expect(tables).toEqual(expect.arrayContaining(["author_profiles", "content_categories", "content_tags", "articles", "article_tags", "pages", "seo_metadata"]));
    expect(tables.length).toBe(41);
    const cols = await run`SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'is_active'`;
    expect(cols.length).toBe(1);
    const idx = await run`SELECT 1 FROM pg_indexes WHERE indexname = 'categories_parent_name_uq'`;
    expect(idx.length).toBe(1);
    const later = await run`SELECT indexname FROM pg_indexes WHERE indexname IN ('media_hash_uq', 'variants_sku_uq', 'pc_one_primary_uq', 'products_search_idx', 'products_name_trgm_idx', 'products_listing_idx')`;
    expect(later.length).toBe(6);
    const articleType = await run`SELECT 1 FROM information_schema.columns WHERE table_name = 'articles' AND column_name = 'type'`;
    expect(articleType.length).toBe(1);
    const typeIdx = await run`SELECT 1 FROM pg_indexes WHERE indexname = 'articles_type_status_publish_idx'`;
    expect(typeIdx.length).toBe(1);
    const vector = await run`SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'search_vector'`;
    expect(vector.length).toBe(1);
  });
});
