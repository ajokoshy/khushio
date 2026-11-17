import { revalidateTag } from "next/cache";
import { logAuditBestEffort } from "@/core/audit";
import { CACHE_TAGS } from "@/core/config/cache";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { uniqueViolationOf } from "@/core/validation/slug";
import { resolveCreateSlug, resolveUpdateSlug } from "@/core/validation/slug-rules";
import { checkDestination } from "./destination";
import * as repo from "./repository";
import type {
  LinkHistory,
  LinkListRow,
  LinkRow,
  MerchantOption,
  NetworkOption,
  NetworkRow,
  NetworkUsage,
  ProductRef,
  ProgramRow,
  StatusFilter,
} from "./types";
import type { LinkInput, NetworkInput, ProgramInput } from "./validation";

/** Admin rules for affiliate networks, merchant programmes and affiliate links (Release 4A). */

type ListOpts = { q?: string; status: StatusFilter; limit: number; offset: number };
const page = <T>(rows: T[], limit: number) => ({ rows: rows.slice(0, limit), hasNext: rows.length > limit });

/** Product pages show the links, and the dashboard counts them, so both caches are cleared on every link write. */
function revalidateLinkViews() {
  revalidateTag(CACHE_TAGS.products);
  revalidateTag(CACHE_TAGS.dashboard);
  revalidateTag(CACHE_TAGS.deals); // an offer's button goes through one of these links
}

// ---------------------------------------------------------------------------------------------------------------------
// Networks
// ---------------------------------------------------------------------------------------------------------------------

const networkNameClash = "A network with this name already exists.";

function rethrowNetworkDuplicate(error: unknown): never {
  const constraint = uniqueViolationOf(error);
  if (constraint) throw new ValidationError("Duplicate key", { key: "That key is already in use. Choose another." });
  throw error;
}

export async function listNetworks(opts: ListOpts) {
  return page(await repo.selectNetworks({ ...opts, limit: opts.limit + 1 }), opts.limit);
}

export async function getNetwork(id: string): Promise<{ network: NetworkRow; usage: NetworkUsage }> {
  const network = await repo.selectNetworkById(id);
  if (!network) throw new NotFoundError("Network not found");
  return { network, usage: await repo.selectNetworkUsage(id) };
}

export async function listNetworkOptions(): Promise<NetworkOption[]> {
  return repo.selectNetworkOptions();
}

export async function createNetwork(input: NetworkInput, actorId: string): Promise<NetworkRow> {
  if (await repo.selectNetworkByName(input.name)) throw new ValidationError("Duplicate name", { name: networkNameClash });
  const key = await resolveCreateSlug({ name: input.name, explicit: input.key, findTaken: repo.selectNetworkKeysLike }).catch((error) => {
    if (error instanceof ValidationError && error.fields.slug) throw new ValidationError(error.message, { key: error.fields.slug });
    throw error;
  });
  let created: NetworkRow;
  try {
    created = await repo.insertNetwork({ key, name: input.name, isActive: input.isActive });
  } catch (error) {
    rethrowNetworkDuplicate(error);
  }
  await logAuditBestEffort({ actor: actorId, action: "affiliate_network.created", entityType: "affiliate_network", entityId: created.id, metadata: { key, name: created.name } });
  return created;
}

export async function updateNetwork(id: string, input: NetworkInput, actorId: string): Promise<NetworkRow> {
  const current = await repo.selectNetworkById(id);
  if (!current) throw new NotFoundError("Network not found");
  if (input.name.toLowerCase() !== current.name.toLowerCase()) {
    const clash = await repo.selectNetworkByName(input.name);
    if (clash && clash.id !== id) throw new ValidationError("Duplicate name", { name: networkNameClash });
  }
  let key = current.key;
  if (input.key && input.key !== current.key) {
    const taken = await repo.selectNetworkKeysLike(input.key);
    if (taken.includes(input.key)) throw new ValidationError("Duplicate key", { key: "That key is already in use. Choose another." });
    key = input.key;
  }
  const next = { key, name: input.name, isActive: input.isActive };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== current[k]);
  if (changed.length === 0) return current;

  let updated: NetworkRow | null;
  try {
    updated = await repo.updateNetworkRow(id, next);
  } catch (error) {
    rethrowNetworkDuplicate(error);
  }
  if (!updated) throw new NotFoundError("Network not found");
  await logAuditBestEffort({ actor: actorId, action: "affiliate_network.updated", entityType: "affiliate_network", entityId: id, metadata: { changed } });
  return updated;
}

export async function deleteNetwork(id: string, actorId: string): Promise<void> {
  const current = await repo.selectNetworkById(id);
  if (!current) throw new NotFoundError("Network not found");
  const usage = await repo.selectNetworkUsage(id);
  if (usage.programs > 0) throw new ConflictError(`${usage.programs} merchant programme${usage.programs === 1 ? " uses" : "s use"} this network, so it cannot be deleted. Untick Active instead.`);
  if (usage.conversions > 0) throw new ConflictError(`${usage.conversions} recorded conversion${usage.conversions === 1 ? " belongs" : "s belong"} to this network, so it cannot be deleted. Untick Active instead.`);
  await repo.deleteNetworkRow(id);
  await logAuditBestEffort({ actor: actorId, action: "affiliate_network.deleted", entityType: "affiliate_network", entityId: id, metadata: { key: current.key, name: current.name } });
}

// ---------------------------------------------------------------------------------------------------------------------
// Merchant programmes
// ---------------------------------------------------------------------------------------------------------------------

export async function listPrograms(opts: ListOpts) {
  return page(await repo.selectPrograms({ ...opts, limit: opts.limit + 1 }), opts.limit);
}

export async function getProgram(id: string): Promise<ProgramRow> {
  const program = await repo.selectProgramById(id);
  if (!program) throw new NotFoundError("Programme not found");
  return program;
}

export async function getProgramFormOptions(): Promise<{ merchants: MerchantOption[]; networks: NetworkOption[] }> {
  const [merchants, networks] = await Promise.all([repo.selectMerchantOptions(), repo.selectNetworkOptions()]);
  return { merchants, networks };
}

async function checkProgramRefs(input: ProgramInput, ignoreId?: string) {
  const [merchant, network] = await Promise.all([repo.selectMerchantOptionById(input.merchantId), repo.selectNetworkById(input.networkId)]);
  if (!merchant) throw new ValidationError("Unknown merchant", { merchantId: "Choose one of the listed merchants." });
  if (!network) throw new ValidationError("Unknown network", { networkId: "Choose one of the listed networks." });
  const existing = await repo.selectProgramForPair(input.merchantId, input.networkId);
  if (existing && existing.id !== ignoreId) throw new ValidationError("Duplicate programme", { networkId: `${merchant.name} already has a programme on ${network.name}.` });
  return { merchant, network };
}

export async function createProgram(input: ProgramInput, actorId: string): Promise<{ id: string }> {
  const { merchant, network } = await checkProgramRefs(input);
  const created = await repo.insertProgram({ merchantId: input.merchantId, networkId: input.networkId, externalProgramId: input.externalProgramId, commissionNote: input.commissionNote, isActive: input.isActive });
  await logAuditBestEffort({ actor: actorId, action: "merchant_program.created", entityType: "merchant_program", entityId: created.id, metadata: { merchant: merchant.name, network: network.name } });
  return created;
}

export async function updateProgram(id: string, input: ProgramInput, actorId: string): Promise<void> {
  const current = await repo.selectProgramById(id);
  if (!current) throw new NotFoundError("Programme not found");
  await checkProgramRefs(input, id);
  const next = { merchantId: input.merchantId, networkId: input.networkId, externalProgramId: input.externalProgramId, commissionNote: input.commissionNote, isActive: input.isActive };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== current[k]);
  if (changed.length === 0) return;
  if (!(await repo.updateProgramRow(id, next))) throw new NotFoundError("Programme not found");
  await logAuditBestEffort({ actor: actorId, action: "merchant_program.updated", entityType: "merchant_program", entityId: id, metadata: { changed } });
}

export async function deleteProgram(id: string, actorId: string): Promise<void> {
  const current = await repo.selectProgramById(id);
  if (!current) throw new NotFoundError("Programme not found");
  await repo.deleteProgramRow(id);
  await logAuditBestEffort({ actor: actorId, action: "merchant_program.deleted", entityType: "merchant_program", entityId: id, metadata: { merchant: current.merchantName, network: current.networkName } });
}

// ---------------------------------------------------------------------------------------------------------------------
// Affiliate links
// ---------------------------------------------------------------------------------------------------------------------

/** The live result of the safety check for one stored link: null when /go would send visitors on, else why it would not. */
export function linkProblem(link: Pick<LinkRow, "destinationUrl" | "merchantDomains">): string | null {
  const checked = checkDestination(link.destinationUrl, link.merchantDomains);
  return checked.ok ? null : checked.message;
}

export async function listLinks(opts: ListOpts & { merchantId?: string }): Promise<{ rows: LinkListRow[]; hasNext: boolean }> {
  const result = page(await repo.selectLinks({ ...opts, limit: opts.limit + 1 }), opts.limit);
  return { rows: result.rows.map((row) => ({ ...row, problem: linkProblem(row) })), hasNext: result.hasNext };
}

export async function getLink(id: string): Promise<{ link: LinkListRow; history: LinkHistory }> {
  const link = await repo.selectLinkById(id);
  if (!link) throw new NotFoundError("Link not found");
  return { link: { ...link, problem: linkProblem(link) }, history: await repo.selectLinkHistory(id) };
}

export async function listLinksForProduct(productId: string): Promise<LinkListRow[]> {
  return (await repo.selectLinksForProduct(productId)).map((row) => ({ ...row, problem: linkProblem(row) }));
}

export async function getLinkFormOptions(): Promise<{ merchants: MerchantOption[] }> {
  return { merchants: await repo.selectMerchantOptions() };
}

export async function findProductRef(slug: string): Promise<ProductRef | null> {
  return repo.selectProductRefBySlug(slug);
}

function rethrowLinkDuplicate(error: unknown): never {
  if (uniqueViolationOf(error)) throw new ValidationError("Slug already in use", { slug: "That slug is already in use. Choose another." });
  throw error;
}

/** Merchant, product and the safety check of the destination against THIS merchant's allowed domains. */
async function resolveLinkRefs(input: LinkInput) {
  const merchant = await repo.selectMerchantOptionById(input.merchantId);
  if (!merchant) throw new ValidationError("Unknown merchant", { merchantId: "Choose one of the listed merchants." });

  let product: ProductRef | null = null;
  if (input.productSlug) {
    product = await repo.selectProductRefBySlug(input.productSlug);
    if (!product) throw new ValidationError("Unknown product", { productSlug: "No product has this slug. Copy it from the product's edit page, or leave the field empty." });
  }
  const checked = checkDestination(input.destinationUrl, merchant.allowedDomains);
  if (!checked.ok) throw new ValidationError("Destination refused", { destinationUrl: checked.message });
  return { merchant, product, destination: checked.url.href };
}

export async function createLink(input: LinkInput, actorId: string): Promise<{ id: string; slug: string }> {
  const { merchant, product, destination } = await resolveLinkRefs(input);
  if (!merchant.isActive) throw new ValidationError("Merchant archived", { merchantId: "This merchant is archived. Restore it before adding links." });

  const slug = await resolveCreateSlug({
    name: product ? `${merchant.name} ${product.name}` : `${merchant.name} link`,
    explicit: input.slug,
    findTaken: repo.selectLinkSlugsLike,
  });
  let created: { id: string; slug: string };
  try {
    created = await repo.insertLink({ slug, merchantId: merchant.id, productId: product?.id ?? null, destinationUrl: destination, trackingParams: input.trackingParams, isActive: input.isActive });
  } catch (error) {
    rethrowLinkDuplicate(error);
  }
  await logAuditBestEffort({
    actor: actorId,
    action: "affiliate_link.created",
    entityType: "affiliate_link",
    entityId: created.id,
    metadata: { slug, merchant: merchant.name, product: product?.slug ?? null, host: new URL(destination).hostname, active: input.isActive },
  });
  revalidateLinkViews();
  return created;
}

export async function updateLink(id: string, input: LinkInput, actorId: string): Promise<void> {
  const current = await repo.selectLinkById(id);
  if (!current) throw new NotFoundError("Link not found");
  const { merchant, product, destination } = await resolveLinkRefs(input);
  if (merchant.id !== current.merchantId && !merchant.isActive) throw new ValidationError("Merchant archived", { merchantId: "This merchant is archived. Restore it first." });
  const slug = await resolveUpdateSlug({ current: current.slug, requested: input.slug, confirmed: input.confirmSlugChange, findTaken: repo.selectLinkSlugsLike });

  const next = { slug, merchantId: merchant.id, productId: product?.id ?? null, destinationUrl: destination, trackingParams: input.trackingParams, isActive: input.isActive };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== current[k]);
  if (changed.length === 0) return;

  // A new destination or merchant means the last check no longer describes this link.
  const staleCheck = changed.includes("destinationUrl") || changed.includes("merchantId");
  try {
    if (!(await repo.updateLinkRow(id, { ...next, ...(staleCheck ? { lastVerifiedAt: null } : {}) }))) throw new NotFoundError("Link not found");
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    rethrowLinkDuplicate(error);
  }
  await logAuditBestEffort({
    actor: actorId,
    action: "affiliate_link.updated",
    entityType: "affiliate_link",
    entityId: id,
    metadata: {
      changed,
      ...(slug !== current.slug ? { slug: { from: current.slug, to: slug } } : {}),
      ...(changed.includes("destinationUrl") ? { host: new URL(destination).hostname } : {}),
    },
  });
  revalidateLinkViews();
}

export async function deleteLink(id: string, actorId: string): Promise<void> {
  const current = await repo.selectLinkById(id);
  if (!current) throw new NotFoundError("Link not found");
  const history = await repo.selectLinkHistory(id);
  if (history.clicks > 0 || history.dailyRows > 0 || history.conversions > 0) {
    throw new ConflictError("This link has click or conversion history, which deleting would erase from the reports. Untick Active instead.");
  }
  await repo.deleteLinkRow(id);
  await logAuditBestEffort({ actor: actorId, action: "affiliate_link.deleted", entityType: "affiliate_link", entityId: id, metadata: { slug: current.slug, merchant: current.merchantName } });
  revalidateLinkViews();
}

/** A link by slug (id, store, active flag), for deals and coupons that point at a link. */
export async function findLinkRefBySlug(slug: string): Promise<repo.LinkRef | null> {
  return (await repo.selectLinkRefsBySlugs([slug]))[0] ?? null;
}

/** Link slug -> link for the slugs that exist (CSV imports). */
export async function findLinkRefsBySlugs(slugs: readonly string[]): Promise<Map<string, repo.LinkRef>> {
  return new Map((await repo.selectLinkRefsBySlugs(slugs)).map((l) => [l.slug, l] as const));
}
