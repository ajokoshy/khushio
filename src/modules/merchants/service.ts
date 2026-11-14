import { revalidateTag, unstable_cache } from "next/cache";
import { logAuditBestEffort } from "@/core/audit";
import { CACHE_TAGS, CACHE_TTL } from "@/core/config/cache";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { uniqueViolationOf } from "@/core/validation/slug";
import { resolveCreateSlug, resolveUpdateSlug } from "@/core/validation/slug-rules";
import * as repo from "./repository";
import type { MerchantRow, MerchantUsage, StatusFilter } from "./types";
import type { MerchantInput } from "./validation";

const nameClash = "A merchant with this name already exists.";

function rethrowDuplicate(error: unknown): never {
  const constraint = uniqueViolationOf(error);
  if (constraint?.includes("slug")) throw new ValidationError("Slug already in use", { slug: "That slug is already in use. Choose another." });
  if (constraint) throw new ValidationError("Duplicate name", { name: nameClash });
  throw error;
}

export async function listMerchants(opts: { q?: string; status: StatusFilter; limit: number; offset: number }) {
  const rows = await repo.selectMerchants({ ...opts, limit: opts.limit + 1 });
  return { rows: rows.slice(0, opts.limit), hasNext: rows.length > opts.limit };
}

export async function getMerchant(id: string): Promise<{ merchant: MerchantRow; usage: MerchantUsage }> {
  const merchant = await repo.selectMerchantById(id);
  if (!merchant) throw new NotFoundError("Merchant not found");
  const [affiliateLinks, programs] = await Promise.all([repo.countAffiliateLinksForMerchant(id), repo.countProgramsForMerchant(id)]);
  return { merchant, usage: { affiliateLinks, programs } };
}

export async function createMerchant(input: MerchantInput, actorId: string): Promise<MerchantRow> {
  if (await repo.selectMerchantByName(input.name)) throw new ValidationError("Duplicate name", { name: nameClash });
  const slug = await resolveCreateSlug({ name: input.name, explicit: input.slug, findTaken: repo.selectMerchantSlugsLike });

  let created: MerchantRow;
  try {
    created = await repo.insertMerchant({ slug, name: input.name, websiteUrl: input.websiteUrl, allowedDomains: input.allowedDomains, logoUrl: input.logoUrl });
  } catch (error) {
    rethrowDuplicate(error);
  }
  await logAuditBestEffort({
    actor: actorId,
    action: "merchant.created",
    entityType: "merchant",
    entityId: created.id,
    metadata: { slug, name: created.name, allowedDomains: created.allowedDomains },
  });
  revalidateTag(CACHE_TAGS.merchants);
  return created;
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export async function updateMerchant(id: string, input: MerchantInput, actorId: string): Promise<MerchantRow> {
  const current = await repo.selectMerchantById(id);
  if (!current) throw new NotFoundError("Merchant not found");

  if (input.name.toLowerCase() !== current.name.toLowerCase()) {
    const clash = await repo.selectMerchantByName(input.name);
    if (clash && clash.id !== id) throw new ValidationError("Duplicate name", { name: nameClash });
  }
  const slug = await resolveUpdateSlug({ current: current.slug, requested: input.slug, confirmed: input.confirmSlugChange, findTaken: repo.selectMerchantSlugsLike });

  const next = { slug, name: input.name, websiteUrl: input.websiteUrl, allowedDomains: input.allowedDomains, logoUrl: input.logoUrl };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((key) =>
    key === "allowedDomains" ? !sameList(next.allowedDomains, current.allowedDomains) : next[key] !== current[key],
  );
  if (changed.length === 0) return current;

  let updated: MerchantRow | null;
  try {
    updated = await repo.updateMerchantRow(id, next);
  } catch (error) {
    rethrowDuplicate(error);
  }
  if (!updated) throw new NotFoundError("Merchant not found");

  // Allowed domains decide where /go may send visitors, so exactly what was added or removed is recorded.
  const added = next.allowedDomains.filter((d) => !current.allowedDomains.includes(d));
  const removed = current.allowedDomains.filter((d) => !next.allowedDomains.includes(d));
  await logAuditBestEffort({
    actor: actorId,
    action: "merchant.updated",
    entityType: "merchant",
    entityId: id,
    metadata: {
      changed,
      ...(slug !== current.slug ? { slug: { from: current.slug, to: slug } } : {}),
      ...(added.length > 0 || removed.length > 0 ? { domainsAdded: added, domainsRemoved: removed } : {}),
    },
  });
  revalidateTag(CACHE_TAGS.merchants);
  return updated;
}

export async function archiveMerchant(id: string, actorId: string): Promise<void> {
  const current = await repo.selectMerchantById(id);
  if (!current) throw new NotFoundError("Merchant not found");
  if (!current.isActive) return;
  await repo.updateMerchantRow(id, { isActive: false });
  await logAuditBestEffort({ actor: actorId, action: "merchant.archived", entityType: "merchant", entityId: id, metadata: { slug: current.slug } });
  revalidateTag(CACHE_TAGS.merchants);
}

export async function restoreMerchant(id: string, actorId: string): Promise<void> {
  const current = await repo.selectMerchantById(id);
  if (!current) throw new NotFoundError("Merchant not found");
  if (current.isActive) return;
  await repo.updateMerchantRow(id, { isActive: true });
  await logAuditBestEffort({ actor: actorId, action: "merchant.restored", entityType: "merchant", entityId: id, metadata: { slug: current.slug } });
  revalidateTag(CACHE_TAGS.merchants);
}

export async function deleteMerchant(id: string, actorId: string): Promise<void> {
  const current = await repo.selectMerchantById(id);
  if (!current) throw new NotFoundError("Merchant not found");
  const [links, programs] = await Promise.all([repo.countAffiliateLinksForMerchant(id), repo.countProgramsForMerchant(id)]);
  if (links > 0) throw new ConflictError(`${links} affiliate link${links === 1 ? " uses" : "s use"} this merchant, so it cannot be deleted. Archive it instead.`);
  if (programs > 0) throw new ConflictError(`This merchant has ${programs} affiliate programme${programs === 1 ? "" : "s"}, so it cannot be deleted. Archive it instead.`);
  await repo.deleteMerchantRow(id);
  await logAuditBestEffort({ actor: actorId, action: "merchant.deleted", entityType: "merchant", entityId: id, metadata: { slug: current.slug, name: current.name } });
  revalidateTag(CACHE_TAGS.merchants);
}

const loadMerchantBySlug = unstable_cache((slug: string) => repo.selectActiveMerchantBySlug(slug), ["merchant-by-slug"], {
  revalidate: CACHE_TTL.merchants,
  tags: [CACHE_TAGS.merchants],
});

/** A store page's data, or null when the merchant does not exist or is archived. Cached 24 hours, tag `merchants`. */
export async function getPublicMerchant(slug: string): Promise<MerchantRow | null> {
  return loadMerchantBySlug(slug);
}
