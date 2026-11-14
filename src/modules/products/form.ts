import { formDataToObject } from "@/core/validation/fields";

/**
 * Turns the product form into the plain object the Zod schema reads. The scalar fields come from
 * formDataToObject; the repeating parts use indexed names: variants.0.label, variants.1.price, attributes.0.name ...
 * Rows the admin left completely empty are dropped (the form always shows one spare row).
 */

function collectRows(formData: FormData, prefix: string, fields: readonly string[], blankIgnores: readonly string[]): Record<string, string>[] {
  const rows = new Map<number, Record<string, string>>();
  const pattern = new RegExp(`^${prefix}\\.(\\d{1,3})\\.([a-zA-Z]+)$`);
  for (const [key, value] of formData.entries()) {
    const m = pattern.exec(key);
    if (!m || typeof value !== "string") continue;
    const [, index, field] = m;
    if (!field || !fields.includes(field)) continue;
    const n = Number(index);
    const row = rows.get(n) ?? {};
    row[field] = value;
    rows.set(n, row);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, row]) => row)
    .filter((row) => Object.entries(row).some(([field, value]) => !blankIgnores.includes(field) && value.trim() !== ""));
}

export function productFormToObject(formData: FormData): Record<string, unknown> {
  const raw = formDataToObject(formData);
  raw.categoryIds = formData.getAll("categoryIds").filter((v): v is string => typeof v === "string");
  raw.variants = collectRows(formData, "variants", ["id", "label", "sku", "price", "currency"], ["currency", "id"]);
  raw.attributes = collectRows(formData, "attributes", ["name", "value"], []);
  return raw;
}
