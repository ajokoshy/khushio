import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const tables = [...read("lib/db/schema.ts").matchAll(/pgTable\("(\w+)"/g)].map((m) => m[1]);
const migrations = readdirSync(join(root, "db/migrations")).sort();
describe("database scripts stay in sync with the code", () => {
  it("finds the tables", () => expect(tables.length).toBeGreaterThanOrEqual(14));
  it.each(tables)("db/schema.sql creates %s", (t) => expect(read("db/schema.sql")).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${t}\\b`)));
  it("numbers migrations contiguously from 001", () => migrations.forEach((f, i) => expect(f.startsWith(String(i + 1).padStart(3, "0") + "_"), f).toBe(true)));
  it("README lists the latest migration", () => expect(read("db/README.md")).toContain(migrations.at(-1)!.slice(0, 3)));
  it("every migration is idempotent", () => { for (const f of migrations) { const sql = read(`db/migrations/${f}`); expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/); expect(sql).not.toMatch(/ADD COLUMN (?!IF NOT EXISTS)/); expect(sql).not.toMatch(/DROP /i); } });
  it("seed data only inserts, never deletes", () => expect(read("db/seed.sql")).not.toMatch(/DELETE|TRUNCATE|DROP/i));
});
