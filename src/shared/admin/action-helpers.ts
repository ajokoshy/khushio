import { redirect } from "next/navigation";
import type { ZodError } from "zod";
import { fieldErrorsOf } from "@/core/validation/fields";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@/core/errors";
import type { ActionResult, FormState } from "./form-state";

/**
 * Plumbing for admin server actions, so every action reports problems the same way:
 *   ValidationError -> messages beside the fields    ConflictError -> a message above the form
 *   ForbiddenError  -> "no permission" (nothing was written)   UnauthorizedError -> back to the login page
 * Anything unexpected is logged on the server and shown as a generic message (no details leak).
 */

export type Failure = NonNullable<FormState>;
type Outcome = { redirectTo: string } | Failure;

const NO_PERMISSION = "Your account does not have permission to do that.";
const GENERIC = "Something went wrong. Please try again.";

export function stringValues(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string") out[key] = value;
  return out;
}

function describeError(error: unknown): { message: string; fields?: Record<string, string>; unauthorized?: boolean } {
  if (error instanceof UnauthorizedError) return { message: "Your session has ended. Sign in again.", unauthorized: true };
  if (error instanceof ForbiddenError) return { message: NO_PERMISSION };
  if (error instanceof ValidationError) return { message: error.message, fields: error.fields };
  if (error instanceof ConflictError) return { message: error.message };
  if (error instanceof NotFoundError) return { message: "That item no longer exists. It may have been deleted." };
  console.error("Admin action failed", error);
  return { message: GENERIC };
}

/** A failed Zod parse, as a form failure that keeps what was typed. */
export function invalidForm(raw: Record<string, unknown>, error: ZodError): Failure {
  return { ok: false, fieldErrors: fieldErrorsOf(error), values: stringValues(raw) };
}

/**
 * Runs a form action. `work` returns `{ redirectTo }` on success or a failure to show. The redirect
 * happens here, outside the try block, because redirect() works by throwing.
 */
export async function runFormAction(raw: Record<string, unknown>, work: () => Promise<Outcome>): Promise<Failure> {
  let outcome: Outcome;
  try {
    outcome = await work();
  } catch (error) {
    const d = describeError(error);
    if (d.unauthorized) outcome = { redirectTo: "/admin-login" };
    else {
      const hasFields = !!d.fields && Object.keys(d.fields).length > 0;
      outcome = { ok: false, ...(hasFields ? { fieldErrors: d.fields } : { error: d.message }), values: stringValues(raw) };
    }
  }
  if ("redirectTo" in outcome) redirect(outcome.redirectTo);
  return outcome;
}

/** Same idea for one-click actions, returning an ActionResult for the client to toast. */
export async function runAction(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (error) {
    const d = describeError(error);
    if (d.unauthorized) return { ok: true, redirectTo: "/admin-login" };
    return { ok: false, error: d.message };
  }
}

/** For actions that hand data back to the browser (for example an upload signature). Failures become a message, never a thrown error. */
export type DataResult<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function runDataAction<T>(work: () => Promise<T>): Promise<DataResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    const d = describeError(error);
    const fieldMessage = d.fields ? Object.values(d.fields)[0] : undefined;
    return { ok: false, error: fieldMessage ?? d.message, ...(d.fields ? { fieldErrors: d.fields } : {}) };
  }
}
