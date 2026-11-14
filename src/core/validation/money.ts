/**
 * Money is stored as an integer count of the smallest unit ("minor units": paise for INR, cents for USD,
 * whole yen for JPY). Admins type the normal amount ("1,299.50"); these helpers convert it without ever
 * using floating point, and refuse decimals that the currency cannot hold.
 */
export const CURRENCY_EXPONENT = { INR: 2, USD: 2, EUR: 2, GBP: 2, AED: 2, SGD: 2, AUD: 2, CAD: 2, JPY: 0 } as const;
export type CurrencyCode = keyof typeof CURRENCY_EXPONENT;
export const CURRENCY_CODES = Object.keys(CURRENCY_EXPONENT) as [CurrencyCode, ...CurrencyCode[]];
export const DEFAULT_CURRENCY: CurrencyCode = "INR";

/** product_variants.price_minor is a 32-bit integer column. */
export const MAX_MINOR_UNITS = 2_147_483_647;

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCY_EXPONENT, value);
}

export type PriceParse = { ok: true; minor: number | null } | { ok: false; message: string };

const GROUPED = /^\d{1,3}(,\d{2,3})+(\.\d+)?$/; // 1,299.50  or  12,99,999
const PLAIN = /^\d+(\.\d+)?$/;

/** "" -> null (no price). "1299", "1,299.5", "₹1299.50" -> minor units. Rejects zero, negatives, junk and extra decimals. */
export function parsePriceToMinor(input: string | null | undefined, currency: CurrencyCode): PriceParse {
  const cleaned = (input ?? "").trim().replace(/^(₹|rs\.?|inr|\$|€|£)\s*/i, "").replace(/\s+/g, "");
  if (cleaned === "") return { ok: true, minor: null };
  if (!PLAIN.test(cleaned) && !GROUPED.test(cleaned)) return { ok: false, message: "Enter an amount such as 1299 or 1299.50" };

  const [whole = "0", fraction = ""] = cleaned.replace(/,/g, "").split(".");
  const exponent = CURRENCY_EXPONENT[currency];
  if (fraction.length > exponent) {
    return { ok: false, message: exponent === 0 ? `${currency} has no decimals. Enter a whole number.` : `Use at most ${exponent} decimal places.` };
  }
  const minor = Number(whole + fraction.padEnd(exponent, "0"));
  if (!Number.isSafeInteger(minor)) return { ok: false, message: "That amount is too large." };
  if (minor <= 0) return { ok: false, message: "Enter an amount above zero, or leave the price empty." };
  if (minor > MAX_MINOR_UNITS) return { ok: false, message: "That amount is too large." };
  return { ok: true, minor };
}

/** Minor units back to the text an admin would type: 129950 -> "1299.50", 129900 -> "1299". */
export function minorToInput(minor: number | null | undefined, currency: CurrencyCode): string {
  if (minor === null || minor === undefined) return "";
  const exponent = CURRENCY_EXPONENT[currency];
  if (exponent === 0) return String(minor);
  const unit = 10 ** exponent;
  const whole = Math.trunc(minor / unit);
  const fraction = String(minor % unit).padStart(exponent, "0");
  return /^0+$/.test(fraction) ? String(whole) : `${whole}.${fraction}`;
}

/** For display: 129950 INR -> "₹1,299.50", 129900 INR -> "₹1,299". */
export function formatMinor(minor: number, currency: CurrencyCode | string, locale = "en-IN"): string {
  const exponent = isCurrencyCode(currency) ? CURRENCY_EXPONENT[currency] : 2;
  const unit = 10 ** exponent;
  const whole = minor % unit === 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : exponent,
    maximumFractionDigits: exponent,
  }).format(minor / unit);
}
