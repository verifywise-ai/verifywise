import type { ArtifactKind } from "./prompt";

/**
 * The corpus a customer downloads and scores: an ID, the form and the text.
 * No demographic or tier column; those stay in the manifest, server side.
 */
export const CORPUS_CSV_HEADER = ["candidate_id", "artifact_kind", "artifact"] as const;

// A field a spreadsheet could run as a formula gets a leading apostrophe.
// Same rule as utils/csv.utils.ts, which this pure module cannot import.
const FORMULA_START = /^[=+\-@\t\r]/;

function field(value: string): string {
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  // RFC 4180: quote a field holding a comma, quote or line break.
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function corpusCsvHeaderLine(): string {
  return `${CORPUS_CSV_HEADER.join(",")}\r\n`;
}

export function corpusCsvRow(r: {
  candidateId: string;
  artifactKind: ArtifactKind;
  text: string;
}): string {
  return `${[r.candidateId, r.artifactKind, r.text].map(field).join(",")}\r\n`;
}
