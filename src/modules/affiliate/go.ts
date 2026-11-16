import { randomUUID } from "node:crypto";
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from "@/core/validation/slug";
import { countryOf, isBotUserAgent, referrerHostOf } from "./bots";
import { buildRedirectTarget, checkDestination } from "./destination";

/**
 * The /go/[slug] decision (Release 4A). The route handler only reads the request, calls this and writes the
 * response, so everything that matters is testable without a server:
 *
 *   slug looks wrong                        -> 404, no database read
 *   unknown slug                            -> 404
 *   link or merchant archived               -> 404
 *   destination fails the safety check      -> 404, and a warning is logged (slug and reason, never a visitor detail)
 *   otherwise                               -> 302 to the destination with the tracking parameters set
 *
 * Cost: ONE indexed read (links.slug is unique, merchants is read by its primary key in the same query) and ONE
 * insert, which runs after the response has been sent so the visitor never waits for it.
 */

export type GoLink = {
  id: string;
  slug: string;
  destinationUrl: string;
  trackingParams: string | null;
  isActive: boolean;
  merchantActive: boolean;
  allowedDomains: string[];
};

export type ClickRecord = {
  id: string;
  linkId: string;
  subId: string | null;
  referrerHost: string | null;
  country: string | null;
  isBot: boolean;
};

export type GoRequest = {
  slug: string;
  method: "GET" | "HEAD";
  userAgent: string | null;
  referer: string | null;
  country: string | null;
};

export type GoDeps = {
  findLink: (slug: string) => Promise<GoLink | null>;
  recordClick: (click: ClickRecord) => Promise<void>;
  /** Runs work after the response is sent (Next's after()). Must never throw into the response. */
  schedule: (work: () => Promise<void>) => void;
  warn: (message: string, details: Record<string, unknown>) => void;
};

export type GoOutcome = { status: 404 } | { status: 302; location: string };

export async function handleGo(request: GoRequest, deps: GoDeps): Promise<GoOutcome> {
  if (request.slug.length === 0 || request.slug.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(request.slug)) return { status: 404 };

  const link = await deps.findLink(request.slug);
  if (!link || !link.isActive || !link.merchantActive) return { status: 404 };

  const checked = checkDestination(link.destinationUrl, link.allowedDomains);
  if (!checked.ok) {
    deps.warn("go: destination refused", { slug: link.slug, reason: checked.code });
    return { status: 404 };
  }

  const target = buildRedirectTarget(checked.url, link.trackingParams, link.slug);

  // A HEAD request (a link checker) is answered the same way but is not a visitor, so it is not counted.
  if (request.method === "GET") {
    const click: ClickRecord = {
      id: randomUUID(),
      linkId: link.id,
      subId: target.subId,
      referrerHost: referrerHostOf(request.referer),
      country: countryOf(request.country),
      isBot: isBotUserAgent(request.userAgent),
    };
    deps.schedule(async () => {
      try {
        await deps.recordClick(click);
      } catch (error) {
        deps.warn("go: click not recorded", { slug: link.slug, error: error instanceof Error ? error.message : "unknown" });
      }
    });
  }
  return { status: 302, location: target.url };
}
