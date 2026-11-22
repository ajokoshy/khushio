/**
 * Release 7B security test list, part 1: structural guards. These read the source and fail if a new admin screen, server
 * action or route handler is added WITHOUT a permission check, so "auth bypass" cannot creep in with a later release.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../src/app");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const files = walk(path.join(ROOT, "admin"));
const rel = (f: string) => path.relative(ROOT, f).replaceAll("\\", "/");
const read = (f: string) => readFileSync(f, "utf8");

const GUARD = /(requirePermission|requireAnyPermission|requirePagePermission|requireSession|requireUser|requireAdmin|auth\()/;

/** A page that only redirects to another admin page (which checks) holds no data and needs no check of its own. */
const REDIRECT_ONLY_PAGES = new Set(["admin/page.tsx"]);

/** The names of this file's own (not exported) helper functions whose body contains a permission check: an action may delegate to one. */
function guardedHelpers(source: string): string[] {
  const starts = [...source.matchAll(/^(?:async function|function|const) (\w+)/gm)];
  return starts.flatMap((m, i) => (GUARD.test(source.slice(m.index!, starts[i + 1]?.index ?? source.length)) ? [m[1] as string] : []));
}
const guarded = (body: string, helpers: string[]) => GUARD.test(body) || helpers.some((h) => new RegExp(`\\b${h}\\(`).test(body));

describe("every admin page checks a permission", () => {
  const pages = files.filter((f) => f.endsWith("/page.tsx"));
  it("finds the admin pages", () => expect(pages.length).toBeGreaterThan(30));
  for (const f of pages.filter((f) => !REDIRECT_ONLY_PAGES.has(rel(f)))) {
    it(`${rel(f)}`, () => {
      expect(read(f), `${rel(f)} must call requirePagePermission (or another permission check)`).toMatch(GUARD);
    });
  }
});

describe("every exported server action checks a permission", () => {
  const actionFiles = files.filter((f) => /actions\.ts$/.test(f));
  it("finds the action files", () => expect(actionFiles.length).toBeGreaterThan(15));
  for (const f of actionFiles) {
    const source = read(f);
    const helpers = guardedHelpers(source);
    const exported = [...source.matchAll(/export async function (\w+)/g)];
    for (let i = 0; i < exported.length; i++) {
      const start = exported[i]!.index!;
      const end = exported[i + 1]?.index ?? source.length;
      it(`${rel(f)} ${exported[i]![1]}`, () => {
        expect(guarded(source.slice(start, end), helpers), `${exported[i]![1]} must call requirePermission, directly or through a helper in the same file that does`).toBe(true);
      });
    }
  }
});

describe("every admin route handler checks a permission", () => {
  for (const f of files.filter((f) => f.endsWith("/route.ts"))) {
    it(rel(f), () => expect(read(f)).toMatch(GUARD));
  }
});

describe("public write endpoints are limited", () => {
  it("the /go route limits click recording", () => expect(read(path.join(ROOT, "go/[slug]/route.ts"))).toMatch(/createRateLimiter/));
  it("the CSP report route limits and caps the body", () => {
    const source = read(path.join(ROOT, "api/csp-report/route.ts"));
    expect(source).toMatch(/createRateLimiter/);
    expect(source).toMatch(/MAX_BODY_BYTES/);
  });
  it("the cron route checks the secret before doing anything", () => {
    const source = read(path.join(ROOT, "api/cron/affiliate-rollup/route.ts"));
    expect(source.indexOf("isCronAuthorized")).toBeGreaterThan(-1);
    expect(source.indexOf("isCronAuthorized")).toBeLessThan(source.indexOf("runDailyMaintenance()"));
  });
  it("no public route handler other than /go, the csp report and the health check accepts POST", () => {
    const publicRoutes = walk(ROOT).filter((f) => f.endsWith("/route.ts") && !rel(f).startsWith("admin/") && !rel(f).startsWith("api/auth/"));
    const withPost = publicRoutes.filter((f) => /export (async )?function POST|export const POST/.test(read(f))).map(rel);
    expect(withPost).toEqual(["api/csp-report/route.ts"]);
  });
});
