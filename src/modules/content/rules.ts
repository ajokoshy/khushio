import { isDocumentEmpty, type Doc } from "./document";
import { CONTENT_STATUSES, type ContentStatus } from "./types";

/** Statuses that put content in front of visitors, take it away, or retire it. They need content:publish. */
const PUBLISH_CONTROLLED: ReadonlySet<ContentStatus> = new Set(["SCHEDULED", "PUBLISHED", "ARCHIVED"]);

export function isContentStatus(value: string): value is ContentStatus {
  return (CONTENT_STATUSES as readonly string[]).includes(value);
}

/**
 * A message when this status change is not allowed for this person, otherwise null. Without content:publish a person
 * can write and move content between DRAFT and REVIEW, but cannot publish, schedule or archive it, and cannot pull
 * something that is live (or scheduled, or archived) back.
 */
export function statusChangeProblem(current: ContentStatus | null, next: ContentStatus, canPublish: boolean): string | null {
  if (current === next || canPublish) return null;
  if (PUBLISH_CONTROLLED.has(next)) return "Your account can save drafts and send them for review, but cannot publish, schedule or archive.";
  if (current !== null && PUBLISH_CONTROLLED.has(current)) return "Your account cannot change the status of something that is published, scheduled or archived.";
  return null;
}

/**
 * What the item still needs before visitors can see it (empty list: ready), and the publish time to store.
 * PUBLISHED keeps its first publish time (or now) and may not carry a future time (that is what SCHEDULED is for);
 * SCHEDULED needs a time in the future; every other status keeps whatever time was typed.
 */
export function resolvePublishing(input: {
  status: ContentStatus;
  requestedAt: Date | null;
  currentAt: Date | null;
  content: Doc;
  now: Date;
}): { publishAt: Date | null; problems: string[]; field?: "publishAt" | "status" } {
  const problems: string[] = [];
  if (input.status !== "PUBLISHED" && input.status !== "SCHEDULED") return { publishAt: input.requestedAt ?? input.currentAt, problems };
  if (isDocumentEmpty(input.content)) problems.push("Write some text or add an image before publishing or scheduling.");

  if (input.status === "SCHEDULED") {
    if (!input.requestedAt) return { publishAt: null, problems: [...problems, "Choose the date and time it should go live."], field: "publishAt" };
    if (input.requestedAt.getTime() <= input.now.getTime()) return { publishAt: input.requestedAt, problems: [...problems, "The go-live time is in the past. Choose a later time, or set the status to Published."], field: "publishAt" };
    return { publishAt: input.requestedAt, problems };
  }
  const at = input.requestedAt ?? input.currentAt ?? input.now;
  if (at.getTime() > input.now.getTime()) return { publishAt: at, problems: [...problems, "A published item cannot have a future time. Use Scheduled to publish later."], field: "publishAt" };
  return { publishAt: at, problems };
}
