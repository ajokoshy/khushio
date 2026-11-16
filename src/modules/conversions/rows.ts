import { ValidationError } from "@/core/errors";
import { parseAdminDateTime } from "@/core/validation/datetime";
import { CURRENCY_CODES, isCurrencyCode, parsePriceToMinor, type CurrencyCode } from "@/core/validation/money";
import { parseCsv } from "./csv";
import type { ConversionStatus } from "./types";

/**
 * Turns a network's CSV report into conversion rows (Release 4B). Networks name their columns differently, so a column
 * is found by any of several common names. REQUIRED: an order id, a commission and a date. OPTIONAL: status (default
 * "pending"), currency (default: the one chosen on the form) and a sub-ID (the link slug that Khushio sent through
 * {subid}), which attributes the order to a link.
 */

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 1_000_000;

const COLUMN_NAMES = {
  order: ["order_id", "external_order_id", "transaction_id", "order", "orderid", "order_no", "order_number", "order_ref"],
  commission: ["commission", "commission_amount", "payout", "earnings", "earning", "commission_inr", "commission_value"],
  date: ["date", "converted_at", "order_date", "transaction_date", "conversion_date", "datetime", "time"],
  status: ["status", "order_status", "commission_status", "state"],
  currency: ["currency", "currency_code"],
  subId: ["sub_id", "subid", "sub_id_1", "subtag", "sub_tag", "ascsubtag", "sub1"],
} as const;

type Field = keyof typeof COLUMN_NAMES;

export const normaliseHeader = (h: string): string => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const STATUS_WORDS: Record<ConversionStatus, readonly string[]> = {
  pending: ["pending", "tracked", "open", "hold", "on_hold", "processing", "locked_pending", "unconfirmed", "new"],
  approved: ["approved", "confirmed", "validated", "accepted", "locked", "payable"],
  rejected: ["rejected", "declined", "cancelled", "canceled", "void", "invalid", "reversed", "returned", "refunded"],
  paid: ["paid", "settled", "paid_out", "payment_done"],
};

export function mapStatus(value: string): ConversionStatus | null {
  const word = normaliseHeader(value);
  for (const [status, words] of Object.entries(STATUS_WORDS) as [ConversionStatus, readonly string[]][]) if (words.includes(word)) return status;
  return null;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
const DMY = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?)?$/;
const pad = (n: number | string, w = 2) => String(n).padStart(w, "0");

/**
 * "2026-11-01", "2026-11-01 14:30", "2026-11-01T14:30:00Z", "2026-11-01T14:30:00+05:30", "01/11/2026", "01-11-2026 14:30".
 * Without a time zone the time is India time. Day/month/year is read day first (Indian reports); a date such as 01/11/2026
 * is 1 November. Impossible dates (31 February) are refused.
 */
export function parseConversionDate(input: string): ParseResult<Date> {
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

/** "1,299.50", "₹120", "0" -> minor units. Zero is allowed here (a rejected order earns nothing); negatives are not. */
export function parseCommission(input: string, currency: CurrencyCode): ParseResult<number> {
  const cleaned = input.trim().replace(/^(₹|rs\.?|inr|\$|€|£)\s*/i, "");
  if (!cleaned) return { ok: false, error: "the commission is empty (write 0 if there is none)" };
  if (cleaned.startsWith("-")) return { ok: false, error: `"${cleaned.slice(0, 20)}" is negative. Record a reversal by changing the order's status to Rejected` };
  if (/^0+(\.0+)?$/.test(cleaned.replace(/,/g, "").replace(/\s+/g, ""))) return { ok: true, value: 0 };
  const parsed = parsePriceToMinor(cleaned, currency);
  if (!parsed.ok) return { ok: false, error: parsed.message.replace(/\.$/, "").replace(/^Enter an amount/, "the commission should be an amount") };
  return parsed.minor === null ? { ok: false, error: "the commission is empty" } : { ok: true, value: parsed.minor };
}

export type ParsedConversion = {
  line: number;
  externalOrderId: string;
  commissionMinor: number;
  currency: CurrencyCode;
  status: ConversionStatus;
  convertedAt: Date;
  subId: string | null;
};
export type RowError = { line: number; message: string };
export type ParsedFile = { rows: ParsedConversion[]; errors: RowError[]; rowsInFile: number; duplicatesInFile: number };

export function parseConversionCsv(text: string, defaultCurrency: CurrencyCode): ParsedFile {
  if (text.length > MAX_IMPORT_BYTES) throw new ValidationError("File too large", { file: "The file is larger than 1 MB. Split it into smaller files." });
  const lines = parseCsv(text);
  const header = lines[0];
  if (!header) throw new ValidationError("Empty file", { file: "The file is empty." });

  const index = new Map<Field, number>();
  header.cells.forEach((cell, i) => {
    const name = normaliseHeader(cell);
    for (const field of Object.keys(COLUMN_NAMES) as Field[]) {
      if (!index.has(field) && (COLUMN_NAMES[field] as readonly string[]).includes(name)) index.set(field, i);
    }
  });
  const missing = (["order", "commission", "date"] as Field[]).filter((f) => !index.has(f));
  if (missing.length > 0) {
    const label: Record<string, string> = { order: "an order id (order_id)", commission: "a commission (commission)", date: "a date (date)" };
    throw new ValidationError("Missing columns", { file: `The first line must name the columns. Missing: ${missing.map((m) => label[m]).join(", ")}. Found: ${header.cells.join(", ") || "nothing"}.` });
  }

  const body = lines.slice(1);
  if (body.length === 0) throw new ValidationError("No rows", { file: "The file has a header line but no rows." });
  if (body.length > MAX_IMPORT_ROWS) throw new ValidationError("Too many rows", { file: `The file has ${body.length} rows. The limit is ${MAX_IMPORT_ROWS}; split it into smaller files.` });

  const cellOf = (cells: string[], field: Field) => (index.has(field) ? (cells[index.get(field) as number] ?? "") : "");
  const byOrder = new Map<string, ParsedConversion>();
  const errors: RowError[] = [];
  let duplicatesInFile = 0;

  for (const { line, cells } of body) {
    const fail = (message: string) => void errors.push({ line, message });
    const externalOrderId = cellOf(cells, "order").trim();
    if (!externalOrderId) { fail("the order id is empty"); continue; }
    if (externalOrderId.length > 120) { fail("the order id is longer than 120 characters"); continue; }

    const currencyText = cellOf(cells, "currency").trim().toUpperCase();
    if (currencyText && !isCurrencyCode(currencyText)) { fail(`currency "${currencyText.slice(0, 8)}" is not supported (${CURRENCY_CODES.join(", ")})`); continue; }
    const currency = (currencyText || defaultCurrency) as CurrencyCode;

    const commission = parseCommission(cellOf(cells, "commission"), currency);
    if (!commission.ok) { fail(commission.error); continue; }
    const date = parseConversionDate(cellOf(cells, "date"));
    if (!date.ok) { fail(date.error); continue; }

    let status: ConversionStatus = "pending";
    const statusText = cellOf(cells, "status").trim();
    if (statusText) {
      const mapped = mapStatus(statusText);
      if (!mapped) { fail(`status "${statusText.slice(0, 20)}" is not one I know (pending, approved, rejected, paid)`); continue; }
      status = mapped;
    }
    const subId = cellOf(cells, "subId").trim().toLowerCase() || null;

    if (byOrder.has(externalOrderId)) duplicatesInFile += 1; // the later line wins: networks list the newest state last
    byOrder.set(externalOrderId, { line, externalOrderId, commissionMinor: commission.value, currency, status, convertedAt: date.value, subId });
  }
  return { rows: [...byOrder.values()], errors, rowsInFile: body.length, duplicatesInFile };
}
