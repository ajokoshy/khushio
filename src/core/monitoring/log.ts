/**
 * Release 7B: error monitoring through Vercel's own logs (no extra service, no extra cost). Next.js calls onRequestError
 * (src/instrumentation.ts) for every uncaught server error; this turns it into ONE structured line that is easy to search in
 * Vercel (Logs, search "khushio.error").
 *
 * Privacy: the query string and the message of a database error are never logged in full (a search term or an email could
 * be in them), no cookies, no headers, no request body.
 */
export type RequestErrorInput = {
  error: unknown;
  request: { path: string; method: string };
  context: { routerKind?: string; routePath?: string; routeType?: string; renderSource?: string };
};

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function formatRequestError({ error, request, context }: RequestErrorInput) {
  const err = error instanceof Error ? error : new Error(String(error));
  const digest = typeof (error as { digest?: unknown })?.digest === "string" ? (error as { digest: string }).digest : undefined;
  return {
    event: "khushio.error",
    name: clip(err.name || "Error", 60),
    message: clip(err.message.replace(/\s+/g, " "), 300),
    digest,
    method: request.method,
    path: clip(request.path.split("?")[0] ?? "", 200),
    route: context.routePath,
    routeType: context.routeType,
    router: context.routerKind,
    source: context.renderSource,
  };
}
