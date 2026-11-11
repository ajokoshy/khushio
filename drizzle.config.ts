import { defineConfig } from "drizzle-kit";

// Migrations use a DIRECT (non-pooled) connection; the app uses the pooled one.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/core/database/schema/index.ts",
  out: "./drizzle/migrations",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "" },
  strict: true,
  verbose: true,
});
