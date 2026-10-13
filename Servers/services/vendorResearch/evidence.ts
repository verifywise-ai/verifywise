/**
 * The evidence pack: the ledger of a run (the snippets of search results and the excerpts of the
 * pages that were read), cleaned, numbered and sized to be shown to the model and stored in the
 * run's `evidence` column.
 *
 * Every string in the ledger is written by a third party and ends up in a JSONB column. Postgres
 * refuses a NUL character and a lone surrogate there (JSON.stringify writes the latter as a \udXXX
 * escape), and one such character would make the whole run fail to save. So the text is cleaned
 * first and an entry whose URL cannot be trusted is dropped.
 */
import {
  EvidenceSource,
  RESEARCH_CATEGORIES,
  ResearchCategory,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { MAX_EXCERPT_CHARS } from "../webResearch/pageText";
import { LedgerEntry } from "../webResearch/webSession";
import { MAX_SNIPPET_CHARS, cleanText, cutAtCodePoint } from "./text";

export { MAX_SNIPPET_CHARS };
export const MAX_EVIDENCE_BYTES = 100_000;

/**
 * Limits on the other fields of a source, in characters. With them one source stays well under
 * MAX_EVIDENCE_BYTES, so a single oversized entry cannot take all the room and empty the pack.
 */
export const MAX_TITLE_CHARS = 300;
export const MAX_URL_CHARS = 2048;
export const MAX_PUBLISHED_AT_CHARS = 64;

/**
 * With the u flag a surrogate pair is read as one code point, so this matches an unpaired
 * surrogate and nothing else. It has no g flag, so it keeps no state between test() calls.
 */
const HAS_LONE_SURROGATE = /[\uD800-\uDFFF]/u;

/** Whitespace, and control characters of every kind: C0, DEL and C1. */
const WHITESPACE_OR_CONTROL = /[\s\u0000-\u001F\u007F-\u009F]/;

/**
 * True for an http or https URL of at most MAX_URL_CHARS characters that holds no whitespace, no
 * control character and no lone surrogate as it was received. Such a URL is not repaired: its entry
 * is dropped, and so is an entry whose URL is not a string at all. The length is checked first, so
 * that a huge string is never scanned.
 */
function isUsableUrl(url: string): boolean {
  if (typeof url !== "string" || url.length > MAX_URL_CHARS) return false;
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
 * Builds the pack from the entries of the ledger. They are taken in the order of
 * RESEARCH_CATEGORIES, and the entries of one category in the order the loop got them. So the ids
 * always follow the categories, and the sources that the byte limit removes from the end are those
 * of the last categories. The steps, in this order:
 *
 * 1. An entry with an unusable URL is dropped. The title, the content and the publication date are
 *    cleaned.
 * 2. A URL seen before is dropped, so the first entry with it wins, across categories too.
 * 3. The title is cut to MAX_TITLE_CHARS, and the content of a page to MAX_EXCERPT_CHARS and of a
 *    result to MAX_SNIPPET_CHARS. A publication date that is empty or longer than
 *    MAX_PUBLISHED_AT_CHARS becomes null.
 * 4. The sources are numbered S1, S2, ... without gaps.
 * 5. Sources are removed from the end until the serialized pack is at most MAX_EVIDENCE_BYTES.
 *
 * The kind and the vendor's mark (`onVendorSite`) are the session's, as they are: whether a page is
 * the vendor's own was decided on the URL that answered, which the entry does not keep.
 */
export function buildEvidencePack(entries: LedgerEntry<ResearchCategory>[]): EvidenceSource[] {
  // sort() is stable, so two entries of one category keep their order. It runs on a copy, so the
  // array of the caller is left as it was.
  const inCategoryOrder = [...entries].sort(
    (a, b) => RESEARCH_CATEGORIES.indexOf(a.category) - RESEARCH_CATEGORIES.indexOf(b.category),
  );
  const seenUrls = new Set<string>();
  const sources: EvidenceSource[] = [];

  for (const entry of inCategoryOrder) {
    if (!isUsableUrl(entry.url) || seenUrls.has(entry.url)) continue;
    seenUrls.add(entry.url);
    const maxContentChars = entry.kind === "page" ? MAX_EXCERPT_CHARS : MAX_SNIPPET_CHARS;
    sources.push({
      id: `S${sources.length + 1}`,
      category: entry.category,
      kind: entry.kind,
      onVendorSite: entry.onVendorSite,
      url: entry.url,
      title: cutAtCodePoint(cleanText(entry.title), MAX_TITLE_CHARS),
      content: cutAtCodePoint(cleanText(entry.content), maxContentChars),
      publishedAt: cleanPublishedAt(entry.publishedAt),
    });
  }

  return fitToByteLimit(sources);
}
