/**
 * Reads the header line of a CSV file in the browser, so the column mapping
 * can offer the file's own column names. Only the first 64 KB are read; the
 * server parses the whole file.
 */

/** Enough of the file to read its header line. */
const HEADER_PROBE_BYTES = 64 * 1024;

/** Splits one CSV line, honouring double-quoted fields. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(field);
      field = "";
    } else field += c;
  }
  out.push(field);
  return out;
}

/** The named columns of a CSV file, trimmed as the server's parser trims them. */
export async function readCsvHeaders(file: File): Promise<string[]> {
  const text = (await file.slice(0, HEADER_PROBE_BYTES).text()).replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  return [...new Set(splitCsvLine(firstLine).map((h) => h.trim()))].filter((h) => h !== "");
}
