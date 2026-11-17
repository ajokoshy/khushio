/**
 * One-line confirmation after a form redirects back to a list (?notice=created). Only these fixed codes
 * are shown, so nothing from the address bar is ever printed on the page.
 */
const NOTICES: Record<string, string> = {
  created: "Created.",
  updated: "Saved.",
  deleted: "Deleted.",
  featured: "The chosen deals were updated.",
  expired: "The chosen deals were ended now.",
  archived: "The chosen deals were archived.",
  reordered: "The order was saved.",
  nothing: "Nothing changed: tick at least one deal that the action applies to.",
  failed: "That did not work. Check your permissions and try again.",
};

export function Notice({ code }: { code: string | undefined }) {
  const message = code ? NOTICES[code] : undefined;
  if (!message) return null;
  return (
    <p role="status" className="mb-4 rounded-xl bg-forest-100 px-4 py-2 text-sm text-forest-800">
      {message}
    </p>
  );
}
