/**
 * The admin types dates in India time (IST, UTC+05:30, no daylight saving) and the database stores
 * UTC. These two functions are the only place that conversion happens.
 */
export const ADMIN_TIMEZONE_LABEL = "India time (IST)";
const IST_OFFSET_MINUTES = 330;

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-12-01T09:30" (a datetime-local value, in IST) -> Date, or null when it is not a real date and time. */
export function parseAdminDateTime(value: string): Date | null {
  const m = LOCAL.exec(value.trim());
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number) as [number, number, number, number, number];
  const utc = Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MINUTES * 60_000;
  const date = new Date(utc);
  // Reject "2026-02-31": the same moment read back in IST must give the same numbers.
  const back = new Date(utc + IST_OFFSET_MINUTES * 60_000);
  const same = back.getUTCFullYear() === year && back.getUTCMonth() === month - 1 && back.getUTCDate() === day && back.getUTCHours() === hour && back.getUTCMinutes() === minute;
  return same && !Number.isNaN(date.getTime()) ? date : null;
}

/** Date -> the value for <input type="datetime-local"> in IST. */
export function toAdminDateTimeInput(date: Date | null | undefined): string {
  if (!date) return "";
  const t = new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
  const p = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${p(t.getUTCFullYear(), 4)}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

export function formatAdminDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date);
}
