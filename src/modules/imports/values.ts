/** Small, shared readers for CSV cells (Release 5B). Every one takes the trimmed cell text and never throws. */

export type Read<T> = { ok: true; value: T } | { ok: false; error: string };

const TRUE = new Set(["true", "yes", "y", "1", "on", "x"]);
const FALSE = new Set(["false", "no", "n", "0", "off"]);

/** "" -> null (not given). yes/no/true/false/1/0 in any case. */
export function readBool(text: string, field: string): Read<boolean | null> {
  const t = text.trim().toLowerCase();
  if (t === "") return { ok: true, value: null };
  if (TRUE.has(t)) return { ok: true, value: true };
  if (FALSE.has(t)) return { ok: true, value: false };
  return { ok: false, error: `${field}: "${text.slice(0, 20)}" is not yes or no` };
}

/** "" -> null. Whole number in range. */
export function readInt(text: string, field: string, min: number, max: number): Read<number | null> {
  const t = text.trim();
  if (t === "") return { ok: true, value: null };
  if (!/^-?\d+$/.test(t)) return { ok: false, error: `${field}: "${t.slice(0, 20)}" is not a whole number` };
  const n = Number(t);
  return n >= min && n <= max ? { ok: true, value: n } : { ok: false, error: `${field}: use a number from ${min} to ${max}` };
}

/** "a|b, c;d" -> ["a", "b", "c", "d"]: pipe, comma, semicolon or new line, trimmed, no empty parts, no repeats (case kept). */
export function splitList(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[|,;\n]/)) {
    const v = part.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

export const normaliseHeader = (h: string): string => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** A cell is "given" when it has text. Updates change only the fields that are given; an empty cell never clears a value. */
export const given = (text: string): boolean => text.trim() !== "";
