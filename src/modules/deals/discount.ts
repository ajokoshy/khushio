import { formatMinor, isCurrencyCode, parsePriceToMinor, minorToInput, type CurrencyCode } from "@/core/validation/money";
import type { DiscountType } from "./types";

/** "15" or "12.5" or "15%" -> basis points (1500, 1250). 1 to 100 percent, at most two decimals. */
export function parsePercentToBasisPoints(input: string): { ok: true; value: number } | { ok: false; message: string } {
  const cleaned = input.trim().replace(/%$/, "").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(cleaned)) return { ok: false, message: "Enter a percentage such as 15 or 12.5" };
  const [whole = "0", fraction = ""] = cleaned.split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (value < 1) return { ok: false, message: "The percentage must be above zero" };
  if (value > 10_000) return { ok: false, message: "The percentage cannot be above 100" };
  return { ok: true, value };
}

/** Basis points back to what an admin types: 1500 -> "15", 1250 -> "12.5". */
export function basisPointsToInput(value: number): string {
  const whole = Math.trunc(value / 100);
  const fraction = String(value % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** What the admin typed in the "value" box, as the number stored for this discount type. */
export function parseDiscountValue(type: DiscountType, input: string, currency: CurrencyCode): { ok: true; value: number } | { ok: false; message: string } {
  if (type === "free_shipping" || type === "other") return { ok: true, value: 0 };
  if (type === "percent") return parsePercentToBasisPoints(input);
  const parsed = parsePriceToMinor(input, currency);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  if (parsed.minor === null) return { ok: false, message: "Enter the amount taken off" };
  return { ok: true, value: parsed.minor };
}

export function discountValueToInput(type: string, value: number, currency: string): string {
  if (type === "percent") return basisPointsToInput(value);
  if (type === "fixed") return minorToInput(value, (isCurrencyCode(currency) ? currency : "INR") as CurrencyCode);
  return "";
}

/** "15% off", "₹200 off", "Free shipping", "" (other: the deal's own text explains it). */
export function describeDiscount(type: string, value: number, currency: string): string {
  if (type === "percent") return `${basisPointsToInput(value)}% off`;
  if (type === "fixed") return `${formatMinor(value, currency)} off`;
  if (type === "free_shipping") return "Free shipping";
  return "";
}

/** "On orders above ₹999", or "" when there is no minimum. */
export function describeMinSpend(minSpendMinor: number | null, currency: string): string {
  return minSpendMinor && minSpendMinor > 0 ? `On orders above ${formatMinor(minSpendMinor, currency)}` : "";
}
