import { logAuditBestEffort } from "@/core/audit";
import { NotFoundError, ValidationError } from "@/core/errors";
import { uniqueViolationOf } from "@/core/validation/slug";
import type { CurrencyCode } from "@/core/validation/money";
import { selectNetworkById } from "@/modules/affiliate/repository";
import * as repo from "./repository";
import { parseConversionCsv } from "./rows";
import type { ConversionFilters, ConversionRow, ConversionWrite, ImportSummary } from "./types";
import type { ConversionInput } from "./validation";

/** Conversions: manual entry, edits and CSV import (Release 4B). Orders reconcile on (network, external order id). */

const CHUNK = 500;
const SHOWN_ERRORS = 20;

export async function listConversions(opts: ConversionFilters & { limit: number; offset: number }) {
  const rows = await repo.selectConversions({ ...opts, limit: opts.limit + 1 });
  return { rows: rows.slice(0, opts.limit), hasNext: rows.length > opts.limit };
}

export async function getConversion(id: string): Promise<ConversionRow> {
  const row = await repo.selectConversionById(id);
  if (!row) throw new NotFoundError("Conversion not found");
  return row;
}

const duplicateOrder = () => new ValidationError("Duplicate order", { externalOrderId: "This order id is already recorded for this network. Find it in the list and edit it instead." });

async function resolveRefs(input: ConversionInput): Promise<{ linkId: string | null }> {
  if (!(await selectNetworkById(input.networkId))) throw new ValidationError("Unknown network", { networkId: "Choose one of the listed networks." });
  if (!input.linkSlug) return { linkId: null };
  const linkId = await repo.selectLinkIdBySlug(input.linkSlug);
  if (!linkId) throw new ValidationError("Unknown link", { linkSlug: "No affiliate link has this slug. Leave the field empty if you do not know it." });
  return { linkId };
}

export async function createConversion(input: ConversionInput, actorId: string): Promise<{ id: string }> {
  const { linkId } = await resolveRefs(input);
  let created: { id: string };
  try {
    created = await repo.insertConversion({ networkId: input.networkId, externalOrderId: input.externalOrderId, linkId, commissionMinor: input.commissionMinor, currency: input.currency, status: input.status, convertedAt: input.convertedAt });
  } catch (error) {
    if (uniqueViolationOf(error)) throw duplicateOrder();
    throw error;
  }
  await logAuditBestEffort({ actor: actorId, action: "affiliate_conversion.created", entityType: "affiliate_conversion", entityId: created.id, metadata: { order: input.externalOrderId, status: input.status, commissionMinor: input.commissionMinor, currency: input.currency } });
  return created;
}

export async function updateConversion(id: string, input: ConversionInput, actorId: string): Promise<void> {
  const current = await repo.selectConversionById(id);
  if (!current) throw new NotFoundError("Conversion not found");
  const { linkId } = await resolveRefs(input);
  const next = { networkId: input.networkId, externalOrderId: input.externalOrderId, linkId, commissionMinor: input.commissionMinor, currency: input.currency, status: input.status, convertedAt: input.convertedAt };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => (k === "convertedAt" ? next[k].getTime() !== current[k].getTime() : next[k] !== current[k]));
  if (changed.length === 0) return;
  try {
    if (!(await repo.updateConversionRow(id, next))) throw new NotFoundError("Conversion not found");
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    if (uniqueViolationOf(error)) throw duplicateOrder();
    throw error;
  }
  await logAuditBestEffort({ actor: actorId, action: "affiliate_conversion.updated", entityType: "affiliate_conversion", entityId: id, metadata: { changed, order: input.externalOrderId, ...(changed.includes("status") ? { status: { from: current.status, to: input.status } } : {}) } });
}

export async function deleteConversion(id: string, actorId: string): Promise<void> {
  const current = await repo.selectConversionById(id);
  if (!current) throw new NotFoundError("Conversion not found");
  await repo.deleteConversionRow(id);
  await logAuditBestEffort({ actor: actorId, action: "affiliate_conversion.deleted", entityType: "affiliate_conversion", entityId: id, metadata: { order: current.externalOrderId, status: current.status, commissionMinor: current.commissionMinor } });
}

/**
 * Imports one network report. Importing the same file again changes nothing (unchanged rows are counted, not rewritten);
 * a newer report that changes an order's status or commission updates it. Bad rows are skipped and reported with their
 * line numbers; good rows are still imported.
 */
export async function importConversions(
  input: { csvText: string; filename: string; networkId: string; currency: CurrencyCode },
  actorId: string,
  now: Date = new Date(),
): Promise<ImportSummary> {
  const network = await selectNetworkById(input.networkId);
  if (!network) throw new ValidationError("Unknown network", { networkId: "Choose one of the listed networks." });

  const startedAt = now;
  const parsed = parseConversionCsv(input.csvText, input.currency);

  const slugs = [...new Set(parsed.rows.map((r) => r.subId).filter((s): s is string => !!s))];
  const linkIds = await repo.selectLinkIdsBySlugs(slugs);

  let inserted = 0;
  let updated = 0;
  let attributed = 0;
  const writes: ConversionWrite[] = parsed.rows.map((r) => {
    const linkId = r.subId ? (linkIds.get(r.subId) ?? null) : null;
    if (linkId) attributed += 1;
    return { networkId: input.networkId, externalOrderId: r.externalOrderId, linkId, commissionMinor: r.commissionMinor, currency: r.currency, status: r.status, convertedAt: r.convertedAt };
  });
  for (let i = 0; i < writes.length; i += CHUNK) {
    const result = await repo.upsertConversions(writes.slice(i, i + CHUNK));
    inserted += result.inserted;
    updated += result.updated;
  }
  const unchanged = writes.length - inserted - updated;

  const filename = input.filename.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "upload.csv";
  try {
    await repo.insertImportLog({ source: `csv:${network.key}:${filename}`, rowsProcessed: writes.length, rowsFailed: parsed.errors.length, startedAt });
  } catch (error) {
    console.error("Import log write failed", error);
  }
  await logAuditBestEffort({
    actor: actorId,
    action: "affiliate_conversion.imported",
    entityType: "affiliate_network",
    entityId: network.id,
    metadata: { filename, rows: parsed.rowsInFile, inserted, updated, unchanged, failed: parsed.errors.length },
  });

  return {
    filename,
    rowsInFile: parsed.rowsInFile,
    inserted,
    updated,
    unchanged,
    failed: parsed.errors.length,
    duplicatesInFile: parsed.duplicatesInFile,
    attributed,
    errors: parsed.errors.slice(0, SHOWN_ERRORS).map((e) => `Line ${e.line}: ${e.message}`),
  };
}
