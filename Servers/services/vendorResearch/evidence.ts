/**
 * The evidence pack: the search results of a run, cleaned, numbered and sized to be shown to the
 * model and stored in the run's `evidence` column.
 *
 * Every string in a search result is written by a third party and ends up in a JSONB column.
 * Postgres refuses a NUL character and a lone surrogate there (JSON.stringify writes the latter as
 * a \udXXX escape), and one such character would make the whole run fail to save. So the text is
 * cleaned first and a hit whose URL cannot be trusted is dropped.
 */
import {
  EvidenceSource,
  RESEARCH_CATEGORIES,
  ResearchCategory,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { SearchHit } from "./searchProvider";
import { MAX_SNIPPET_CHARS, cutAtCodePoint } from "./text";

export { MAX_SNIPPET_CHARS };
export const MAX_EVIDENCE_BYTES = 40_000;

/**
 * Limits on the other fields of a source, in characters. With them one source stays well under
 * MAX_EVIDENCE_BYTES, so a single oversized result cannot take all the room and empty the pack.
 */
export const MAX_TITLE_CHARS = 300;
export const MAX_URL_CHARS = 2048;
export const MAX_PUBLISHED_AT_CHARS = 64;

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
 * True for an http or https URL of at most MAX_URL_CHARS characters that holds no whitespace, no
 * control character and no lone surrogate as it was received. Such a URL is not repaired: its hit
 * is dropped. The length is checked first, so that a huge string is never scanned.
 */
function isUsableUrl(url: string): boolean {
  if (url.length > MAX_URL_CHARS) return false;
  if (WHITESPACE_OR_CONTROL.test(url) || HAS_LONE_SURROGATE.test(url)) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The cleaned publication date, or null when nothing is left of it or it is longer than
 * MAX_PUBLISHED_AT_CHARS. A real date is much shorter than that.
 */
function cleanPublishedAt(publishedAt: string | null): string | null {
  if (publishedAt === null) return null;
  const cleaned = cleanText(publishedAt);
  return cleaned === "" || cleaned.length > MAX_PUBLISHED_AT_CHARS ? null : cleaned;
}

/** The longest start of `sources` that serializes to at most MAX_EVIDENCE_BYTES bytes. */
function fitToByteLimit(sources: EvidenceSource[]): EvidenceSource[] {
  const kept = [...sources];
  // An empty pack is "[]", two bytes, so the loop always ends.
  while (Buffer.byteLength(JSON.stringify(kept)) > MAX_EVIDENCE_BYTES) kept.pop();
  return kept;
}

/**
 * Builds the pack from the hits of each category. The results are taken in the order of
 * RESEARCH_CATEGORIES, whatever order they are passed in, and the hits of one category keep their
 * order. So the ids always follow the categories, and the sources that the byte limit removes from
 * the end are those of the last categories. The steps, in this order:
 *
 * 1. A hit with an unusable URL is dropped. The title, the snippet and the publication date are
 *    cleaned.
 * 2. A URL seen before is dropped, so the first hit with it wins, across categories too.
 * 3. The title is cut to MAX_TITLE_CHARS and the snippet to MAX_SNIPPET_CHARS. A publication date
 *    that is empty or longer than MAX_PUBLISHED_AT_CHARS becomes null.
 * 4. The sources are numbered S1, S2, ... without gaps.
 * 5. Sources are removed from the end until the serialized pack is at most MAX_EVIDENCE_BYTES.
 */
export function buildEvidencePack(
  results: Array<{ category: ResearchCategory; hits: SearchHit[] }>,
): EvidenceSource[] {
  // sort() is stable, so two results of one category keep their order. It runs on a copy, so the
  // array of the caller is left as it was.
  const inCategoryOrder = [...results].sort(
    (a, b) => RESEARCH_CATEGORIES.indexOf(a.category) - RESEARCH_CATEGORIES.indexOf(b.category),
  );
  const seenUrls = new Set<string>();
  const sources: EvidenceSource[] = [];

  for (const { category, hits } of inCategoryOrder) {
    for (const hit of hits) {
      if (!isUsableUrl(hit.url) || seenUrls.has(hit.url)) continue;
      seenUrls.add(hit.url);
      sources.push({
        id: `S${sources.length + 1}`,
        category,
        url: hit.url,
        title: cutAtCodePoint(cleanText(hit.title), MAX_TITLE_CHARS),
        content: cutAtCodePoint(cleanText(hit.content), MAX_SNIPPET_CHARS),
        publishedAt: cleanPublishedAt(hit.publishedAt),
      });
    }
  }

  return fitToByteLimit(sources);
}
