/**
 * The field safety notice lists of the UK Medicines and Healthcare products Regulatory Agency
 * (MHRA) as a mirrored list of the vendor risk database. Every week the MHRA publishes a page that
 * lists the field safety notices that the manufacturers of medical devices sent about their
 * devices: a field safety notice is the manufacturer's own corrective action, never a finding of
 * fault. The lists have no file of their own. The GOV.UK Search API gives every weekly list with
 * the text of its page (`indexable_content`) in one answer (624 lists, 1.9 MB today), and the pager
 * that the GOV.UK lists share asks the pages (at most three) and proves that they are one search
 * (`govukSearchPages`, `govukRowsOf`: kit-level checks of `total`, `start` and the distinct links).
 * This file reads the entries out of the text of the lists.
 *
 * The record unit is the MANUFACTURER. An entry of a list is a heading `Manufacturer: product`, a
 * date, a model line, a description and an `MHRA reference:` line, and the manufacturer is free
 * text, so the match is by the NAME alone (weak) and a shape that is not known gives NO entry and
 * never a wrong name. A record is the distinct notices of one manufacturer
 * (`compactName(shortName(manufacturer))`, so that `Example Inc` and `Example Ltd` are one
 * manufacturer; `Example` and `Example Medical` are two) over all the weekly lists, with their
 * count by year of listing and the newest three. It says that the lists hold notices that name the
 * manufacturer, that a notice is the manufacturer's own corrective action, and that a count grows
 * with the number of devices a maker sells: nothing in a record says that a vendor did anything
 * wrong.
 *
 * Persons. No rule tells a natural person apart here, and none drops one: the lists name the
 * manufacturers of medical devices, which are companies (a field safety notice is a manufacturer's
 * own corrective action), and a rule of honorifics would only flag a company that is named after a
 * person. The name is a key only once its legal form is off and with four letters and digits at the
 * least.
 *
 * What is read. Of a list: its `link`, its `title` (only for the years in it), its `issued_date`
 * and its `indexable_content`. Nothing else is read or kept: not the
 * overview and the date, model, batch, lot, serial and description lines of an entry, not the
 * documents that the lists link to (the manufacturers' own notices, third-party text), not the
 * `description`, `medical_specialism` or `alert_type` of the result. Only the manufacturer, the
 * product as listed, the normalised reference (the first 40 characters of one that has no known
 * form), the day of the list and the path of the list reach the body.
 *
 * How an entry is read (`mhraEntriesOf`). The text is split into blocks at every blank line. A
 * block that begins with `MHRA reference`, in any case, and goes on with a colon, a blank or
 * nothing (never a letter: `MHRA references for this week` is prose) is the reference line of an
 * entry; the blocks since the previous reference line are its segment, and its heading is the
 * first block of the segment that has a colon within its first 80 characters, followed by a blank
 * and a character, and does not begin with the word of a model line (Model, Ref, Description,
 * Batch, Serial, Lot, Catalogue, Part, Product code, Software). The manufacturer is what is before the colon, and the
 * product is the rest of the line after it (the line that follows when the colon ends its line; the
 * other lines of a block are never read, so that no model or date line can reach the product). The
 * reference is the slash form `YYYY/MMM/DDD/NNN/NNN` of the reference line, else the first number
 * of seven or eight digits, else the text of the line without blanks, in lower case, whole (a line
 * is read to 300 characters: `mhraReferenceOf`). When the line has no value it is on the next
 * block, but only when that block holds a reference of the slash form or a number, and is neither a
 * heading nor a reference line: the heading of the next entry is never the reference of this one.
 * An entry that has no heading (an attached letter that repeats a reference) gives no row, and it
 * is no failure.
 *
 * What is refused. A manufacturer that is empty, longer than 120 characters once folded, ends in
 * the mark of a cut or holds `<` or `>` (a name that does not fit is left out and never used cut:
 * it is a key), a product that nothing is left of, a reference of more than 300 characters, one
 * that ends in the mark of a cut, or none, and a manufacturer with fewer than four letters and
 * digits left once its legal form is taken off (`XQ`: no key can be matched to it) give no row, and
 * are not counted. A list that holds more than
 * 1,000 reference lines, whose text is longer than 100,000 characters (it is never cut: a list read
 * in part would pass for the whole), whose text is not text or whose path is not a page of the drug
 * and device alerts is UNREADABLE: it is counted (kit allowance) and none of its entries is read.
 *
 * Notices and days. A notice is a manufacturer and a reference, once, whatever the number of lists
 * that name it (266 references repeat today): the newest listing of it is kept, and a tie goes to
 * the smaller path (inside one list, to the first entry). A reference of no known form tells the
 * notice by its whole text, so that two texts that share their first 40 characters are two notices;
 * a record and the body show the first 40 characters of it, with no mark of a cut, as they
 * always did (15 of the 8,010 real references have no known form, and none has 40 characters).
 * The day of a list is its `issued_date`, but only when the title of the list has no year of the
 * 2000s or the year of the issued date is one of the title's years or one more (a December week
 * issued in January): the date is typed by hand and seven lists fail the check today. The notices
 * of such a list count, but they are in no year, are never the newest and are shown after the dated
 * ones, as listed with no date (`mhraListDateOf`). The clock is never read, so that the same lists
 * give the same records on any day. The version of the list is the newest day of its lists.
 *
 * What the reader counts. `total` is the lists read, and never fewer than the manufacturers and the
 * lists that could not be read (a list names many manufacturers: 624 lists, about 2,000
 * manufacturers today). More than 20,000 manufacturers, or more than 50,000 notices, is not this
 * list. The API sends no validator, so every sync downloads the lists, and the hash of the body
 * (manufacturers sorted, notices newest first) tells whether anything changed.
 */
import { shortName } from "../../identity";
import { compactName } from "../../records/match";
import { sentence } from "../../records/sentence";
import { cutAtCodePoint } from "../../text";
import type { ParsedRecord } from "../types";
import { GOVUK_PIN, GOVUK_SITE, govukRowsOf, govukSearchPages } from "./govukSearch";
import { compareText, dayText, lineOf, lineWithin } from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import { type Sleep, realSleep } from "./kit/pause";
import { RECORD_SUMMARY_MAX, UnreadableEntry, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const UK_MHRA_RECORD_MARK = "UK MHRA field safety notice lists";

/**
 * The search of the field safety notice lists, newest first: the page is asked at `start`, which
 * is in the middle of the address.
 */
const SEARCH_START =
  "https://www.gov.uk/api/search.json?filter_format=medical_safety_alert&filter_alert_type=field-safety-notices&count=1000&start=";
const SEARCH_END =
  "&order=-public_timestamp&fields[]=title&fields[]=link&fields[]=issued_date&fields[]=public_timestamp&fields[]=indexable_content";
const PAGE_SIZE = 1_000;
/** One page today (624 lists); a search that needs more than three is not the list this was built for. */
const MAX_PAGES = 3;
const MAX_BYTES = 16_777_216;
const TOTAL_TIMEOUT_MS = 60_000;

/** Where the page of a weekly list is: the link must be under it, and have a slug. */
const LIST_PATH = "/drug-device-alerts/";
const LINK_MAX = 300;
/** What an address of a page may not hold: white space, controls, hidden characters, lone surrogates. */
const UNSAFE_LINK = /[\s\p{Cc}\p{Cf}\u{D800}-\u{DFFF}]/u;

/**
 * The longest text of a list that is read: the longest real one has 6,352. A longer text is no
 * weekly list: it is refused whole (the list is unreadable), and never cut.
 */
const TEXT_MAX = 100_000;
/** The most reference lines of one list: the longest real list has 39 entries. */
const MAX_ANCHORS = 1_000;
/** The words that a reference line begins with, in lower case. */
const ANCHOR = "mhra reference";
/** The heading of an entry: a colon within the first 80 characters, then a blank and a character. */
const HEADING = /^[^:\n]{1,80}:\s+\S/u;
/** The first words of the lines of an entry that are no heading. */
const NOT_A_HEADING =
  /^(?:Model|Ref|Description|Batch|Serial|Lot|Catalogue|Part|Product code|Software)\b/i;
/** What the label of a reference line is, with the colon that may follow it. */
const ANCHOR_LABEL = /^\s*:?/;

const MANUFACTURER_MAX = 120;
const PRODUCT_MAX = 80;
/** The longest text of a reference line that is read; a longer one is no reference. */
const REFERENCE_LINE_MAX = 300;
/**
 * The most that a record and the body show of a reference of no known form, which is the whole
 * text of the line: it is cut here and nowhere before, so that it still tells two notices apart.
 */
const REFERENCE_TEXT_MAX = 40;
const SLASH_REFERENCE = /\d{4}\/\d{3}\/\d{3}\/\d{3}\/\d{3}/;
const NUMBER_REFERENCE = /(?<!\d)\d{7,8}(?!\d)/;
/** A year of the 2000s in a title, as a word of its own. */
const TITLE_YEAR = /\b20\d\d\b/g;
const TITLE_MAX = 300;

/** The most manufacturers and the most notices of a list that is this list. */
const MAX_MANUFACTURERS = 20_000;
const MAX_NOTICES = 50_000;
/** The longest key of a manufacturer: the id of its record. */
const KEY_MAX = 120;
/** The fewest letters and digits of a manufacturer, legal form off, that a vendor could be matched by. */
const MIN_KEY_CHARS = 4;
const DISPLAY_MAX = MANUFACTURER_MAX;
const SPELLINGS_MAX = 10;
const ITEMS_SHOWN = 3;
const YEARS_SHOWN = 5;

/** The text of a record's first sentence: the list, the host, and the class that the prompt gives it. */
const FIRST = `${UK_MHRA_RECORD_MARK} (gov.uk), a product safety list.`;
/** What a notice is and is not: never cut, and never says that the manufacturer did anything. */
const WHAT_A_NOTICE_IS =
  "The MHRA's weekly lists name the manufacturers that sent field safety notices about their medical devices; a notice is the manufacturer's own corrective action, not a finding of fault, and counts grow with the number of devices a maker sells.";
const CLOSING =
  "Adapted by VerifyWise from GOV.UK under the Open Government Licence v3.0; the notices themselves are not copied.";

/** One entry of a weekly list: what is kept of it. */
export interface MhraEntry {
  /** The text before the colon of the heading, as one clean line of at most 120 characters. */
  manufacturer: string;
  /** The text after the colon, as one clean line of at most 80 characters. */
  product: string;
  /** The reference, normalised (see `mhraReferenceOf`): whole, whatever its form. */
  reference: string;
}

/** One of the newest notices of a manufacturer. */
interface MhraItem {
  product: string;
  /** The reference as a record shows it: at most REFERENCE_TEXT_MAX units when it has no known form. */
  reference: string;
  /** The day of the list that names it, or null when the list's day is unclear. */
  listed: string | null;
  /** The path of that list. */
  link: string;
}

/** One manufacturer of the lists, with its notices: what the reader makes and the body holds. */
interface MhraRow {
  /** `compactName(shortName(manufacturer))`, at most KEY_MAX units: the id of the record. */
  key: string;
  /** The most frequent spelling of the manufacturer (the first of the spellings). */
  displayName: string;
  /** The spellings, most frequent first and then by text, at most ten: the names that a vendor may match. */
  spellings: string[];
  /** The distinct notices. */
  count: number;
  /** The oldest year of a dated notice, or null when none is dated. */
  firstYear: number | null;
  /** The five newest years that have a dated notice, newest first, with their notices. */
  byYear: Array<[number, number]>;
  /** The newest three notices, newest first, those of a list with no clear day last. */
  items: MhraItem[];
  /** The day of the newest dated notice, or null. */
  newest: string | null;
}

/** A notice as the newest list that names it gives it. */
interface Notice extends MhraItem {
  /** The manufacturer as that entry writes it. */
  manufacturer: string;
}

/**
 * The blocks of a text: what lies between two blank lines (a line of nothing but white space is
 * blank), each trimmed, none empty. Linear in the length of the text, whatever it holds.
 */
function blocksOf(text: string): string[] {
  const blocks: string[] = [];
  let start = -1;
  let end = 0;
  let at = 0;
  for (;;) {
    const newline = text.indexOf("\n", at);
    const stop = newline === -1 ? text.length : newline;
    if (text.slice(at, stop).trim() === "") {
      if (start !== -1) {
        blocks.push(text.slice(start, end).trim());
        start = -1;
      }
    } else {
      if (start === -1) start = at;
      end = stop;
    }
    if (newline === -1) break;
    at = newline + 1;
  }
  if (start !== -1) blocks.push(text.slice(start, end).trim());
  return blocks;
}

/**
 * Whether a block is the reference line of an entry: it begins with the words, in any case, and
 * goes on with a colon, a blank or nothing, never a letter or any other character (a block of prose
 * that begins `MHRA references for this week` is no reference line).
 */
function isAnchor(block: string): boolean {
  if (block.length < ANCHOR.length || block.slice(0, ANCHOR.length).toLowerCase() !== ANCHOR) {
    return false;
  }
  const next = block.charAt(ANCHOR.length);
  return next === "" || next === ":" || /\s/u.test(next);
}

/** Whether a block is the heading of an entry: see HEADING and NOT_A_HEADING. */
const isHeading = (block: string): boolean => HEADING.test(block) && !NOT_A_HEADING.test(block);

/** The first block of `blocks[from, to)` that is the heading of an entry, or null. */
function headingOf(blocks: readonly string[], from: number, to: number): string | null {
  for (let at = from; at < to; at += 1) {
    if (isHeading(blocks[at])) return blocks[at];
  }
  return null;
}

/** What a reference line says: the reference, and whether it has a known form (slash form, number). */
interface Reading {
  reference: string;
  form: boolean;
}

/** The reading of the text of a reference line (see `mhraReferenceOf`), or null: no reference. */
function readingOf(tail: string): Reading | null {
  // `lineWithin`, not a cut and a compare: a line that does not fit is no reference, and a cut of it
  // that has 300 units or fewer (a blank or a pair of surrogates at the cut) is not a whole line.
  const line = lineWithin(tail, REFERENCE_LINE_MAX);
  if (line === null) return null;
  const found = SLASH_REFERENCE.exec(line) ?? NUMBER_REFERENCE.exec(line);
  if (found !== null) return { reference: found[0], form: true };
  // The whole text, whatever its length (at most that of the line): the notice is told by it.
  return { reference: line.replace(/ /g, "").toLowerCase(), form: false };
}

/**
 * The reading of the block that follows a reference line that has no value, or null. The block is
 * the value only when it holds a reference of a known form (the slash form or a number of seven or
 * eight digits) and is neither a reference line nor a heading: the heading of the next entry is never
 * the reference of this one, whatever it holds.
 */
function readingOnNextBlock(blocks: readonly string[], at: number): Reading | null {
  if (at + 1 >= blocks.length) return null;
  const next = blocks[at + 1];
  if (isAnchor(next) || isHeading(next)) return null;
  const reading = readingOf(next);
  return reading !== null && reading.form ? reading : null;
}

/**
 * The reference of an entry, from the text of its reference line without the label: the first
 * slash form (`2026/010/009/601/195`), else the first number of seven or eight digits, else the
 * text without blanks, in lower case, whole. The text is read as one clean line (`lineOf`), so
 * that a no-break space, a hidden character or a full-width digit changes nothing. Null when the
 * line holds nothing, is longer than 300 characters, or ends in the mark of a cut: such a line is no
 * reference. Pure, and bounded: no pattern is tried on a line of more than 300 characters.
 */
export function mhraReferenceOf(tail: string): string | null {
  return readingOf(tail)?.reference ?? null;
}

/**
 * The entry of a heading and a reference: the manufacturer before the first colon, the product on
 * the line after it. Null when the manufacturer is empty, longer than MANUFACTURER_MAX once folded,
 * ends in the mark of a cut, or holds `<` or `>` (a name is no markup), or when nothing is left of
 * the product.
 */
function entryOf(heading: string, reference: string): MhraEntry | null {
  const colon = heading.indexOf(":");
  // `lineWithin`: a name that does not fit is left out, and never used cut, for it is a key.
  const manufacturer = lineWithin(heading.slice(0, colon), MANUFACTURER_MAX);
  if (manufacturer === null || /[<>]/.test(manufacturer)) return null;
  // The product is the line that the colon opens (the next one when the colon ends its line); the
  // other lines of the block are the date, the model and the like, which are never kept.
  const after = heading.slice(colon + 1).trimStart();
  const lineEnd = after.indexOf("\n");
  const product = lineOf(lineEnd === -1 ? after : after.slice(0, lineEnd), PRODUCT_MAX);
  return product === "" ? null : { manufacturer, product, reference };
}

/**
 * The entries of the text of a weekly list, in the order of the text; null when the text is longer
 * than TEXT_MAX characters or the list holds more than MAX_ANCHORS reference lines (it is no weekly
 * list, and it is refused whole: a list read in part would pass for the whole). A reference line
 * without a heading before it, or with no reference, or whose heading names no manufacturer that can
 * be kept (`entryOf`), gives no entry. Pure, and linear in the length of the text.
 */
export function mhraEntriesOf(text: string): MhraEntry[] | null {
  if (text.length > TEXT_MAX) return null;
  const blocks = blocksOf(text);

  const entries: MhraEntry[] = [];
  let anchors = 0;
  let segment = 0;
  for (let at = 0; at < blocks.length; at += 1) {
    const block = blocks[at];
    if (!isAnchor(block)) continue;
    anchors += 1;
    if (anchors > MAX_ANCHORS) return null;

    const heading = headingOf(blocks, segment, at);
    segment = at + 1;
    if (heading === null) continue;

    const own = block.slice(ANCHOR.length).replace(ANCHOR_LABEL, "");
    // The value is on the next block when the line has none, and only a reference of a known form is
    // taken from there.
    const reading = own.trim() === "" ? readingOnNextBlock(blocks, at) : readingOf(own);
    if (reading === null) continue;

    const entry = entryOf(heading, reading.reference);
    if (entry !== null) entries.push(entry);
  }
  return entries;
}

/**
 * The day of a weekly list (YYYY-MM-DD), or null when it is unclear. It is the `issued_date`
 * (`dayText`) when the title has no year of the 2000s, or when the year of the day is one of the
 * title's years or one more (a December week that is issued in January). The title is read as one
 * clean line, to 300 characters. A title that is no text gives null, and so does a day that is not
 * one. Pure; the clock is never read.
 */
export function mhraListDateOf(issued: unknown, title: unknown): string | null {
  if (typeof title !== "string") return null;
  const day = dayText(issued);
  if (day === null) return null;
  const years = [...lineOf(title, TITLE_MAX).matchAll(TITLE_YEAR)].map((found) => Number(found[0]));
  if (years.length === 0) return day;
  const year = Number(day.slice(0, 4));
  return years.some((titled) => year === titled || year === titled + 1) ? day : null;
}

/** The path of a weekly list's page, or null when it is not under the alerts, has no slug, is too long or is not clean. */
function linkOf(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith(LIST_PATH) ||
    value.length === LIST_PATH.length ||
    value.length > LINK_MAX ||
    UNSAFE_LINK.test(value)
  ) {
    return null;
  }
  return value;
}

/** The key of a manufacturer, or null when no vendor could be matched to it (see MIN_KEY_CHARS). */
function keyOf(manufacturer: string): string | null {
  const compact = compactName(shortName(manufacturer));
  return compact.length < MIN_KEY_CHARS ? null : cutAtCodePoint(compact, KEY_MAX);
}

/**
 * The newest listing first: a list with a day before one with none, the later day first, then the
 * smaller path, then the smaller reference (two notices of one list). A total order, so that no
 * result depends on the order of the lists in the answer.
 */
function newestFirst(a: Notice, b: Notice): number {
  if (a.listed !== b.listed) {
    if (a.listed === null) return 1;
    if (b.listed === null) return -1;
    return compareText(b.listed, a.listed);
  }
  return compareText(a.link, b.link) || compareText(a.reference, b.reference);
}

/** The spellings of the notices, most frequent first and then by text, at most SPELLINGS_MAX. */
function spellingsOf(notices: readonly Notice[]): string[] {
  const counts = new Map<string, number>();
  for (const { manufacturer } of notices) {
    counts.set(manufacturer, (counts.get(manufacturer) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a, countA], [b, countB]) => countB - countA || compareText(a, b))
    .slice(0, SPELLINGS_MAX)
    .map(([spelling]) => spelling);
}

/** The manufacturer of a key, from its notices: independent of the order that the lists were read in. */
function rowOf(key: string, notices: readonly Notice[]): MhraRow {
  const sorted = [...notices].sort(newestFirst);
  const spellings = spellingsOf(sorted);
  const years = new Map<number, number>();
  for (const { listed } of sorted) {
    if (listed === null) continue;
    const year = Number(listed.slice(0, 4));
    years.set(year, (years.get(year) ?? 0) + 1);
  }
  const byYear = [...years].sort(([a], [b]) => b - a);
  return {
    key,
    displayName: spellings[0],
    spellings,
    count: sorted.length,
    firstYear: byYear.length === 0 ? null : byYear[byYear.length - 1][0],
    byYear: byYear.slice(0, YEARS_SHOWN),
    items: sorted.slice(0, ITEMS_SHOWN).map(({ product, reference, listed, link }) => ({
      product,
      // The whole text of a reference told the notices apart; a record shows its first 40 units.
      reference: cutAtCodePoint(reference, REFERENCE_TEXT_MAX),
      listed,
      link,
    })),
    newest: sorted[0].listed,
  };
}

/**
 * The manufacturers of the lists of the search, or null when it is not the list: pages that are not
 * one search (`govukRowsOf`), more than MAX_MANUFACTURERS manufacturers, or more than MAX_NOTICES
 * notices. A list that cannot be read is counted in `unreadable` and none of its entries is read; an
 * entry that gives no manufacturer is not counted. Pure and bounded.
 */
function readLists(fetched: Fetched): ReadResult<MhraRow> | null {
  const found = govukRowsOf(fetched, { pageSize: PAGE_SIZE });
  if (found === null) return null;

  // Each manufacturer's notices by reference: the newest listing of a notice is the one kept.
  const groups = new Map<string, Map<string, Notice>>();
  let notices = 0;
  let unreadable = 0;
  for (const result of found.rows) {
    const link = linkOf(result.link);
    const text = result.indexable_content;
    const entries = link !== null && typeof text === "string" ? mhraEntriesOf(text) : null;
    if (link === null || entries === null) {
      unreadable += 1;
      continue;
    }
    const listed = mhraListDateOf(result.issued_date, result.title);
    for (const { manufacturer, product, reference } of entries) {
      const key = keyOf(manufacturer);
      if (key === null) continue;
      let group = groups.get(key);
      if (group === undefined) {
        // More manufacturers than any real list is no list of this kind.
        if (groups.size >= MAX_MANUFACTURERS) return null;
        group = new Map();
        groups.set(key, group);
      }
      const notice: Notice = { manufacturer, product, reference, listed, link };
      const known = group.get(reference);
      if (known === undefined) {
        if (notices >= MAX_NOTICES) return null;
        notices += 1;
        group.set(reference, notice);
      } else if (newestFirst(notice, known) < 0) {
        // Another list has the notice, and this one is newer. Inside one list the two compare equal,
        // so that the first entry stays.
        group.set(reference, notice);
      }
    }
  }

  const rows = [...groups].map(([key, group]) => rowOf(key, [...group.values()]));
  return {
    rows,
    // The reader counts in lists, and a list names many manufacturers, so rows may outnumber them.
    total: Math.max(found.rows.length, rows.length + unreadable),
    unreadable,
    // The pager proved that the pages hold as many distinct links as the search says it has.
    complete: found.rows.length === found.total,
  };
}

/** A record is a manufacturer and the newest of its notices: the product, reference and day only. */
function toRecord(row: MhraRow): ParsedRecord {
  const [newest] = row.items;
  if (newest === undefined) throw new UnreadableEntry();
  const display = lineOf(row.displayName, DISPLAY_MAX);
  const counts =
    row.firstYear === null
      ? `Notices listed: ${row.count}.`
      : `Notices listed: ${row.count} since ${row.firstYear}; by year of listing: ${row.byYear
          .map(([year, count]) => `${year}: ${count}`)
          .join(", ")}.`;
  const shown = row.items
    .map(
      (item) =>
        `${lineOf(item.product, PRODUCT_MAX)} (listed ${item.listed ?? "date unclear"}, MHRA reference ${lineOf(item.reference, REFERENCE_TEXT_MAX)})`,
    )
    .join("; ");
  return recordOf({
    id: `mhra-fsn:${row.key}`,
    type: "field_safety_notice_summary",
    title: `MHRA field safety notices: ${display}`,
    summary: summaryWithClosing(
      [
        FIRST,
        WHAT_A_NOTICE_IS,
        sentence("Manufacturer as written", display),
        counts,
        `Newest: ${shown}.`,
      ],
      CLOSING,
      RECORD_SUMMARY_MAX,
    ),
    // The page of the list of the newest notice (a list that names several manufacturers is the page of each).
    url: `${GOVUK_SITE}${newest.link}`,
    identifiers: {
      manufacturer: display,
      notices: row.count,
      firstYear: row.firstYear,
      newest: row.newest,
    },
    names: row.spellings,
    publishedAt: row.newest,
  });
}

/**
 * The connector of the list. It makes one request for each page of the search, so it is built by a
 * factory that takes the pause between two pages (400 ms, as the host asks) and has the real one by
 * default: a test hands it a pause that does not wait.
 */
export function createUkMhraConnector({ sleep = realSleep }: { sleep?: Sleep } = {}): Connector {
  return createFileConnector<MhraRow>({
    id: "uk_mhra",
    version: 1,
    root: "search.json",
    sortKey: (row) => row.key,
    pin: GOVUK_PIN,
    // The API sends no validator, so there is no 304: every sync downloads the lists.
    fetchFiles: (fetch) =>
      govukSearchPages(fetch, (start) => `${SEARCH_START}${start}${SEARCH_END}`, {
        pageSize: PAGE_SIZE,
        maxPages: MAX_PAGES,
        maxBytes: MAX_BYTES,
        timeoutMs: TOTAL_TIMEOUT_MS,
        sleep,
      }),
    read: readLists,
    toRecords: (rows) => rows.map(toRecord),
    sourceVersion: (rows) =>
      rows.reduce<string | null>(
        (newest, { newest: day }) =>
          day !== null && (newest === null || day > newest) ? day : newest,
        null,
      ),
  });
}

export const ukMhraConnector: Connector = createUkMhraConnector();
