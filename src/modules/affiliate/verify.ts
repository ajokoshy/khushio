import { logAuditBestEffort, logAuditMany, type AuditEntry } from "@/core/audit";
import { NotFoundError } from "@/core/errors";
import { checkDestination } from "./destination";
import * as repo from "./repository";
import type { LinkRow, VerifyOutcome, VerifyResult } from "./types";

/**
 * Link verification (Release 4A, manual): a HEAD request to the link's destination.
 *
 * Safety: the server only calls an address that passed the same check as /go (https, a real domain, one of the
 * merchant's allowed domains). Redirects are NOT followed, so a store that redirects to another host cannot make this
 * server request anything else. The destination is requested WITHOUT the tracking parameters, so a check never
 * counts as a visit on the network's side.
 *
 * Many stores refuse automated HEAD requests (403, 405, 429, 503). That says nothing about the link, so such an
 * answer is "unclear" and does NOT set last_verified_at. Only a real answer below 400 does.
 */

export const VERIFY_TIMEOUT_MS = 6000;
export const VERIFY_BATCH_SIZE = 10;
const VERIFY_CONCURRENCY = 5;
const USER_AGENT = "KhushioLinkCheck/1.0";

type FetchLike = (url: string, init: RequestInit) => Promise<{ status: number }>;

export function classifyStatus(status: number): VerifyResult {
  if (status >= 200 && status < 400) return { outcome: "ok", status, message: `The store answered normally (HTTP ${status}).` };
  if (status === 404 || status === 410) return { outcome: "problem", status, message: `The store says this page does not exist (HTTP ${status}). The link is probably broken.` };
  return { outcome: "unclear", status, message: `The store did not allow an automatic check (HTTP ${status}). Open the link in a browser to be sure.` };
}

export async function probeLink(link: Pick<LinkRow, "destinationUrl" | "merchantDomains">, fetchImpl: FetchLike = fetch): Promise<VerifyResult> {
  const checked = checkDestination(link.destinationUrl, link.merchantDomains);
  if (!checked.ok) return { outcome: "refused", status: null, message: `Not checked: ${checked.message}` };
  try {
    const response = await fetchImpl(checked.url.href, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    });
    return classifyStatus(response.status);
  } catch {
    return { outcome: "unreachable", status: null, message: "The store did not answer in time, or the connection failed." };
  }
}

const auditEntry = (link: LinkRow, result: VerifyResult, actorId: string): AuditEntry => ({
  actor: actorId,
  action: "affiliate_link.verified",
  entityType: "affiliate_link",
  entityId: link.id,
  metadata: { slug: link.slug, outcome: result.outcome, status: result.status },
});

export async function verifyLink(id: string, actorId: string, fetchImpl?: FetchLike, now: Date = new Date()): Promise<VerifyResult> {
  const link = await repo.selectLinkById(id);
  if (!link) throw new NotFoundError("Link not found");
  const result = await probeLink(link, fetchImpl);
  if (result.outcome === "ok") await repo.markLinkVerified(id, now);
  await logAuditBestEffort(auditEntry(link, result, actorId));
  return result;
}

export type VerifyBatchSummary = { checked: number } & Record<VerifyOutcome, number>;

/** The stalest active links, a few at a time. One audit insert for the whole batch. */
export async function verifyStaleLinks(actorId: string, limit = VERIFY_BATCH_SIZE, fetchImpl?: FetchLike, now: Date = new Date()): Promise<VerifyBatchSummary> {
  const links = await repo.selectLinksToVerify(Math.min(Math.max(limit, 1), VERIFY_BATCH_SIZE));
  const summary: VerifyBatchSummary = { checked: links.length, ok: 0, problem: 0, unclear: 0, unreachable: 0, refused: 0 };
  const entries: AuditEntry[] = [];

  for (let i = 0; i < links.length; i += VERIFY_CONCURRENCY) {
    const group = links.slice(i, i + VERIFY_CONCURRENCY);
    const results = await Promise.all(group.map((link) => probeLink(link, fetchImpl)));
    for (const [index, result] of results.entries()) {
      const link = group[index] as LinkRow;
      summary[result.outcome] += 1;
      if (result.outcome === "ok") await repo.markLinkVerified(link.id, now);
      entries.push(auditEntry(link, result, actorId));
    }
  }
  if (entries.length > 0) {
    try {
      await logAuditMany(entries);
    } catch (error) {
      console.error("Audit write failed for affiliate_link.verified", error);
    }
  }
  return summary;
}

export function describeBatch(s: VerifyBatchSummary): string {
  if (s.checked === 0) return "There are no active links to check.";
  const parts = [`${s.ok} working`];
  if (s.problem) parts.push(`${s.problem} probably broken`);
  if (s.unclear) parts.push(`${s.unclear} unclear (the store blocks automatic checks)`);
  if (s.unreachable) parts.push(`${s.unreachable} did not answer`);
  if (s.refused) parts.push(`${s.refused} not checked (destination not allowed)`);
  return `Checked ${s.checked} link${s.checked === 1 ? "" : "s"}: ${parts.join(", ")}.`;
}
