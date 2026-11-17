import { toCsv } from "@/core/csv/write";
import type { ColumnSpec } from "./types";

/** The downloadable template: the header line and one example row. Importing the template as it is adds the example. */
export function buildTemplateCsv(columns: readonly ColumnSpec[]): string {
  return toCsv(columns.map((c) => c.name), [columns.map((c) => c.example)]);
}
