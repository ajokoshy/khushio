import { defineConfig } from "drizzle-kit";

// Only used by `npm run db:studio` (a read-only browser for the database).
// Schema changes are applied with the hand-written, re-runnable SQL files in drizzle/migrations
// (see drizzle/migrations/README.md), NOT with drizzle-kit migrate. Studio uses the DIRECT string.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/core/database/schema/index.ts",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "" },
});
