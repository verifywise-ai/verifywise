/**
 * What the two flat-file lists of NHTSA share (nhtsaOdi.ts, the defect investigations; and
 * nhtsaRecalls.ts, the recall campaigns reported since 2010). Each is one static zip whose single entry
 * is a TAB-delimited text with no header row, 300 to 400 MB inflated (390.6 MB and 312.8 MB), which the
 * lists turn into one record per manufacturer or filer.
 *
 * The entry is NEVER held in memory. `streamFlatFile` asks for the zip with one conditional GET (the
 * kit's `pinnedFetch`: the answer, a 304 included, must come from the operator's directory), checks
 * the zip's directory (`checkZipDirectory`: exactly one entry, no Zip64), and streams the entry
 * (`streamZipEntry` of vrdb/zip.ts, then the kit's `LineSplitter`): the inflated bytes go through in
 * pieces of 64 KiB, and the list's reducer keeps only the small state it needs per investigation or
 * campaign, then per entity. What the read holds is the zip (at most 32 resp. 64 MiB), a few pieces, and
 * that state. The reducer's result becomes ONE small JSON (`envelopeOf`), which is what the kit's
 * `read` gets in `Fetched`, so that no work that grows with the file is ever done synchronously in
 * `read`: the inflating and the splitting are in `fetchFiles`, as a stream.
 *
 * The file is hostile input. Its size is capped twice by the kit (the size the directory declares,
 * before a byte is read; then the bytes counted against that size as they come), its lines are capped
 * (one more than the cap is a `BodyTooLargeError`, never a shorter list), a line is capped in bytes,
 * and the state a list keeps is capped by the list (more is `BodyTooLargeError` as well). What is
 * checked last (the size and the CRC-32 of the entry) is checked before anything is returned: the
 * lines that were given before are discarded by the caller when the read fails. A name is capped as
 * well (ENTITY_NAME_MAX): a name that does not fit once it is cleaned is never cut into an id or a
 * key, and the line that has it cannot be read (`nameCleaner`).
 *
 * Natural persons: the filers and manufacturers of both files are businesses (every name of the real
 * files was read: none is a person, and name-shape rules had no precision), so no person filter is
 * applied; a new name is a business unless proven otherwise. The text of a record never says that an
 * entry did anything wrong.
 */
import type { Validators } from "../../../webResearch/guardedFetch";
import { shortName } from "../../identity";
import { compactName } from "../../records/match";
import { sentence } from "../../records/sentence";
import { compactNamesOf } from "../keys";
import { ZipError, streamZipEntry } from "../zip";
import type { Pin } from "./kit/address";
import { compareText, dayText, isObject, lineOf, lineWithin, withoutAngles } from "./kit/clean";
import type { Fetched } from "./kit/fileConnector";
import { jsonOf } from "./kit/json";
import { pinnedFetch } from "./kit/paging";
import { LineSplitter, compactDayText } from "./kit/stream";
import { textOf } from "./kit/text";
import { BodyTooLargeError, type ConnectorFetch, NotTheListError } from "./types";

/** The page that documents NHTSA's flat files: a record's address is a query on it. */
export const NHTSA_DOCUMENTATION_URL = "https://www.nhtsa.gov/nhtsa-datasets-and-apis";

/** The host in the first sentence of every record (the operator's own, not the file host). */
export const NHTSA_SENTENCE_HOST = "nhtsa.gov";

/** The most lines of a flat file: 6.5 times the 154,460 and 4 times the 247,176 of today. */
export const FLAT_LINES_MAX = 1_000_000;

/**
 * The most bytes of one line. The real files have lines far shorter than this, and so are the widths
 * their layouts allow; a line past this is given as null and counted unreadable.
 */
export const FLAT_LINE_BYTES_MAX = 131_072;

/** The longest name of an entity, and the longest id: the compact key of such a name is shorter. */
export const ENTITY_NAME_MAX = 80;
export const ENTITY_ID_MAX = 160;

/** The most spellings of an entity that a record keeps, and the newest matters that it lists. */
export const SPELLINGS_MAX = 5;
export const NEWEST_SHOWN = 3;

/** The years a record counts by: the calendar year of the newest date of the file, and the three before. */
export const YEARS_SHOWN = 4;

/** Dates outside these years are no dates of a list (a sentinel such as 9999 must never become the anchor year). */
export const YEAR_FIRST = 1900;
export const YEAR_LAST = 2099;

/** The most bytes of the JSON that the download hands to the reader of a list. */
export const ENVELOPE_BYTES_MAX = 16 * 1024 * 1024;
/** The charset is said, so that a meta tag in a name could never make the decoder choose another. */
export const ENVELOPE_CONTENT_TYPE = "application/json; charset=utf-8";
const ENVELOPE_VERSION = 1;

/** The zip's directory is small: no zip of the list has more than a handful of entries. */
const ZIP_ENTRIES_MAX = 16;

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const END_BYTES = 22;
const CENTRAL_BYTES = 46;
const COMMENT_BYTES_MAX = 0xffff;
const MAX32 = 0xffffffff;
const ZIP64_EXTRA_ID = 0x0001;

/**
 * Refuses a zip that is not the one deflated entry of the list, in the one way that `streamZipEntry`
 * does not: it reads a Zip64 zip, and it skips folders, so a zip with a folder beside the file, or with
 * a Zip64 marker, would pass. The list is neither (the files are far below 4 GiB, and one entry is
 * all they hold), so the end record and the one central header are read here, from the bytes of the
 * zip in memory: exactly one entry on the only disk, no Zip64 locator before the end record, a
 * directory that is exactly that one header and lies before the end record (a Zip64 end record has
 * full fields, 0xFFFF and 0xFFFFFFFF, which the count and the bounds refuse), no size or offset of
 * the central header that is full, and no Zip64 extra field. The rest (the name, the method, the
 * encryption flag, the sizes, the CRC-32) is `streamZipEntry`'s. It throws `NotTheListError`, which
 * holds no part of the zip.
 */
export function checkZipDirectory(zip: Buffer): void {
  const tailStart = Math.max(0, zip.length - (END_BYTES + COMMENT_BYTES_MAX));
  let end = -1;
  for (let at = zip.length - END_BYTES; at >= tailStart; at -= 1) {
    if (
      zip.readUInt32LE(at) === END_SIGNATURE &&
      at + END_BYTES + zip.readUInt16LE(at + 20) === zip.length
    ) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new NotTheListError();

  const disk = zip.readUInt16LE(end + 4);
  const directoryDisk = zip.readUInt16LE(end + 6);
  const onDisk = zip.readUInt16LE(end + 8);
  const count = zip.readUInt16LE(end + 10);
  const length = zip.readUInt32LE(end + 12);
  const offset = zip.readUInt32LE(end + 16);
  if (disk !== 0 || directoryDisk !== 0 || onDisk !== count) throw new NotTheListError();
  if (end >= 20 && zip.readUInt32LE(end - 20) === ZIP64_LOCATOR_SIGNATURE) {
    throw new NotTheListError();
  }
  if (count !== 1 || length < CENTRAL_BYTES || offset + length > end) throw new NotTheListError();
  if (zip.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw new NotTheListError();

  const nameLength = zip.readUInt16LE(offset + 28);
  const extraLength = zip.readUInt16LE(offset + 30);
  const commentLength = zip.readUInt16LE(offset + 32);
  if (CENTRAL_BYTES + nameLength + extraLength + commentLength !== length) {
    throw new NotTheListError();
  }
  // The compressed size, the size and the offset of the local header: a full field is Zip64's.
  if (
    zip.readUInt32LE(offset + 20) === MAX32 ||
    zip.readUInt32LE(offset + 24) === MAX32 ||
    zip.readUInt32LE(offset + 42) === MAX32
  ) {
    throw new NotTheListError();
  }
  const extraEnd = offset + CENTRAL_BYTES + nameLength + extraLength;
  for (let at = offset + CENTRAL_BYTES + nameLength; at + 4 <= extraEnd;) {
    if (zip.readUInt16LE(at) === ZIP64_EXTRA_ID) throw new NotTheListError();
    at += 4 + zip.readUInt16LE(at + 2);
  }
}

/** The one file of a list: where it is, where it may come from, and what its entry is called. */
export interface FlatFile {
  url: string;
  /** Where the answer must come from after the redirects, a 304 included. */
  pin: Pin;
  /** The one entry of the zip, by its exact name. */
  entryName: string;
  contentTypes: readonly string[];
  timeoutMs: number;
}

/** The limits of a download; a list has them as constants, and a test gives smaller ones. */
export interface FlatLimits {
  /** The most bytes of the zip; a body cut at it fails the download as too large. */
  maxZipBytes: number;
  /** The most bytes the entry may inflate to, by the size its directory declares and by the count. */
  maxInflatedBytes: number;
  /** The most lines; the next one fails the download as too large. */
  maxLines: number;
}

/** What a read of the zip gives besides the lines. */
export interface FlatRead {
  etag: string | null;
  lastModified: string | null;
  zipBytes: number;
  inflatedBytes: number;
  /** The lines the splitter gave, blank and overlong ones included. */
  lines: number;
}

/** A failure of the zip reader as the sync knows it: too large, or not the list. */
function zipFailure(error: unknown): unknown {
  if (!(error instanceof ZipError)) return error;
  return error.code === "too_large" ? new BodyTooLargeError() : new NotTheListError();
}

/**
 * Asks for the zip, checks it, and streams its one entry to `onLine`, line by line (the Buffer of a
 * line is valid during the call only: decode what is kept). Resolves only when the entry was read to
 * its end and its size and CRC-32 are the directory's, and the last line (which has no line feed) was
 * given. Gives `"unchanged"` for a 304 at a pinned address, and then reads nothing.
 *
 * It fails as `FetchError` (the page guard's, or `not_allowed` for an answer from outside the pin, a
 * 304 included), as `BodyTooLargeError` (the zip cut at its limit, an entry that declares more than
 * `maxInflatedBytes`, a line past `maxLines`, or whatever `onLine` throws as that) and as
 * `NotTheListError` (what is no one deflated entry of that name, a CRC or a size that does not hold,
 * a stream that is cut). What `onLine` throws comes out as it was thrown. No error holds an address
 * or a part of the file.
 */
export async function streamFlatFile(
  fetch: ConnectorFetch,
  validators: Validators,
  file: FlatFile,
  limits: FlatLimits,
  onLine: (line: Buffer | null) => void,
): Promise<FlatRead | "unchanged"> {
  const response = await pinnedFetch(fetch, file.pin)(file.url, validators, {
    maxBytes: limits.maxZipBytes,
    allowedContentTypes: file.contentTypes,
    totalTimeoutMs: file.timeoutMs,
  });
  if (response.notModified) return "unchanged";

  const zip = response.body;
  checkZipDirectory(zip);
  const splitter = new LineSplitter(
    { maxLines: limits.maxLines, maxLineBytes: FLAT_LINE_BYTES_MAX },
    onLine,
  );
  let inflatedBytes = 0;
  try {
    const entry = await streamZipEntry(
      zip,
      (name) => name === file.entryName,
      {
        maxEntries: ZIP_ENTRIES_MAX,
        maxEntryBytes: limits.maxInflatedBytes,
        maxTotalBytes: limits.maxInflatedBytes,
      },
      (chunk) => splitter.push(chunk),
      { deflatedOnly: true },
    );
    // The last line has no line feed: it is given now, once the entry is known to be whole.
    splitter.end();
    inflatedBytes = entry.bytes;
  } catch (error) {
    throw zipFailure(error);
  }
  return {
    etag: response.etag,
    lastModified: response.lastModified,
    zipBytes: zip.length,
    inflatedBytes,
    lines: splitter.lines,
  };
}

/** The kit's `Fetched` for what a list made of a read: one small JSON, and the zip's validators. */
export const fetchedOf = (read: FlatRead, envelope: Buffer): Fetched => ({
  buffers: [envelope],
  contentTypes: [ENVELOPE_CONTENT_TYPE],
  etag: read.etag,
  lastModified: read.lastModified,
  bytes: read.zipBytes,
});

/** The JSON a download hands to `read`: the meta of the file and the entity rows. */
export const envelopeOf = (meta: object, entities: readonly object[]): Buffer =>
  Buffer.from(JSON.stringify({ v: ENVELOPE_VERSION, meta, entities }), "utf8");

/**
 * The meta and the entities of the JSON of a download; null when the file is not exactly one JSON
 * file of the size and shape that a download makes. It reads the text as the kit does (`textOf`) and
 * parses it with the kit's `jsonOf`, which gives null for text that is not JSON.
 */
export function readEnvelope(
  fetched: Fetched,
): { meta: Record<string, unknown>; entities: unknown[] } | null {
  if (fetched.buffers.length !== 1 || fetched.buffers[0].length > ENVELOPE_BYTES_MAX) return null;
  const value = jsonOf(textOf(fetched, 0));
  if (
    !isObject(value) ||
    value.v !== ENVELOPE_VERSION ||
    !isObject(value.meta) ||
    !Array.isArray(value.entities)
  ) {
    return null;
  }
  return { meta: value.meta, entities: value.entities };
}

export const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** A year that a date of a list can have. */
export const isYear = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= YEAR_FIRST && value <= YEAR_LAST;

/** A day as a row holds it: YYYY-MM-DD, a day that exists, in the years of a list. */
export const isStoredDay = (value: unknown): value is string =>
  typeof value === "string" &&
  dayText(value) === value &&
  value >= `${YEAR_FIRST}-01-01` &&
  value <= `${YEAR_LAST}-12-31`;

/**
 * What no clean line holds: a control (a line feed and a tab are controls), a lone surrogate, an angle
 * bracket, and the characters that a fold (NFKC) or a decomposition makes one. `lineOf` and
 * `withoutAngles` of the kit take them all out of every cell that the cleaners give.
 */
const NOT_IN_A_LINE =
  /[\p{Cc}\u{D800}-\u{DFFF}<>\u{FE64}\u{FF1C}\u{226E}\u{FE65}\u{FF1E}\u{226F}]/u;

/**
 * A cell as a row holds it: a text that is not empty, of at most `max` units, that has none of what a
 * clean line cannot have. It checks what the download wrote; it does not clean again, and it does not
 * ask that cleaning the line once more leaves it as it is: it does not, for some names (the first pass
 * drops a soft hyphen between a letter and a combining mark and leaves the mark loose, the second one
 * composes them), and a list would then be "not the list" for the one name that has such a place.
 */
export const isCleanLine = (value: unknown, max: number): value is string =>
  typeof value === "string" && value !== "" && value.length <= max && !NOT_IN_A_LINE.test(value);

/** An entity's id: the compact key of its name. */
export const isEntityId = (value: unknown): value is string =>
  typeof value === "string" &&
  value !== "" &&
  value.length <= ENTITY_ID_MAX &&
  compactName(value) === value;

/** What every list says of the file in the JSON of its download. */
export interface FlatMeta {
  /** The calendar year of the newest date of the file: the year the summaries count back from, never the clock's. */
  anchorYear: number;
  /** The newest date of the file. */
  fileNewestDay: string;
  /** The lines the splitter gave: the rows, the blank lines and the lines too long to read. */
  lines: number;
  blankLines: number;
  /** The lines that were rows: the readable ones and the unreadable. */
  rows: number;
  unreadable: number;
  /** The rows that name no entity: not unreadable, and counted apart. */
  noEntityRows: number;
  /** The entities in the JSON. */
  entities: number;
}

/** The meta that every list has, checked; null when a number or the day is not what a download writes. */
export function flatMetaOf(value: unknown): FlatMeta | null {
  if (!isObject(value)) return null;
  const { anchorYear, fileNewestDay, lines, blankLines, rows, unreadable, noEntityRows, entities } =
    value;
  if (
    !isCount(lines) ||
    !isCount(blankLines) ||
    !isCount(rows) ||
    !isCount(unreadable) ||
    !isCount(noEntityRows) ||
    !isCount(entities)
  ) {
    return null;
  }
  if (typeof fileNewestDay !== "string" || !isStoredDay(fileNewestDay)) return null;
  if (anchorYear !== Number(fileNewestDay.slice(0, 4))) return null;
  return {
    anchorYear,
    fileNewestDay,
    lines,
    blankLines,
    rows,
    unreadable,
    noEntityRows,
    entities,
  };
}

/**
 * A day of the flat files, `20260131`, as `2026-01-31`: eight digits that are a day that exists
 * (`compactDayText` of the kit) in the years YEAR_FIRST to YEAR_LAST; null for anything else.
 */
export function plausibleDay(text: string): string | null {
  const day = compactDayText(text);
  return day !== null && isStoredDay(day) ? day : null;
}

/**
 * A date cell that may be empty: null for an empty cell (no date), the day for a day, and undefined
 * for a cell that is neither, which makes the row unreadable. Nothing around the digits is tolerated.
 */
export function optionalDay(text: string): string | null | undefined {
  if (text === "") return null;
  return plausibleDay(text) ?? undefined;
}

const MEMO_KEY_MAX = 200;
const MEMO_ENTRIES_MAX = 20_000;

/**
 * A cleaner of one column of cells that remembers what it gave. The same cells come back in
 * thousands of rows, so the results for the short ones are kept, at most MEMO_ENTRIES_MAX of at most
 * MEMO_KEY_MAX units each: a hostile file cannot grow the memory by it, and what a cell gives is the
 * same with or without the memory.
 */
function remembered<T extends string | null>(clean: (raw: string) => T): (raw: string) => T {
  const memo = new Map<string, T>();
  return (raw) => {
    const known = memo.get(raw);
    if (known !== undefined) return known;
    const value = clean(raw);
    if (raw.length <= MEMO_KEY_MAX && memo.size < MEMO_ENTRIES_MAX) memo.set(raw, value);
    return value;
  };
}

/**
 * The cleaner of one column of cells: a cell as one clean line of at most `max` units (`lineOf` of
 * the kit: controls, hidden characters, white space, a cut that says so) with no angle bracket
 * (`withoutAngles`). It is for texts that are shown, which a cut serves; a name is no such text
 * (`nameCleaner`).
 */
export const cellCleaner = (max: number): ((raw: string) => string) =>
  remembered((raw) => withoutAngles(lineOf(raw, max)));

/** The names that stand for no entity, and the marker of a name that the file itself retired. */
const PLACEHOLDER_NAMES: ReadonlySet<string> = new Set([
  "unknown manufacturer",
  "generic manufacturer",
  "various manufacturers",
]);
const RETIRED_MARKER = "redundant";

/** Whether a name (already a clean line) is a placeholder of the file and no entity. */
export function isPlaceholderName(name: string): boolean {
  const lower = name.toLowerCase();
  return PLACEHOLDER_NAMES.has(lower) || lower.includes(RETIRED_MARKER);
}

const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * The cleaner of a column of names: the name as one clean line of at most ENTITY_NAME_MAX units; an
 * empty text for a cell that names no entity (empty, a placeholder, or without a letter or a digit);
 * and null for a name that does not fit in the cap once it is cleaned. Such a name is never cut: the
 * cut text would become an id and a key, so the reader makes the line of it unreadable (counted, as
 * every line that cannot be read is), and no entity is named by it, whole or cut. The decision is the
 * kit's `lineWithin`, not a compare of the length of a line cut at the cap and one unit more: the cut
 * takes the blank before it off and never splits a pair of surrogates, so a cut line can be as short
 * as the cap and end in the marker, and would pass for a whole name.
 */
export const nameCleaner = (): ((raw: string) => string | null) =>
  remembered((raw) => {
    const fitting = lineWithin(raw, ENTITY_NAME_MAX);
    // Null is a cell with no text as well as a name that does not fit: a cell that has a clean line is the second.
    if (fitting === null) return lineOf(raw, ENTITY_NAME_MAX) === "" ? "" : null;
    const name = withoutAngles(fitting);
    return isPlaceholderName(name) || !HAS_LETTER_OR_DIGIT.test(name) ? "" : name;
  });

/**
 * The key of an entity: the compact key of its name without the legal form, which is the key a vendor
 * is matched by (`compactName` of records/match.ts, `shortName` as keys.ts takes it). Two spellings
 * of one name have one key, and a renamed entity a new one.
 */
export const entityKeyOf = (name: string): string => compactName(shortName(name));

/**
 * The spellings of an entity, the most written first, a tie by text (`compareText`, no locale), at
 * most `max`. The counts are of what the list counts (investigations, campaigns), so that one
 * investigation of 71,004 rows weighs what a small one does.
 */
export function topSpellings(counts: ReadonlyMap<string, number>, max = SPELLINGS_MAX): string[] {
  return [...counts]
    .sort(([a, countA], [b, countB]) => countB - countA || compareText(a, b))
    .slice(0, max)
    .map(([spelling]) => spelling);
}

/**
 * The names a spelling stands for: the whole, the text before ` (` and the text inside the
 * parentheses ("Acme (Acme Motor Co.)" is both Acme and Acme Motor Co.), as the NHTSA crash list does
 * (nhtsa.ts). A parenthesis that is never closed runs to the end.
 */
export function namesOfSpelling(spelling: string): string[] {
  const open = spelling.indexOf(" (");
  if (open === -1) return [spelling];
  const close = spelling.indexOf(")", open + 2);
  const inside = spelling.slice(open + 2, close === -1 ? undefined : close).trim();
  return [spelling, spelling.slice(0, open), inside].filter((name) => name !== "");
}

/** The names of an entity for the keys of its record: its spellings and their parts, each once. */
export const keyNamesOf = (spellings: readonly string[]): string[] => [
  ...new Set(spellings.flatMap(namesOfSpelling)),
];

/**
 * Whether an entity has a name that a vendor can be matched by: some name of it (`keyNamesOf`), as
 * written or without its legal form, has four compact characters or more, which is what its record
 * is keyed by (`compactNamesOf` of keys.ts, the keys of `recordOf`). An entity with none (a bare
 * "Zyx", "BIC") could be asked for by nobody and gets no record. The id is another matter: it is the
 * key WITHOUT the legal form, so an entity whose id is under four characters but whose full name is
 * not ("Abc, Inc.", id `abc`) has a record, keyed by its full name.
 */
export const hasNameKey = (spellings: readonly string[]): boolean =>
  compactNamesOf(keyNamesOf(spellings)).length > 0;

/**
 * The components that are driver assistance or automated driving, as they were measured on both
 * lists (83 campaigns of the recalls file since 2022), in any case.
 */
const DRIVER_ASSISTANCE =
  /ADAS|AUTONOMOUS|SELF-DRIV|LANE DEPARTURE|LANE KEEPING|ADAPTIVE CRUISE|AUTOMATIC EMERGENCY|COLLISION AVOIDANCE/i;

export const isDriverAssistance = (component: string): boolean => DRIVER_ASSISTANCE.test(component);

/**
 * The counts by calendar year of an entity, cut to the YEARS_SHOWN years that end at the anchor year
 * (the year of the file's newest date, never the clock's): only the years that have a count, in
 * ascending order of year.
 */
export function byYearOf(
  counts: ReadonlyMap<number, number>,
  anchorYear: number,
): Record<string, number> {
  const years: Record<string, number> = {};
  for (let year = anchorYear - YEARS_SHOWN + 1; year <= anchorYear; year += 1) {
    const count = counts.get(year) ?? 0;
    if (count > 0) years[String(year)] = count;
  }
  return years;
}

/**
 * "By year opened: 2026 5, 2025 2." The years that end at the anchor year, the newest first, those that
 * have a count only; nothing (an empty text, which a summary leaves out) when none has.
 */
export function yearsSentence(
  label: string,
  anchorYear: number,
  byYear: Readonly<Record<string, number>>,
): string {
  const parts: string[] = [];
  for (let year = anchorYear; year > anchorYear - YEARS_SHOWN; year -= 1) {
    const count = byYear[String(year)];
    if (typeof count === "number" && count > 0) parts.push(`${year} ${count}`);
  }
  return sentence(label, parts.join(", "));
}

/** "1 campaign", "0 campaigns", "2 campaigns". */
export const countPhrase = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** A count with a comma every three digits ("17,600,000"), whatever the locale. */
export const withThousands = (count: number): string =>
  String(count).replace(/\B(?=(?:\d{3})+$)/g, ",");

/** The first sentence of every record: the list, the operator's host and what kind of list it is. */
export const firstSentence = (mark: string): string =>
  `${mark} (${NHTSA_SENTENCE_HOST}), a product safety list.`;
