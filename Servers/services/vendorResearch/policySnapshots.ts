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
import { isSharedPlatformHost } from "./sharedHosts";
import { cleanText, cutAtCodePoint } from "./text";

export { POLICY_KINDS };
export type { PolicyKind, SnapshotWrite, StoredSnapshot };

/** The pages of this kind that one run keeps. */
export const MAX_POLICY_PAGES = 8;
/** The lines of a page that are kept and compared, and their characters in all. */
export const MAX_SNAPSHOT_LINES = 4000;
export const MAX_SNAPSHOT_CHARS = 100_000;
/** A longer line is kept as parts of at most this many characters (see `partsOf`). */
export const MAX_LINE_CHARS = 600;
/** Fewer characters than this in the lines that changed is not a change worth the model's time. */
export const MIN_CHANGED_CHARS = 40;
/** The lines of a change that the source shows, and the longest of them. */
export const MAX_CHANGE_CHARS = 6000;
export const MAX_CHANGE_LINE_CHARS = MAX_LINE_CHARS;
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
 * @param ownDomains The vendor's domain and the domains that are its website too. One that is
 *   exactly a host where many have pages (sharedHosts.ts) is left out: its pages are not the vendor's.
 */
export function collectPolicyPages(
  read: PageReader,
  ownDomains: readonly string[],
): PolicyCollector {
  const noted = new Map<string, PolicyPage>();
  // A host where many have pages (`github.com`) is no domain of the vendor's own, as the session
  // has it (webSession.ts): a stranger's page there that calls itself a privacy policy would
  // otherwise be kept as the vendor's terms, and a change of it reach the analysis as one.
  const owned = ownDomains.filter((own) => !isSharedPlatformHost(own));

  const note = (page: FetchedPage): void => {
    if (page.text.trim() === "") return;
    let host: string;
    try {
      host = new URL(page.url).hostname;
    } catch {
      return;
    }
    if (!owned.some((own) => isOnDomain(host, own))) return;
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

/** What each part of a long line after its first begins with, in the kept body and in a change. */
export const CONTINUED_MARK = "\u2026 ";

/**
 * The parts of one squeezed line, each of at most MAX_LINE_CHARS characters: a long line is split,
 * at a blank in the second half of a part where there is one, and every part after the first
 * begins with CONTINUED_MARK. Nothing of the line is lost, so a change anywhere in a long clause is
 * a change of one of its parts. A part is no longer than the limit, so a kept body read again
 * splits nothing.
 */
function partsOf(line: string): string[] {
  if (line.length <= MAX_LINE_CHARS) return [line];
  const parts: string[] = [];
  let rest = line;
  let room = MAX_LINE_CHARS;
  while (rest !== "") {
    let part = cutAtCodePoint(rest, room);
    if (part.length < rest.length) {
      const blank = part.lastIndexOf(" ");
      if (blank > room / 2) part = part.slice(0, blank);
    }
    rest = rest.slice(part.length).trimStart();
    const kept = part.trimEnd();
    parts.push(parts.length === 0 ? kept : `${CONTINUED_MARK}${kept}`);
    room = MAX_LINE_CHARS - CONTINUED_MARK.length;
  }
  return parts;
}

/**
 * The lines of a body kept before long lines were split: a long line was cut at MAX_LINE_CHARS and
 * the rest of it dropped (and, before the second trim, the cut could end in a space).
 */
const cutAsBefore = (line: string): string[] => [cutAtCodePoint(line, MAX_LINE_CHARS).trimEnd()];

/**
 * The squeezed lines of a text, each made into lines by `split`, without the lines that have no
 * letter and no digit, and, when `bounded`, no more lines and characters than the limits say.
 * `cut` is true when the limits left a line out.
 */
function squeezedLines(
  text: string,
  split: (line: string) => string[],
  bounded: boolean,
): { lines: string[]; cut: boolean } {
  const lines: string[] = [];
  let chars = 0;
  for (const raw of cleanText(text).split("\n")) {
    for (const line of split(raw.replace(/\s+/g, " ").trim())) {
      if (!HAS_LETTER_OR_DIGIT.test(line)) continue;
      if (
        bounded &&
        (lines.length >= MAX_SNAPSHOT_LINES || chars + line.length + 1 > MAX_SNAPSHOT_CHARS)
      ) {
        return { lines, cut: true };
      }
      lines.push(line);
      chars += line.length + 1;
    }
  }
  return { lines, cut: false };
}

/**
 * The lines of a page text, as they are kept and compared: the white space squeezed and trimmed,
 * a line with no letter and no digit left out, a long line split into parts (`partsOf`), and no
 * more lines and characters than the limits say. The text is cleaned of what Postgres refuses
 * first. The lines of a kept body are its lines again: `linesOf(linesOf(text).join("\n"))` is
 * `linesOf(text)`.
 */
export function linesOf(text: string): string[] {
  return squeezedLines(text, partsOf, true).lines;
}

/**
 * The hash of the lines of a page, `cut` when the limits left a line of the page out. The input
 * begins with a mark of the way the lines are made, and of whether they were cut, so that the hash
 * of a body kept before long lines were split (the plain SHA-256 of its body) is never the hash of
 * a body kept now, and the hash tells whether a body kept now stops where the limits cut the page:
 * that is how `comparePages` tells them apart.
 */
const HASH_FORMAT = "policy-snapshot 2\n";
const HASH_FORMAT_CUT = "policy-snapshot 2 cut\n";
export const hashOf = (lines: readonly string[], cut = false): string =>
  createHash("sha256")
    .update((cut ? HASH_FORMAT_CUT : HASH_FORMAT) + lines.join("\n"))
    .digest("hex");

/** The body was kept before long lines were split: its hash is the plain hash of its text. */
const keptAsBefore = (kept: StoredSnapshot): boolean =>
  kept.hash === createHash("sha256").update(kept.body).digest("hex");

/**
 * The lines of a body kept before long lines were split may stop where the limits cut the page:
 * its hash does not say, so one that could not have held one more line of the longest kind is
 * taken as cut. A body kept now says it in its hash (`hashOf`). The count is the one the old code
 * made, of the body as it is stored: each of its lines and a line feed. Read back, a line that the
 * old code cut where a space is loses that space (`cutAsBefore`), so the lines read back would
 * count fewer characters than the old code did, and a body it cut could pass for a whole one.
 */
function mayHaveBeenCut(body: string): boolean {
  const lines = body.split("\n").length;
  return lines >= MAX_SNAPSHOT_LINES || body.length + 1 + MAX_LINE_CHARS + 1 > MAX_SNAPSHOT_CHARS;
}

export interface PageChange {
  /** Lines that are in the page now and were not, in the order of the page. */
  added: string[];
  /** Lines that were in the page and are not, in the order they were in. */
  removed: string[];
  /**
   * The indexes in `added` of the lines that continue the line before them in `added`: the next
   * part of the same long clause, right after it on the page, cut from it where a blank was
   * (`joinsAtBlank`). Left out when there is none.
   */
  addedJoined?: number[];
  /** The same for `removed`, on the page as it was. */
  removedJoined?: number[];
}

const comparable = (line: string): string => line.toLowerCase();

/** The line is only a date or a mark of the page: "Last updated: May 9, 2026", "© 2026 Acme". */
const STAMP = /^(?:last\s+)?(?:updated|revised|modified|effective|published)\b/i;
const COPYRIGHT = /^(?:©|\(c\)|copyright\b)/i;
const MAX_STAMP_CHARS = 80;
const isStamp = (line: string): boolean =>
  line.length <= MAX_STAMP_CHARS && (STAMP.test(line) || COPYRIGHT.test(line));

/**
 * True when `line`, the line right after `previous` on a page, is the next part of the same long
 * clause and `partsOf` cut the two apart where a blank was: the two then read as one stretch of
 * the page with one space between them. `partsOf` cuts a part before the last at a blank in the
 * second half of its room, which leaves it no longer than the room less one, or, when there is
 * no such blank, at the room: a part cut there may or may not have had a blank at the cut (a long
 * address, text with no blanks), so it is not joined. Of a page line that itself begins with the
 * continued mark, the kept lines cannot tell that it is not a part: one right after a line as long
 * as a part is joined to it.
 */
function joinsAtBlank(previous: string, line: string): boolean {
  if (!line.startsWith(CONTINUED_MARK)) return false;
  const continued = previous.startsWith(CONTINUED_MARK);
  const room = continued ? MAX_LINE_CHARS - CONTINUED_MARK.length : MAX_LINE_CHARS;
  const text = continued ? previous.slice(CONTINUED_MARK.length) : previous;
  if (text.length <= room / 2) return false;
  if (text.length < room - 1) return true;
  // One short of the room: cut at a blank there, or at the room before a pair of UTF-16 halves
  // (`cutAtCodePoint`). The second kind has no blank in the second half of its room, or it would
  // have been cut at that blank.
  return text.length === room - 1 && text.lastIndexOf(" ") > room / 2;
}

/**
 * The lines of `lines` that `other` does not hold, once each, without the stamps, and the indexes
 * among them of the lines that continue the one before them (`joinsAtBlank`): only when that one
 * is the line right before on the page, so that two lines of the result that were not next to
 * each other on the page are never read as one.
 */
function linesNotIn(
  lines: readonly string[],
  other: ReadonlySet<string>,
): { lines: string[]; joined: number[] } {
  const seen = new Set<string>();
  const result: string[] = [];
  const joined: number[] = [];
  let last = -2;
  lines.forEach((line, index) => {
    const key = comparable(line);
    if (other.has(key) || seen.has(key) || isStamp(line)) return;
    seen.add(key);
    if (last === index - 1 && joinsAtBlank(lines[last], line)) joined.push(result.length);
    result.push(line);
    last = index;
  });
  return { lines: result, joined };
}

/** What `diffLines` knows of the two versions besides their kept lines. */
export interface DiffContext {
  /**
   * Every line of the page as it reads now, past the limits too: a kept line that is still on the
   * page is not removed, though the limits left it out of the new lines.
   */
  stillThere?: readonly string[];
  /**
   * The kept lines stop where the limits cut the page (or may: `mayHaveBeenCut`). A new line of the
   * page may then have been on the page past the cut, and is taken as added only inside the window
   * that `keptWindowLength` proves new.
   */
  beforeMayBeCut?: boolean;
}

/** The line is a part of a long line after its first (`partsOf`). */
const isContinued = (line: string): boolean => line.startsWith(CONTINUED_MARK);

/**
 * The number of lines at the start of `page` that make the kept window, for kept lines that the
 * limits may have cut (`beforeMayBeCut`): a new line is reported as added only inside it.
 *
 * The rule states only what it can prove. The kept body K is the start of the old page O, cut where
 * the limits fell; what O held past the cut is not known, and any line past the cut may come right
 * after the kept lines once the lines before it are deleted. So the window ends at an anchor pair:
 * two lines of the page, next to each other, that are each in K once and on the page once, are
 * next to each other in K in the same order, and of which the second starts a line of the page
 * (it is not a later part of the line before: two parts of one line are one line of O, and a copy
 * of that line would bring both). The first of the two must come later in K than every line before
 * it on the page that is in K once and on the page once, so that a pair that moved up, or whose
 * copies stand out of order, never ends the window. The window ends at the second line of the last
 * such pair; with no pair it is empty, and nothing is reported as added.
 *
 * Why a new line before the pair is new. Say the pair (A, B) on the page is the copy of A and B in
 * K. An edit that inserts, deletes or replaces lines keeps the lines of O that it leaves in the
 * order of O, and every line of O before A is a line of K, since K is the start of O. A line before
 * A on the page that is not in K is then no line of O that the edit kept: the edit put it there,
 * and it is new (though its text may be that of a line past the cut). The pair is the copy in K
 * unless the edit deleted A and B from K and the page holds A and B, next to each other, from
 * somewhere else: from past the cut, where O held them again, or as copies the edit inserted. So
 * old text reads as added in three cases only. First, lines moved (a pure move or reordering: the
 * page then holds old text in a new place). Second, O held two lines of K again, next to each
 * other, past the cut, and the edit deleted them from K; the stored row and the page are then the
 * same as for those two lines moved down. Third, the edit inserted before the pair a copy of a line
 * that O held past the cut: the line is new to the edit, but its text is old, and K cannot tell it
 * from new text.
 * A single line that K and the page hold once is not enough: a kept line deleted (or moved down
 * past the cut) whose copy stands past the cut is such a line, and the old text before that copy
 * would read as added. Lines that K or the page repeat (table cells, "Back to top") never
 * make a pair, since the copy they stand for is not known.
 *
 * What it does not show (the price of never showing old text as added): a new line after the last
 * anchor pair. So a change in the lines after the last pair, in the clause the cut ends in, or in
 * the last kept line, shows what was removed and not the new wording; so does a change near the end
 * of a page whose last kept lines repeat. A page that did not change holds the kept lines in order,
 * nothing is new, and no line is reported. One pass over the kept lines and two over the page: the
 * time is linear in the lines of both.
 */
function keptWindowLength(before: readonly string[], page: readonly string[]): number {
  // How many times K holds each line, and where it holds it first.
  const inKept = new Map<string, number>();
  const placeOf = new Map<string, number>();
  before.forEach((line, index) => {
    const key = comparable(line);
    inKept.set(key, (inKept.get(key) ?? 0) + 1);
    if (!placeOf.has(key)) placeOf.set(key, index);
  });
  const onPage = new Map<string, number>();
  for (const line of page) {
    const key = comparable(line);
    if (inKept.has(key)) onPage.set(key, (onPage.get(key) ?? 0) + 1);
  }
  let length = 0;
  let highest = -1; // the latest place in K of the anchors seen so far on the page
  let previous = -1; // the place in K of the line before, when it is an anchor in order
  page.forEach((line, position) => {
    const key = comparable(line);
    if (inKept.get(key) !== 1 || onPage.get(key) !== 1) {
      previous = -1;
      return;
    }
    const place = placeOf.get(key) as number;
    if (previous >= 0 && place === previous + 1 && !isContinued(line)) length = position + 1;
    previous = place > highest ? place : -1;
    highest = Math.max(highest, place);
  });
  return length;
}

/**
 * What changed between two versions of a page, or null when nothing worth a look did: the lines
 * are compared as sets (a paragraph that moved, or changed case, is the same line), lines that only
 * stamp the page are left out, and a change of fewer than MIN_CHANGED_CHARS characters is none.
 * Nothing is said of the part of the page that only one of the versions kept (see `DiffContext`).
 */
export function diffLines(
  before: readonly string[],
  after: readonly string[],
  context: DiffContext = {},
): PageChange | null {
  const was = new Set(before.map(comparable));
  const is = new Set([...after, ...(context.stillThere ?? [])].map(comparable));
  let compared = after;
  // A page that holds none of the kept lines is not new as a whole for that: the kept lines may
  // have been deleted, and the page be old text that stood past the cut. With no anchor pair the
  // window is empty, and only what was removed is shown.
  if (context.beforeMayBeCut === true) {
    // `after` is the start of `stillThere`, cut the same way, so their indexes are the same.
    compared = after.slice(0, keptWindowLength(before, context.stillThere ?? after));
  }
  const added = linesNotIn(compared, was);
  const removed = linesNotIn(before, is);
  const changedChars = [...added.lines, ...removed.lines].reduce(
    (sum, line) => sum + line.length,
    0,
  );
  if (changedChars < MIN_CHANGED_CHARS) return null;
  return {
    added: added.lines,
    removed: removed.lines,
    ...(added.joined.length > 0 ? { addedJoined: added.joined } : {}),
    ...(removed.joined.length > 0 ? { removedJoined: removed.joined } : {}),
  };
}

/** What a line of a change that continues the line before it begins with, in place of a bullet. */
export const CONTINUATION_INDENT = "  ";

/**
 * The lines that fit in `budget` characters (each counted with its two-character bullet and line
 * feed), written as the change shows them: a bullet before each, except a line of `joined` whose
 * line before is shown whole, which is written in place of its bullet and continued mark with
 * CONTINUATION_INDENT. Once whitespace is squeezed, as the quote check does, the two lines then
 * read as the stretch of the page they are, with one space between them. A continued part whose
 * part before is not shown keeps its bullet and mark, so it never reads as part of another line.
 */
function takeLines(
  lines: readonly string[],
  budget: number,
  joined: readonly number[] = [],
): { shown: string[]; used: number } {
  const joins = new Set(joined);
  const shown: string[] = [];
  let used = 0;
  let previousWhole = false;
  for (const [index, line] of lines.entries()) {
    const cut = cutAtCodePoint(line, MAX_CHANGE_LINE_CHARS);
    if (shown.length > 0 && used + cut.length + 3 > budget) break;
    const whole = cut.length === line.length;
    const continues = index > 0 && joins.has(index) && previousWhole && whole;
    shown.push(
      continues ? `${CONTINUATION_INDENT}${cut.slice(CONTINUED_MARK.length)}` : `- ${cut}`,
    );
    used += cut.length + 3;
    previousWhole = whole;
  }
  return { shown, used };
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The text of the source that a change makes: what was added, then what was removed, bounded to
 * MAX_CHANGE_CHARS, with the number of lines that did not fit. When lines were removed too, the
 * added lines take at most ADDED_SHARE of the room, so that what was taken away is always shown.
 * Each line is a bullet, or, when it continues the line before it on the page, indented
 * (`takeLines`), so that the text holds the stretch of the page that the two make.
 */
export function describeChange(
  change: PageChange,
  input: { kind: PolicyKind; since: string; until: string },
): string {
  const addedRoom =
    change.removed.length === 0 ? MAX_CHANGE_CHARS : Math.floor(MAX_CHANGE_CHARS * ADDED_SHARE);
  const added = takeLines(change.added, addedRoom, change.addedJoined);
  const removed = takeLines(change.removed, MAX_CHANGE_CHARS - added.used, change.removedJoined);

  const parts = [
    `${CHANGE_MARK}: ${LABEL_OF_KIND[input.kind]} on the vendor's website changed between ${input.since} and ${input.until}.`,
  ];
  if (added.shown.length > 0) parts.push(`Added:\n${added.shown.join("\n")}`);
  if (removed.shown.length > 0) parts.push(`Removed:\n${removed.shown.join("\n")}`);
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

/** The address of the source that a change of the page at `pageUrl` to the text of `newHash` makes. */
const changeAddressOf = (pageUrl: string, newHash: string): string =>
  `${pageUrl.split("#")[0]}#changed-${newHash.slice(0, FRAGMENT_HASH_CHARS)}`;

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
  const url = changeAddressOf(page.url, newHash);
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
  /**
   * Every page that has text, to keep once the run has completed: those whose change the model was
   * shown and those that made no change (see `snapshotsToKeep`).
   */
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
    const { lines, cut } = squeezedLines(page.text, partsOf, true);
    if (lines.length === 0) continue;
    const hash = hashOf(lines, cut);
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
    // A body kept before long lines were split is compared as it was made: the new text is cut
    // the same way, so that the tail of a long line, which the old body never held, is no change.
    // The page is then kept anew, split, and the next run compares the whole of each line.
    const asBefore = keptAsBefore(kept);
    const split = asBefore ? cutAsBefore : partsOf;
    const before = squeezedLines(kept.body, split, true).lines;
    const after = asBefore ? squeezedLines(page.text, split, true).lines : lines;
    const change = diffLines(before, after, {
      stillThere: squeezedLines(page.text, split, false).lines,
      beforeMayBeCut: asBefore ? mayHaveBeenCut(kept.body) : kept.hash === hashOf(before, true),
    });
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

/**
 * The pages of a comparison to keep, once the run has completed: every page whose change the model
 * was shown, and every page that made no change. A page whose change is not in `shown` (the evidence
 * pack, which drops sources to stay under its limit), or is there with its text cut, is not kept:
 * the next run then compares it with the text kept before, and shows the change again. `withheld`
 * counts those pages.
 */
export function snapshotsToKeep(
  comparison: Pick<Comparison, "entries" | "writes">,
  shown: ReadonlyArray<{ url: string; content: string }>,
): { writes: SnapshotWrite[]; withheld: number } {
  const changes = new Map(comparison.entries.map((entry) => [entry.url, entry.content]));
  const shownWhole = new Set(
    shown
      .filter((source) => changes.has(source.url) && changes.get(source.url) === source.content)
      .map((source) => source.url),
  );
  const writes: SnapshotWrite[] = [];
  let withheld = 0;
  for (const write of comparison.writes) {
    const change = changeAddressOf(write.url, write.hash);
    if (changes.has(change) && !shownWhole.has(change)) {
      withheld += 1;
      continue;
    }
    writes.push(write);
  }
  return { writes, withheld };
}
