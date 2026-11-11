/** Escapes %, _ and \ so user text is matched literally inside ILIKE patterns. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
