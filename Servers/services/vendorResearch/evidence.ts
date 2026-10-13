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

/** A source that has no id yet, and the bytes it takes in the pack, its comma included. */
interface SizedSource {
  source: Omit<EvidenceSource, "id">;
  bytes: number;
}

/**
 * The id a source is measured with before the pack is numbered: that of S1 to S9, the shortest.
 * The ids from S10 on are one character longer, which the check of the numbered pack makes good.
 */
const MEASURED_ID = "S0";

const bytesOf = (sources: SizedSource[]): number =>
  sources.reduce((sum, { bytes }) => sum + bytes, 0);

/** The serialized size of the pack that the groups make: "[]", the sources, a comma between two. */
function packBytes(groups: SizedSource[][]): number {
  const sources = groups.flat();
  return sources.length === 0 ? 2 : 1 + bytesOf(sources);
}

/**
 * Removes the last source of the category that holds the most bytes. The groups are in the order of
 * RESEARCH_CATEGORIES and an empty one is not a candidate. A tie goes to the later category: the
 * `>=` lets a later group replace an equal one.
 */
function removeFromLargestCategory(groups: SizedSource[][]): void {
  let largest: SizedSource[] | undefined;
  let largestBytes = -1;
  for (const group of groups) {
    if (group.length === 0) continue;
    const total = bytesOf(group);
    if (total >= largestBytes) {
      largest = group;
      largestBytes = total;
    }
  }
  largest?.pop();
}

/** The sources of the groups in category order, numbered S1, S2, ... without gaps. */
const numbered = (groups: SizedSource[][]): EvidenceSource[] =>
  groups.flat().map(({ source }, index) => ({ id: `S${index + 1}`, ...source }));

/**
 * Builds the pack from the entries of the ledger. They are taken in the order of
 * RESEARCH_CATEGORIES, and the entries of one category in the order the loop got them. So the ids
 * always follow the categories. The steps, in this order:
 *
 * 1. An entry with an unusable URL is dropped. The title, the content and the publication date are
 *    cleaned.
 * 2. A URL seen before is dropped, so the first entry with it wins, across categories too.
 * 3. The title is cut to MAX_TITLE_CHARS, and the content of a page to MAX_EXCERPT_CHARS and of a
 *    result to MAX_SNIPPET_CHARS. A publication date that is empty or longer than
 *    MAX_PUBLISHED_AT_CHARS becomes null.
 * 4. Until the serialized pack is at most MAX_EVIDENCE_BYTES, the last source of the category that
 *    holds the most bytes is removed; a tie goes to the later category. A category that has sources
 *    is therefore never emptied while another one is larger, and a full run cannot leave the last
 *    categories without a source, which the summary would read as "nothing found".
 * 5. The sources are numbered S1, S2, ... without gaps, after the trimming. Step 4 measured them
 *    with the id of S1 to S9, so the numbered pack is measured once more, and if the longer ids
 *    of S10 and up made it too big, step 4 goes on.
 *
 * The kind and the vendor's mark (`onVendorSite`) are the session's, as they are: whether a page is
 * the vendor's own was decided on the URL that answered, which the entry does not keep.
 */
export function buildEvidencePack(entries: LedgerEntry<ResearchCategory>[]): EvidenceSource[] {
  const seenUrls = new Set<string>();
  // Category by category, so that the first entry of a URL wins in the order of the categories.
  const groups = RESEARCH_CATEGORIES.map((category) => {
    const sized: SizedSource[] = [];
    for (const entry of entries) {
      if (entry.category !== category) continue;
      if (!isUsableUrl(entry.url) || seenUrls.has(entry.url)) continue;
      seenUrls.add(entry.url);
      const maxContentChars = entry.kind === "page" ? MAX_EXCERPT_CHARS : MAX_SNIPPET_CHARS;
      const source = {
        category: entry.category,
        kind: entry.kind,
        onVendorSite: entry.onVendorSite,
        url: entry.url,
        title: cutAtCodePoint(cleanText(entry.title), MAX_TITLE_CHARS),
        content: cutAtCodePoint(cleanText(entry.content), maxContentChars),
        publishedAt: cleanPublishedAt(entry.publishedAt),
      };
      const json = JSON.stringify({ id: MEASURED_ID, ...source });
      sized.push({ source, bytes: Buffer.byteLength(json) + 1 });
    }
    return sized;
  });

  // An empty pack is "[]", two bytes, so both loops end.
  while (packBytes(groups) > MAX_EVIDENCE_BYTES) removeFromLargestCategory(groups);

  let pack = numbered(groups);
  while (Buffer.byteLength(JSON.stringify(pack)) > MAX_EVIDENCE_BYTES) {
    removeFromLargestCategory(groups);
    pack = numbered(groups);
  }
  return pack;
}
