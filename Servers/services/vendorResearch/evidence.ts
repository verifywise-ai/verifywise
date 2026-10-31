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
  RECORD_SOURCE_IDS,
  RESEARCH_CATEGORIES,
  RecordSourceId,
  RecordStatus,
  ResearchCategory,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { MAX_PAGE_CONTENT_CHARS } from "../webResearch/pageText";
import { LedgerEntry } from "../webResearch/webSession";
import { classifySource } from "./sourceRegistry/classify";
import type { ResearchTarget } from "./target";
import { MAX_SNIPPET_CHARS, cleanText, cutAtCodePoint } from "./text";
import type { VrdbRecordMeta } from "./vrdb/types";

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

const sizeOf = (source: SizedSource["source"]): SizedSource => ({
  source,
  bytes: Buffer.byteLength(JSON.stringify({ id: MEASURED_ID, ...source })) + 1,
});

const bytesOf = (sources: SizedSource[]): number =>
  sources.reduce((sum, { bytes }) => sum + bytes, 0);

/** The serialized size of the pack that the groups make: "[]", the sources, a comma between two. */
function packBytes(groups: SizedSource[][]): number {
  const sources = groups.flat();
  return sources.length === 0 ? 2 : 1 + bytesOf(sources);
}

const serializedBytes = (pack: EvidenceSource[]): number => Buffer.byteLength(JSON.stringify(pack));

/** The bytes a string takes in the stored JSON: UTF-8, escapes and the two quotes included. */
const jsonBytes = (text: string): number => Buffer.byteLength(JSON.stringify(text));

/**
 * The longest start of `text` that takes at most `maxBytes` in the stored JSON, and does not end
 * inside a surrogate pair. The size grows with the length, so it is found by halving.
 */
function cutToJsonBytes(text: string, maxBytes: number): string {
  let fits = 0;
  let tooLong = text.length + 1;
  while (tooLong - fits > 1) {
    const middle = Math.floor((fits + tooLong) / 2);
    if (jsonBytes(cutAtCodePoint(text, middle)) <= maxBytes) fits = middle;
    else tooLong = middle;
  }
  return cutAtCodePoint(text, fits);
}

/** The non-empty group that holds the most bytes. A tie goes to the later one: `>=` lets it replace. */
function largestOf(groups: SizedSource[][]): SizedSource[] | undefined {
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
  return largest;
}

/**
 * Takes one step toward the limit, when the pack is `excess` bytes over it. The groups are in the
 * order of RESEARCH_CATEGORIES. A category with two or more sources gives up its last one, that of
 * the category that holds the most bytes among them. A category with one source keeps it: a page in
 * a script of three bytes a character takes about a quarter of the pack, so the largest category
 * can be that single source, and removing it would leave a category nobody analysed. When every
 * category is down to one source, the content of the largest source is cut instead (the start of
 * the excerpt stays, whole characters) by the excess, or to nothing if that is not enough, and the
 * next step takes the next largest.
 */
function trimLargest(groups: SizedSource[][], excess: number): void {
  const several = largestOf(groups.filter((group) => group.length > 1));
  if (several) {
    several.pop();
    return;
  }
  const cuttable = largestOf(
    groups.filter((group) => group.length === 1 && group[0].source.content !== ""),
  );
  if (!cuttable) {
    // Nothing left to cut. Four categories never come here: a source without its content takes
    // about 7 KB. The pop keeps the loops that call this one from running forever.
    largestOf(groups)?.pop();
    return;
  }
  const { source } = cuttable[0];
  const budget = Math.max(jsonBytes(source.content) - excess, jsonBytes(""));
  cuttable[0] = sizeOf({ ...source, content: cutToJsonBytes(source.content, budget) });
}

/** A vendor without a domain: whether a host is blocked does not depend on the vendor. */
const ANY_VENDOR: ResearchTarget = { name: "", domain: null, provides: "" };

/**
 * True for a source of a host the source registry blocks (spec D3.2), by the address that
 * answered it: under the credibility rules it never enters the pack. A record is classified by its
 * database and a page of the vendor's own site is the vendor's word, so neither is blocked.
 */
export function isBlockedEntry(entry: LedgerEntry<ResearchCategory>): boolean {
  if (entry.record !== undefined || entry.onVendorSite) return false;
  const url = entry.answeredUrl ?? entry.url;
  return classifySource({ url, onVendorSite: false }, ANY_VENDOR).blocked === true;
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
 * 3. The title is cut to MAX_TITLE_CHARS, and the content of a page to MAX_PAGE_CONTENT_CHARS and of a
 *    result to MAX_SNIPPET_CHARS. A publication date that is empty or longer than
 *    MAX_PUBLISHED_AT_CHARS becomes null.
 * 4. Until the serialized pack is at most MAX_EVIDENCE_BYTES, the last source of the category that
 *    holds the most bytes among those with two or more sources is removed; a tie goes to the later
 *    category. A category with one source keeps it. When every category is down to one source, the
 *    content of the largest source is cut instead, to the bytes the pack is over (the next largest
 *    if that is not enough). So a category that has sources always keeps one, and the summary cannot
 *    read a category the model never saw as "nothing found".
 * 5. The sources are numbered S1, S2, ... without gaps, after the trimming. Step 4 measured them
 *    with the id of S1 to S9, so the numbered pack is measured once more, and if the longer ids
 *    of S10 and up made it too big, step 4 goes on.
 *
 * The kind and the vendor's mark (`onVendorSite`) are the session's, as they are: whether a page is
 * the vendor's own was decided on the URL that answered. With `dropBlocked` (the credibility
 * rules), a source of a blocked host is dropped before step 1 (`isBlockedEntry`).
 */
export function buildEvidencePack(
  entries: LedgerEntry<ResearchCategory>[],
  options: { dropBlocked?: boolean } = {},
): EvidenceSource[] {
  const seenUrls = new Set<string>();
  // Category by category, so that the first entry of a URL wins in the order of the categories.
  const groups = RESEARCH_CATEGORIES.map((category) => {
    const sized: SizedSource[] = [];
    for (const entry of entries) {
      if (entry.category !== category) continue;
      if (options.dropBlocked === true && isBlockedEntry(entry)) continue;
      if (!isUsableUrl(entry.url) || seenUrls.has(entry.url)) continue;
      seenUrls.add(entry.url);
      const maxContentChars = entry.kind === "page" ? MAX_PAGE_CONTENT_CHARS : MAX_SNIPPET_CHARS;
      const source = {
        category: entry.category,
        kind: entry.kind,
        onVendorSite: entry.onVendorSite,
        url: entry.url,
        title: cutAtCodePoint(cleanText(entry.title), MAX_TITLE_CHARS),
        content: cutAtCodePoint(cleanText(entry.content), maxContentChars),
        publishedAt: cleanPublishedAt(entry.publishedAt),
      };
      sized.push(sizeOf(source));
    }
    return sized;
  });

  // Each step removes a source or shortens one, and an empty pack is "[]", two bytes: both loops end.
  let excess = packBytes(groups) - MAX_EVIDENCE_BYTES;
  while (excess > 0) {
    trimLargest(groups, excess);
    excess = packBytes(groups) - MAX_EVIDENCE_BYTES;
  }

  let pack = numbered(groups);
  excess = serializedBytes(pack) - MAX_EVIDENCE_BYTES;
  while (excess > 0) {
    trimLargest(groups, excess);
    pack = numbered(groups);
    excess = serializedBytes(pack) - MAX_EVIDENCE_BYTES;
  }
  return pack;
}

/**
 * Where a source came from, beside what the pack shows of it: the database of a record, the
 * address on another site that a page claims as its own, whether the database still stands by the
 * record, what the vendor risk database knows of a record it offered, and the address a page
 * answered from. The credibility of a finding reads it (see credibility.ts); the model never does.
 */
export interface SourceProvenance {
  record?: RecordSourceId;
  canonicalUrl?: string;
  /** Absent means active; a record of the vendor risk database gives its own in `vrdb`. */
  status?: RecordStatus;
  vrdb?: VrdbRecordMeta;
  answeredUrl?: string;
}

const isRecordSourceId = (value: string): value is RecordSourceId =>
  (RECORD_SOURCE_IDS as readonly string[]).includes(value);

/**
 * The provenance of the ledger's sources, by address: the key is the address the ledger kept for
 * the entry, which is the address the pack shows (see `buildEvidencePack`). A record id that is
 * not one of a database is left out, and an entry with none of a record, a canonical address, a
 * VRDB record and an answering address adds nothing. When two entries share an address, the first
 * in the ledger's order wins.
 */
export function provenanceOf(
  entries: readonly LedgerEntry<ResearchCategory>[],
): ReadonlyMap<string, SourceProvenance> {
  const provenance = new Map<string, SourceProvenance>();
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    const found: SourceProvenance = {
      ...(entry.record !== undefined && isRecordSourceId(entry.record)
        ? { record: entry.record }
        : {}),
      ...(entry.canonicalUrl === undefined ? {} : { canonicalUrl: entry.canonicalUrl }),
      ...(entry.vrdb === undefined ? {} : { vrdb: entry.vrdb }),
      ...(entry.answeredUrl === undefined ? {} : { answeredUrl: entry.answeredUrl }),
    };
    if (Object.keys(found).length > 0) provenance.set(entry.url, found);
  }
  return provenance;
}
