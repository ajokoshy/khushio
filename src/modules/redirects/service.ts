import { revalidateTag } from "next/cache";
import { logAuditBestEffort } from "@/core/audit";
import { CACHE_TAGS } from "@/core/config/cache";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { checkRule } from "./path";
import * as repo from "./repository";
import { PUBLIC_PATHS, type PublicPathKind, type RedirectRow, type ShadowedRule } from "./types";
import type { RedirectInput } from "./validation";

/**
 * Redirects (Release 7A). Three ways a rule appears:
 *   - a slug changes     -> the repository of that module writes a 301 in the same atomic write (core/database/redirect-statements.ts)
 *   - a page is deleted  -> the same, as a 410
 *   - someone types one  -> /admin/redirects (this file), with the no-chains rule enforced
 * Every write clears the tag `redirects`, so the middleware picks the change up within about a minute.
 */

const touch = () => revalidateTag(CACHE_TAGS.redirects);

export async function listRules(opts: { q?: string; limit: number; offset: number }) {
  const rows = await repo.selectRules({ ...opts, limit: opts.limit + 1 });
  return { rows: rows.slice(0, opts.limit), hasNext: rows.length > opts.limit };
}

export const countRules = () => repo.countRules();

export async function getRule(id: string): Promise<RedirectRow> {
  const row = await repo.selectRuleById(id);
  if (!row) throw new NotFoundError("Redirect not found");
  return row;
}

function normalise(input: RedirectInput) {
  return { fromPath: input.fromPath, toPath: input.statusCode === 410 ? null : input.toPath, statusCode: input.statusCode as 301 | 302 | 410 };
}

async function assertAllowed(next: ReturnType<typeof normalise>, skipFrom?: string): Promise<void> {
  const existing = (await repo.selectAllRules()).filter((r) => r.fromPath !== skipFrom);
  const problem = checkRule(next, existing);
  if (problem) throw new ValidationError("Redirect not allowed", { [problem.field]: problem.message });
}

export async function createRule(input: RedirectInput, actorId: string): Promise<string> {
  if ((await repo.countRules()) >= repo.MAP_LIMIT) throw new ConflictError(`There are already ${repo.MAP_LIMIT} redirects, the most the site keeps. Delete old ones first.`);
  const next = normalise(input);
  await assertAllowed(next);
  let id: string;
  try {
    id = await repo.insertRule(next, "manual");
  } catch {
    throw new ValidationError("Redirect not allowed", { fromPath: "That old address already has a rule. Edit it instead." });
  }
  await logAuditBestEffort({ actor: actorId, action: "redirect.created", entityType: "redirect", entityId: id, metadata: { from: next.fromPath, to: next.toPath, status: next.statusCode } });
  touch();
  return id;
}

export async function updateRule(id: string, input: RedirectInput, actorId: string): Promise<void> {
  const current = await getRule(id);
  const next = normalise(input);
  if (current.fromPath === next.fromPath && current.toPath === next.toPath && current.statusCode === next.statusCode) return;
  await assertAllowed(next, current.fromPath);
  try {
    await repo.updateRuleRow(id, next);
  } catch {
    throw new ValidationError("Redirect not allowed", { fromPath: "That old address already has a rule. Edit it instead." });
  }
  await logAuditBestEffort({ actor: actorId, action: "redirect.updated", entityType: "redirect", entityId: id, metadata: { from: { from: current.fromPath, to: next.fromPath }, target: { from: current.toPath, to: next.toPath }, status: { from: current.statusCode, to: next.statusCode } } });
  touch();
}

export async function deleteRule(id: string, actorId: string): Promise<void> {
  const current = await getRule(id);
  await repo.deleteRuleRow(id);
  await logAuditBestEffort({ actor: actorId, action: "redirect.deleted", entityType: "redirect", entityId: id, metadata: { from: current.fromPath, to: current.toPath, status: current.statusCode } });
  touch();
}

/**
 * A page now exists at this address (created, or a removed one came back): any rule for it would hide the page, so it goes.
 * One small delete; never fails the create that called it.
 */
export async function releasePublicPath(kind: PublicPathKind, slug: string): Promise<void> {
  try {
    await repo.deleteRuleByFrom(PUBLIC_PATHS[kind](slug));
    touch();
  } catch (error) {
    console.error("Could not release the address of a new page", error);
  }
}

const SHADOW_PATTERN = /^\/(products|categories|brands|stores|articles|p)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * Rules whose old address belongs to a page that exists. They can happen when pages are created by a CSV import or a script
 * (the admin forms release the address themselves). Shown on /admin/redirects so they can be deleted.
 */
export async function findShadowedRules(): Promise<ShadowedRule[]> {
  const { rows } = await listRules({ limit: 200, offset: 0 });
  const wanted = { products: [] as string[], categories: [] as string[], brands: [] as string[], stores: [] as string[], articles: [] as string[], pages: [] as string[] };
  const groups: Record<string, keyof typeof wanted> = { products: "products", categories: "categories", brands: "brands", stores: "stores", articles: "articles", p: "pages" };
  const parsed = rows.map((rule) => {
    const m = SHADOW_PATTERN.exec(rule.fromPath);
    if (!m) return null;
    const group = groups[m[1] as string] as keyof typeof wanted;
    wanted[group].push(m[2] as string);
    return { rule, group, slug: m[2] as string };
  });
  if (Object.values(wanted).every((list) => list.length === 0)) return [];
  const existing = await repo.selectExistingSlugs(wanted);
  return parsed.flatMap((p) => (p && existing[p.group].includes(p.slug) ? [{ rule: p.rule, page: p.rule.fromPath }] : []));
}

/* ---------------------------------- helpers for the services that own the pages ---------------------------------- */

/** Clears the redirect map so the middleware sees a slug change or a delete within about a minute. */
export const refreshRedirects = touch;

/** Pages that were never public (drafts, in review) have no address anyone could have linked to, so changing their slug needs no redirect. */
const NEVER_PUBLIC = new Set(["DRAFT", "REVIEW"]);
export const wasPublic = (status: string | null | undefined): boolean => !status || !NEVER_PUBLIC.has(status);

/** The old and new address for a slug change, or null when nothing moved or the page was never public. */
export function slugMove(kind: PublicPathKind, from: string, to: string, status?: string | null): { fromPath: string; toPath: string } | null {
  if (from === to || !wasPublic(status)) return null;
  return { fromPath: PUBLIC_PATHS[kind](from), toPath: PUBLIC_PATHS[kind](to) };
}

/** The address to leave a 410 on when a page is deleted, or null when it was never public. */
export function gonePathOf(kind: PublicPathKind, slug: string, status?: string | null): string | null {
  return wasPublic(status) ? PUBLIC_PATHS[kind](slug) : null;
}
