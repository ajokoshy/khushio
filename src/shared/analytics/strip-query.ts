/**
 * Release 7B: removes the query string and the # part from an address before analytics sees it, so search words (the ?q= of
 * /discover) and filters are never collected. Anything that is not a readable address is passed through unchanged.
 */
export function stripQuery<T extends { url: string }>(event: T): T {
  try {
    const url = new URL(event.url);
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    return event;
  }
}
