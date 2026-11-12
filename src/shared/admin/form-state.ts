/** Shapes shared by admin forms (useActionState) and one-click admin actions (ConfirmActionButton). */

/** The result of a form submit that did not redirect: something to show. Success redirects, so it has no shape here. */
export type FormState = {
  ok: false;
  /** A message for the whole form (conflict, permission, unexpected error). */
  error?: string;
  /** Messages keyed by input name, shown beside each field. */
  fieldErrors?: Record<string, string>;
  /** What was typed, so the form can show it again instead of resetting. */
  values?: Record<string, string>;
} | null;

/** The result of a one-click action (archive, restore, delete). */
export type ActionResult =
  | { ok: true; message?: string; /** Navigate here afterwards (for example after a delete). */ redirectTo?: string }
  | { ok: false; error: string };
