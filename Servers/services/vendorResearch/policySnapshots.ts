/**
 * The pages where a vendor states its terms, and what they say from one visit to the next.
 *
 * A vendor's terms, its privacy policy, its data processing addendum, its list of subprocessors and
 * its security page change without a press release: a clause that lets it train models on customer
 * data, a new subprocessor, a lost certification. A run reads these pages anyway (gather.ts), and
 * a page that has not changed since the last run says nothing new. So every completed run keeps the
 * text of the pages of this kind that it read (`vendor_research_snapshots`), and the next run
 * compares what it reads with what was kept. A page that changed becomes a source of its own: the
 * lines that were added and the lines that were removed, dated between the day the page was last
 * seen as it was and the day of the run, in the category that reads pages of that kind.
 *
 * Everything here is pure. The research collects the pages (researchAgent.ts), the pipeline reads
 * the kept texts and calls `comparePages`, and writes the new texts after the run has completed
 * (pipeline.ts), the way it writes the memory of the sources.
 *
 * The text is compared line by line, as a set: a paragraph that moved is not a change, a line that
 * only changed case is not a change, and neither is a line that only says when the page was
 * written. A change of fewer than MIN_CHANGED_CHARS characters is not a change either; the new
 * text is still kept as the page, so that it is not compared again. The comparison is linear in
 * the size of the pages, and the sizes are bounded, because the text is written by a third party.
 */
import { createHash } from "node:crypto";
import {
  POLICY_KINDS,
  type PolicyKind,
  ResearchCategory,
  type SnapshotWrite,
  type StoredSnapshot,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { isOnDomain } from "../webResearch/publicUrl";
import type { FetchedPage, PageReader } from "../webResearch/readPage";
import { sourceKey } from "../webResearch/urlCanon";
import type { LedgerEntry } from "../webResearch/webSession";
import { classifySitePage } from "./gather";
import { cleanText, cutAtCodePoint } from "./text";

export { POLICY_KINDS };
export type { PolicyKind, SnapshotWrite, StoredSnapshot };

/** The pages of this kind that one run keeps. */
export const MAX_POLICY_PAGES = 8;
/** The lines of a page that are kept and compared, and their characters in all. */
export const MAX_SNAPSHOT_LINES = 4000;
export const MAX_SNAPSHOT_CHARS = 100_000;
/** One line is cut to this many characters. */
export const MAX_LINE_CHARS = 600;
/** Fewer characters than this in the lines that changed is not a change worth the model's time. */
export const MIN_CHANGED_CHARS = 40;
/** The lines of a change that the source shows, and the longest of them. */
export const MAX_CHANGE_CHARS = 6000;
export const MAX_CHANGE_LINE_CHARS = 400;
/** What the text of a change source begins with; the prompt of the analysis names it. */
export const CHANGE_MARK = "Page change";

const MAX_TITLE_CHARS = 300;
const MAX_URL_CHARS = 2048;
/** How much of a title is looked at for the kind of a page: the title is a third party's. */
const TITLE_CHARS_LOOKED_AT = 200;
/** The share of the lines of a change that the added lines may take when lines were removed too. */
const ADDED_SHARE = 0.6;
const FRAGMENT_HASH_CHARS = 8;

/** The category in which a change of each kind is evidence: that of the pages gather.ts reads. */
const CATEGORY_OF_KIND: Record<PolicyKind, ResearchCategory> = {
  security: "certifications",
  subprocessors: "ai_specific",
  dpa: "ai_specific",
  privacy: "ai_specific",
  terms: "ai_specific",
};

/** How the text of a change names a page of each kind. */
const LABEL_OF_KIND: Record<PolicyKind, string> = {
  terms: "the terms",
  privacy: "the privacy policy",
  dpa: "the data processing addendum",
  subprocessors: "the list of subprocessors",
  security: "the security page",
};

const KIND_PATTERNS: ReadonlyArray<readonly [PolicyKind, RegExp]> = [
  ["subprocessors", /\bsub ?processors?\b/i],
  ["dpa", /\bdpa\b|\bdata processing\b/i],
  ["privacy", /\bprivacy\b/i],
  ["terms", /\bterms\b|\bmsa\b|\bmaster (?:subscription |services? )?agreement\b/i],
  ["security", /\bsecurity\b|\btrust\b/i],
];
/** A title says what a legal page is; it does not say that a page is the security statement. */
const KINDS_A_TITLE_MAY_NAME: ReadonlySet<PolicyKind> = new Set([
  "subprocessors",
  "dpa",
  "privacy",
  "terms",
]);

const wordsOfPath = (pathname: string): string => pathname.replace(/[^a-z0-9]+/gi, " ").trim();

/**
 * The kind of a page of the vendor's site, from the words of its address and, for a page whose
 * address does not say, from its title; null for any other page. A page that the routine work
 * would not read for a category (a blog post, a file, a page about pricing) is no policy page.
 */
export function policyKindOf(address: string, title: string): PolicyKind | null {
  let pathname: string;
  try {
    pathname = new URL(address).pathname;
  } catch {
    return null;
  }
  const looked = title.slice(0, TITLE_CHARS_LOOKED_AT);
  if (classifySitePage(address, looked) === null) return null;

  const words = wordsOfPath(pathname);
  for (const [kind, pattern] of KIND_PATTERNS) {
    if (pattern.test(words)) return kind;
  }
  for (const [kind, pattern] of KIND_PATTERNS) {
    if (KINDS_A_TITLE_MAY_NAME.has(kind) && pattern.test(looked)) return kind;
  }
  return null;
}

/** A page of the vendor's own site that states its terms, as the research read it. */
export interface PolicyPage {
  /** The address that answered, after redirects. */
  url: string;
  /** The identity of the document (`sourceKey` of urlCanon.ts). */
  key: string;
  kind: PolicyKind;
  title: string;
  /** The text of the whole page, as the page reader gave it. */
  text: string;
}

/** What the research notes of the pages it reads: see `collectPolicyPages`. */
export interface PolicyCollector {
  /** The reader to give the web session: it reads through the one it was made with. */
  read: PageReader;
  /** The pages noted so far, in the order their documents were first read. */
  pages: () => PolicyPage[];
}

/**
 * Wraps a page reader so that the pages of the vendor's own site that state its terms are noted as
 * they are read, with their whole text: the ledger of the session keeps an excerpt of a page, and a
 * change anywhere in a policy is a change. Whoever reads through it, the model or the routine work,
 * the page and the failure are passed on as they came; the note is made on the side and never stops
 * a read.
 *
 * A page counts as the vendor's own by the address that answered, the way the session counts it
 * (a page that redirected off the site is not, one that redirected into it is). A document read
 * twice is noted once, with the text of the latest read; an answer with no text never takes the
 * place of one that had some. Past MAX_POLICY_PAGES documents the later ones are not noted.
 *
 * @param ownDomains The vendor's domain and the domains that are its website too.
 */
export function collectPolicyPages(
  read: PageReader,
  ownDomains: readonly string[],
): PolicyCollector {
  const noted = new Map<string, PolicyPage>();

  const note = (page: FetchedPage): void => {
    if (page.text.trim() === "") return;
    let host: string;
    try {
      host = new URL(page.url).hostname;
    } catch {
      return;
    }
    if (!ownDomains.some((own) => isOnDomain(host, own))) return;
    const kind = policyKindOf(page.url, page.title);
    const key = sourceKey(page.url);
    if (kind === null || key === null) return;
    if (!noted.has(key) && noted.size >= MAX_POLICY_PAGES) return;
    noted.set(key, { url: page.url, key, kind, title: page.title, text: page.text });
  };

  return {
    read: async (url, signal) => {
      const page = await read(url, signal);
      try {
        note(page);
      } catch {
        // The note is not part of the read.
      }
      return page;
    },
    pages: () => [...noted.values()],
  };
}

const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * The lines of a page text, as they are kept and compared: the white space squeezed and trimmed,
 * a line with no letter and no digit left out, a long line cut, and no more lines and characters
 * than the limits say. The text is cleaned of what Postgres refuses first.
 */
export function linesOf(text: string): string[] {
  const lines: string[] = [];
  let chars = 0;
  for (const raw of cleanText(text).split("\n")) {
    const line = cutAtCodePoint(raw.replace(/\s+/g, " ").trim(), MAX_LINE_CHARS);
    if (!HAS_LETTER_OR_DIGIT.test(line)) continue;
    if (lines.length >= MAX_SNAPSHOT_LINES || chars + line.length + 1 > MAX_SNAPSHOT_CHARS) break;
    lines.push(line);
    chars += line.length + 1;
  }
  return lines;
}

export const hashOf = (lines: readonly string[]): string =>
  createHash("sha256").update(lines.join("\n")).digest("hex");

export interface PageChange {
  /** Lines that are in the page now and were not, in the order of the page. */
  added: string[];
  /** Lines that were in the page and are not, in the order they were in. */
  removed: string[];
}

const comparable = (line: string): string => line.toLowerCase();

/** The line is only a date or a mark of the page: "Last updated: May 9, 2026", "© 2026 Acme". */
const STAMP = /^(?:last\s+)?(?:updated|revised|modified|effective|published)\b/i;
const COPYRIGHT = /^(?:©|\(c\)|copyright\b)/i;
const MAX_STAMP_CHARS = 80;
const isStamp = (line: string): boolean =>
  line.length <= MAX_STAMP_CHARS && (STAMP.test(line) || COPYRIGHT.test(line));

/** The lines of `lines` that `other` does not hold, once each, without the stamps. */
function linesNotIn(lines: readonly string[], other: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const key = comparable(line);
    if (other.has(key) || seen.has(key) || isStamp(line)) continue;
    seen.add(key);
    result.push(line);
  }
  return result;
}

/**
 * What changed between two versions of a page, or null when nothing worth a look did: the lines
 * are compared as sets (a paragraph that moved, or changed case, is the same line), lines that only
 * stamp the page are left out, and a change of fewer than MIN_CHANGED_CHARS characters is none.
 */
export function diffLines(before: readonly string[], after: readonly string[]): PageChange | null {
  const was = new Set(before.map(comparable));
  const is = new Set(after.map(comparable));
  const added = linesNotIn(after, was);
  const removed = linesNotIn(before, is);
  const changedChars = [...added, ...removed].reduce((sum, line) => sum + line.length, 0);
  return changedChars < MIN_CHANGED_CHARS ? null : { added, removed };
}

/** The lines that fit in `budget` characters (each with its two-character bullet and line feed). */
function takeLines(lines: readonly string[], budget: number): { shown: string[]; used: number } {
  const shown: string[] = [];
  let used = 0;
  for (const line of lines) {
    const cut = cutAtCodePoint(line, MAX_CHANGE_LINE_CHARS);
    if (shown.length > 0 && used + cut.length + 3 > budget) break;
    shown.push(cut);
    used += cut.length + 3;
  }
  return { shown, used };
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The text of the source that a change makes: what was added, then what was removed, bounded to
 * MAX_CHANGE_CHARS, with the number of lines that did not fit. When lines were removed too, the
 * added lines take at most ADDED_SHARE of the room, so that what was taken away is always shown.
 */
export function describeChange(
  change: PageChange,
  input: { kind: PolicyKind; since: string; until: string },
): string {
  const addedRoom =
    change.removed.length === 0 ? MAX_CHANGE_CHARS : Math.floor(MAX_CHANGE_CHARS * ADDED_SHARE);
  const added = takeLines(change.added, addedRoom);
  const removed = takeLines(change.removed, MAX_CHANGE_CHARS - added.used);

  const parts = [
    `${CHANGE_MARK}: ${LABEL_OF_KIND[input.kind]} on the vendor's website changed between ${input.since} and ${input.until}.`,
  ];
  if (added.shown.length > 0)
    parts.push(`Added:\n${added.shown.map((line) => `- ${line}`).join("\n")}`);
  if (removed.shown.length > 0) {
    parts.push(`Removed:\n${removed.shown.map((line) => `- ${line}`).join("\n")}`);
  }
  const hiddenAdded = change.added.length - added.shown.length;
  const hiddenRemoved = change.removed.length - removed.shown.length;
  if (hiddenAdded > 0) {
    parts.push(
      `${plural(hiddenAdded, "more added line")} ${hiddenAdded === 1 ? "is" : "are"} not shown.`,
    );
  }
  if (hiddenRemoved > 0) {
    parts.push(
      `${plural(hiddenRemoved, "more removed line")} ${hiddenRemoved === 1 ? "is" : "are"} not shown.`,
    );
  }
  return parts.join("\n");
}

/**
 * The ledger entry of a change: a page of the vendor's own site, in the category that reads pages
 * of its kind, dated the day of the run. Its address is the page's with a fragment made of the
 * start of the hash of the new text, so that each change has an address of its own: the same change
 * is the same address (and the de-duplication knows a finding that cited it), and a later change
 * of the same page is another. Null when the address is too long to carry the fragment.
 */
export function changeEntryOf(
  page: PolicyPage,
  content: string,
  newHash: string,
  until: string,
): LedgerEntry<ResearchCategory> | null {
  const url = `${page.url.split("#")[0]}#changed-${newHash.slice(0, FRAGMENT_HASH_CHARS)}`;
  if (url.length > MAX_URL_CHARS) return null;
  const name = page.title.trim() === "" ? LABEL_OF_KIND[page.kind] : page.title.trim();
  return {
    category: CATEGORY_OF_KIND[page.kind],
    kind: "page",
    onVendorSite: true,
    url,
    title: `Change to ${name}`,
    content,
    publishedAt: until,
  };
}

export interface Comparison {
  /** The sources the changes make, in the order of the pages. */
  entries: LedgerEntry<ResearchCategory>[];
  /** Every page that has text, to keep once the run has completed. */
  writes: SnapshotWrite[];
  counts: {
    /** Pages seen for the first time: kept, and no change to report. */
    first: number;
    unchanged: number;
    changed: number;
    /** Pages whose text changed in nothing worth a look. */
    minor: number;
  };
}

const dayOf = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Compares the pages a run read with the ones kept. A page with no text is passed over, so that an
 * empty answer never replaces a page that was kept.
 */
export function comparePages(input: {
  pages: readonly PolicyPage[];
  stored: ReadonlyMap<string, StoredSnapshot>;
  now: Date;
}): Comparison {
  const result: Comparison = {
    entries: [],
    writes: [],
    counts: { first: 0, unchanged: 0, changed: 0, minor: 0 },
  };
  const until = dayOf(input.now);

  for (const page of input.pages) {
    const lines = linesOf(page.text);
    if (lines.length === 0) continue;
    const hash = hashOf(lines);
    result.writes.push({
      pageKey: page.key,
      url: cutAtCodePoint(page.url, MAX_URL_CHARS),
      kind: page.kind,
      title: cutAtCodePoint(cleanText(page.title), MAX_TITLE_CHARS),
      hash,
      body: lines.join("\n"),
    });

    const kept = input.stored.get(page.key);
    if (kept === undefined) {
      result.counts.first += 1;
      continue;
    }
    if (kept.hash === hash) {
      result.counts.unchanged += 1;
      continue;
    }
    const change = diffLines(linesOf(kept.body), lines);
    const entry =
      change === null
        ? null
        : changeEntryOf(
            page,
            describeChange(change, {
              kind: page.kind,
              since: dayOf(kept.lastSeenAt),
              until,
            }),
            hash,
            until,
          );
    if (entry === null) {
      result.counts.minor += 1;
      continue;
    }
    result.counts.changed += 1;
    result.entries.push(entry);
  }
  return result;
}
