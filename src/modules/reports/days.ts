/**
 * Calendar days for click reports (Release 4B). A "day" is a calendar day in India time (IST, UTC+05:30, no daylight
 * saving), the same clock the admin types dates in. Day strings look like "2026-11-15".
 */
export const DAY_MS = 24 * 60 * 60 * 1000;
const IST_MS = 330 * 60 * 1000;

/** The instant at which the IST day containing `at` began. */
export function istDayStart(at: Date): Date {
  return new Date(Math.floor((at.getTime() + IST_MS) / DAY_MS) * DAY_MS - IST_MS);
}

/** "2026-11-15": the IST calendar day of an instant. */
export function istDayString(at: Date): string {
  return new Date(at.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** The instant an IST day string begins at. */
export function dayStringToStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - IST_MS);
}

export function addDaysToString(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, both included. Empty when `from` is after `to`. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysToString(d, 1)) out.push(d);
  return out;
}

/** Fills the days that have no row with zero, so a chart or table has no gaps. */
export function fillDays(rows: readonly { day: string; clicks: number }[], from: string, to: string): { day: string; clicks: number }[] {
  const byDay = new Map(rows.map((r) => [r.day, r.clicks]));
  return dayRange(from, to).map((day) => ({ day, clicks: byDay.get(day) ?? 0 }));
}

export const REPORT_RANGES = [7, 30, 90] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];

export function parseRange(value: string | undefined): ReportRange {
  const n = Number(value);
  return (REPORT_RANGES as readonly number[]).includes(n) ? (n as ReportRange) : 30;
}

/** The report window: the last `days` COMPLETE days, ending yesterday. Today is shown separately, from raw clicks. */
export function reportWindow(now: Date, days: number): { from: string; to: string; fromInstant: Date; toInstant: Date } {
  const to = addDaysToString(istDayString(now), -1);
  const from = addDaysToString(to, -(days - 1));
  return { from, to, fromInstant: dayStringToStart(from), toInstant: dayStringToStart(addDaysToString(to, 1)) };
}
