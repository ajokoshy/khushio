import { fillDays, reportWindow, istDayStart, type ReportRange } from "./days";
import * as clicks from "./rollup-repository";
import * as repo from "./report-repository";
import type { ClickReport } from "./types";

/** Admin click and conversion reports (Release 4B). Bots are excluded everywhere: they are never rolled up. */

const LIST_LIMIT = 20;
const ZERO_LIMIT = 50;

export async function buildClickReport(range: ReportRange, now: Date = new Date()): Promise<ClickReport> {
  const { from, to, fromInstant, toInstant } = reportWindow(now, range);
  const [byDayRows, topLinks, byMerchant, byProduct, zeroClickLinks, conversions, todaySoFar] = await Promise.all([
    repo.selectClicksByDay(from, to),
    repo.selectTopLinks(from, to, LIST_LIMIT),
    repo.selectClicksByMerchant(from, to, LIST_LIMIT),
    repo.selectClicksByProduct(from, to, LIST_LIMIT),
    // Links created today are left out (they have had no full day yet); the page shows each link's creation date.
    repo.selectZeroClickLinks(from, to, toInstant, ZERO_LIMIT),
    repo.selectConversionTotals(fromInstant, toInstant),
    clicks.countHumanClicksSince(istDayStart(now)),
  ]);
  const byDay = fillDays(byDayRows, from, to);
  return {
    range: { from, to, days: range },
    totalClicks: byDay.reduce((sum, d) => sum + d.clicks, 0),
    todaySoFar,
    byDay,
    topLinks,
    byMerchant,
    byProduct,
    zeroClickLinks,
    conversions,
  };
}

export const CLICK_EXPORT_LIMIT = 20_000;

/** Human clicks per link per day for the last `range` days (IST days), ready for a CSV. `truncated` is true when the cap was hit. */
export async function exportClickRows(range: ReportRange, now: Date = new Date()): Promise<{ rows: (string | number)[][]; from: string; to: string; truncated: boolean }> {
  const { from, to } = reportWindow(now, range);
  const page = await repo.selectClicksForExport(from, to, CLICK_EXPORT_LIMIT + 1);
  return { rows: page.slice(0, CLICK_EXPORT_LIMIT).map((r) => [r.day, r.slug, r.merchantSlug, r.productSlug ?? "", r.clicks]), from, to, truncated: page.length > CLICK_EXPORT_LIMIT };
}
