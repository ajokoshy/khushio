import type { Instrumentation } from "next";

/** Release 7B: every uncaught server error becomes one searchable line in the Vercel logs (src/core/monitoring/log.ts). */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { formatRequestError } = await import("@/core/monitoring/log");
  console.error(JSON.stringify(formatRequestError({ error, request: { path: request.path, method: request.method }, context })));
};
