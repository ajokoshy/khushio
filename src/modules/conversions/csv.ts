import { ValidationError } from "@/core/errors";

/**
 * A small CSV reader for network reports (Release 4B): quoted fields with commas, doubled quotes and line breaks,
 * CRLF or LF, a leading byte-order mark, and a comma, semicolon or tab as the separator (taken from the header line).
 * Blank lines are skipped. Returns the lines with their 1-based line number in the file.
 */
export type CsvLine = { line: number; cells: string[] };

function detectDelimiter(firstLine: string): string {
  let best = ",";
  let bestCount = 0;
  for (const candidate of [",", ";", "\t"]) {
    let inQuotes = false;
    let count = 0;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === candidate && !inQuotes) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string): CsvLine[] {
  const text = input.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text.split(/\r\n|\n|\r/, 1)[0] ?? "");
  const lines: CsvLine[] = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let line = 1;
  let startLine = 1;
  let touched = false; // something other than whitespace was seen on this record

  const endCell = () => {
    cells.push(cell);
    cell = "";
  };
  const endRecord = () => {
    endCell();
    if (touched || cells.some((c) => c.trim() !== "")) lines.push({ line: startLine, cells: cells.map((c) => c.trim()) });
    cells = [];
    touched = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else inQuotes = false;
      } else {
        if (ch === "\n") line += 1;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      inQuotes = true;
      touched = true;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      endRecord();
      line += 1;
      startLine = line;
    } else {
      cell += ch;
    }
  }
  if (inQuotes) throw new ValidationError("Broken CSV", { file: `The file has a quoted value that never closes (it starts on line ${startLine}).` });
  endRecord();
  return lines;
}
