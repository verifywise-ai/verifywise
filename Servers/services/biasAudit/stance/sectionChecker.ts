/**
 * Checks the rendered stance HTML for its required sections.
 *
 * It reads the HTML, not the model, so a template change that drops a section
 * is caught. Six sections once went missing from a report drafted from
 * scratch, independence among them; this is the gate against a repeat.
 * Pure: no I/O.
 */
import { REQUIRED_SECTIONS } from "./compose";

/** The facts a corpus stance must print in "What was tested". */
export const CORPUS_FACTS = ["corpus", "models", "cell_sizes", "criteria"] as const;

/** The HTML of one section, from its opening tag to the next `</section>`. */
function sectionHtml(html: string, key: string): string {
  const open = html.search(new RegExp(`<section\\b[^>]*\\bdata-key="${key}"`));
  if (open < 0) return "";
  const close = html.indexOf("</section>", open);
  return html.slice(open, close < 0 ? html.length : close);
}

/**
 * With `opts.corpus`, a stance scored from a generated corpus must also carry
 * each corpus fact as a `data-fact` marker inside "What was tested"; a
 * missing one is listed as `what_was_tested.corpus.<fact>`.
 */
export function checkSections(
  html: string,
  required: readonly string[] = REQUIRED_SECTIONS,
  opts: { corpus?: boolean } = {},
): { missing: string[]; ok: boolean } {
  const present = new Set(
    Array.from(html.matchAll(/<section\b[^>]*\bdata-key="([^"]+)"/g), (m) => m[1]),
  );
  const missing = required.filter((k) => !present.has(k));
  if (opts.corpus) {
    const tested = sectionHtml(html, "what_was_tested");
    for (const fact of CORPUS_FACTS) {
      if (!tested.includes(`data-fact="${fact}"`)) missing.push(`what_was_tested.corpus.${fact}`);
    }
  }
  return { missing, ok: missing.length === 0 };
}
