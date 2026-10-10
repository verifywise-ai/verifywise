/**
 * The evidence pack: the search results of a run, cleaned, numbered and sized to be shown to the
 * model and stored in the run's `evidence` column.
 *
 * Every string in a search result is written by a third party and ends up in a JSONB column.
 * Postgres refuses a NUL character and a lone surrogate there (JSON.stringify writes the latter as
 * a \udXXX escape), and one such character would make the whole run fail to save. So the text is
 * cleaned first and a hit whose URL cannot be trusted is dropped.
 */
import { EvidenceSource, ResearchCategory } from "../../domain.layer/interfaces/i.vendorResearch";
import { SearchHit } from "./searchProvider";

export const MAX_SNIPPET_CHARS = 1500;
export const MAX_EVIDENCE_BYTES = 40_000;

/** The C0 control characters other than tab, line feed and carriage return. */
const UNWANTED_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/**
 * With the u flag a surrogate pair is read as one code point, so these match an unpaired
 * surrogate and nothing else. The global one is for replace(); the other has no g flag, so it
 * keeps no state between test() calls.
 */
const LONE_SURROGATES = /[\uD800-\uDFFF]/gu;
const HAS_LONE_SURROGATE = /[\uD800-\uDFFF]/u;

/** Whitespace, and control characters of every kind: C0, DEL and C1. */
const WHITESPACE_OR_CONTROL = /[\s\u0000-\u001F\u007F-\u009F]/;

/** Removes the control characters and replaces each lone surrogate with U+FFFD. */
function cleanText(text: string): string {
  return text.replace(UNWANTED_CONTROL_CHARACTERS, "").replace(LONE_SURROGATES, "\uFFFD");
}

/**
 * True for an http or https URL that holds no whitespace, no control character and no lone
 * surrogate as it was received. Such a URL is not repaired: its hit is dropped.
 */
function isUsableUrl(url: string): boolean {
  if (WHITESPACE_OR_CONTROL.test(url) || HAS_LONE_SURROGATE.test(url)) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Cuts to `max` UTF-16 units. When the cut would leave the first half of a surrogate pair at the
 * end, that half goes too. The text has no lone surrogate at this point, so a high surrogate at
 * the end can only be the first half of a pair.
 */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const lastKept = text.charCodeAt(max - 1);
  const endsInsidePair = lastKept >= 0xd800 && lastKept <= 0xdbff;
  return text.slice(0, endsInsidePair ? max - 1 : max);
}

/** The longest start of `sources` that serializes to at most MAX_EVIDENCE_BYTES bytes. */
function fitToByteLimit(sources: EvidenceSource[]): EvidenceSource[] {
  const kept = [...sources];
  // An empty pack is "[]", two bytes, so the loop always ends.
  while (Buffer.byteLength(JSON.stringify(kept)) > MAX_EVIDENCE_BYTES) kept.pop();
  return kept;
}

/**
 * Builds the pack from the hits of each category. Sources keep the order of `results` and, inside
 * each, of its hits. The pipeline passes the results in plan order, which is the order of the
 * categories, so the ids follow the categories. The steps, in this order:
 *
 * 1. A hit with an unusable URL is dropped. The title, the snippet and the publication date are
 *    cleaned.
 * 2. A URL seen before is dropped, so the first hit with it wins, across categories too.
 * 3. The snippet is cut to MAX_SNIPPET_CHARS.
 * 4. The sources are numbered S1, S2, ... without gaps.
 * 5. Sources are removed from the end until the serialized pack is at most MAX_EVIDENCE_BYTES.
 */
export function buildEvidencePack(
  results: Array<{ category: ResearchCategory; hits: SearchHit[] }>,
): EvidenceSource[] {
  const seenUrls = new Set<string>();
  const sources: EvidenceSource[] = [];

  for (const { category, hits } of results) {
    for (const hit of hits) {
      if (!isUsableUrl(hit.url) || seenUrls.has(hit.url)) continue;
      seenUrls.add(hit.url);
      sources.push({
        id: `S${sources.length + 1}`,
        category,
        url: hit.url,
        title: cleanText(hit.title),
        content: cut(cleanText(hit.content), MAX_SNIPPET_CHARS),
        publishedAt: hit.publishedAt === null ? null : cleanText(hit.publishedAt) || null,
      });
    }
  }

  return fitToByteLimit(sources);
}
