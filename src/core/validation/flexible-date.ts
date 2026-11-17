import { parseAdminDateTime } from "./datetime";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
const DMY = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?)?$/;
const pad = (n: number | string, w = 2) => String(n).padStart(w, "0");

/**
 * "2026-11-01", "2026-11-01 14:30", "2026-11-01T14:30:00Z", "2026-11-01T14:30:00+05:30", "01/11/2026", "01-11-2026 14:30".
 * Without a time zone the time is India time. Day/month/year is read day first (Indian reports); 01/11/2026 is 1 November.
 * Impossible dates (31 February) are refused. Used by CSV imports of conversions (4B) and of deals (5B).
 */
export function parseFlexibleDate(input: string): ParseResult<Date> {
  const text = input.trim();
  if (!text) return { ok: false, error: "the date is empty" };
  const bad = { ok: false, error: `"${text.slice(0, 30)}" is not a date I understand (use 2026-11-01 or 01/11/2026)` } as const;

  const iso = ISO.exec(text);
  if (iso) {
    const [, y, mo, d, hh = "0", mi = "0", ss = "0", zone] = iso;
    if (!zone) {
      const date = parseAdminDateTime(`${y}-${mo}-${d}T${pad(hh)}:${pad(mi)}`);
      return date ? { ok: true, value: new Date(date.getTime() + Number(ss) * 1000) } : bad;
    }
    const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mi), Number(ss));
    const check = new Date(utc);
    if (check.getUTCMonth() !== Number(mo) - 1 || check.getUTCDate() !== Number(d) || Number(hh) > 23 || Number(mi) > 59) return bad;
    let offset = 0;
    if (zone.toUpperCase() !== "Z") {
      const sign = zone.startsWith("-") ? -1 : 1;
      const digits = zone.slice(1).replace(":", "");
      offset = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
    }
    return { ok: true, value: new Date(utc - offset * 60_000) };
  }

  const dmy = DMY.exec(text);
  if (dmy) {
    const [, d = "", mo = "", y = "", hh = "0", mi = "0"] = dmy;
    const date = parseAdminDateTime(`${y}-${pad(mo)}-${pad(d)}T${pad(hh)}:${pad(mi)}`);
    return date ? { ok: true, value: date } : bad;
  }
  return bad;
}
