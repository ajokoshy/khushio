#!/usr/bin/env node
/**
 * Release 7B: proves that admin-only code is not sent to visitors. After `npm run build`, reads the files each PUBLIC page loads
 * (.next/app-build-manifest.json) and fails if any of them contains code that only the admin needs (the rich-text editor,
 * the CSV import engine, the admin screens), or if a public page is heavier than the budget.
 * Run:  npm run build && npm run check:bundles
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const dist = path.join(process.cwd(), ".next");
const manifestPath = path.join(dist, "app-build-manifest.json");
if (!existsSync(manifestPath)) {
  console.error("Bundle check: .next/app-build-manifest.json not found. Run `npm run build` first.");
  process.exit(2);
}
const pages = JSON.parse(readFileSync(manifestPath, "utf8")).pages ?? {};

// Strings that appear in the editor and admin code and nowhere a visitor needs.
const ADMIN_MARKERS = ["prosemirror-state", "prosemirror-view", "@tiptap", "tiptap-extension", "ProseMirror", "react-hook-form", "useForm(", "/admin/import", "Import wizard", "Drag to reorder"];
// First-load JavaScript budget for a public page (kilobytes, uncompressed). Gzip is roughly a third of it.
const BUDGET_KB = 450;

const isPublic = (route) => !route.includes("/admin") && !route.includes("/(auth)") && !route.includes("/api/") && !route.includes("/_not-found") && /\/page$/.test(route);
const failures = [];
const rows = [];
for (const [route, files] of Object.entries(pages)) {
  if (!isPublic(route)) continue;
  const js = [...new Set(files)].filter((f) => f.endsWith(".js"));
  let bytes = 0;
  for (const f of js) {
    const full = path.join(dist, f);
    if (!existsSync(full)) continue;
    bytes += statSync(full).size;
    const text = readFileSync(full, "utf8");
    for (const marker of ADMIN_MARKERS) if (text.includes(marker)) failures.push(`${route} loads ${f}, which contains admin-only code (${marker})`);
  }
  rows.push([route, Math.round(bytes / 1024)]);
  if (bytes / 1024 > BUDGET_KB) failures.push(`${route} loads ${Math.round(bytes / 1024)} KB of JavaScript (budget ${BUDGET_KB} KB)`);
}
rows.sort((a, b) => b[1] - a[1]);
console.log("First-load JavaScript of public pages (KB, uncompressed):");
for (const [route, kb] of rows) console.log(`  ${String(kb).padStart(5)}  ${route.replace(/\/page$/, "") || "/"}`);
if (failures.length > 0) {
  console.error("\nBundle check failed:");
  for (const f of [...new Set(failures)]) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`\nBundle check: ${rows.length} public pages, no admin-only code, all under ${BUDGET_KB} KB`);
