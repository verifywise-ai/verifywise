/**
 * Checks the rendered stance HTML for its required sections.
 *
 * It reads the HTML, not the model, so a template change that drops a section
 * is caught. Six sections once went missing from a report drafted from
 * scratch, independence among them; this is the gate against a repeat.
 * Pure: no I/O.
 */
import { REQUIRED_SECTIONS } from "./compose";

export function checkSections(
  html: string,
  required: readonly string[] = REQUIRED_SECTIONS,
): { missing: string[]; ok: boolean } {
  const present = new Set(
    Array.from(html.matchAll(/<section\b[^>]*\bdata-key="([^"]+)"/g), (m) => m[1]),
  );
  const missing = required.filter((k) => !present.has(k));
  return { missing, ok: missing.length === 0 };
}
