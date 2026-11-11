/**
 * The hardened text helpers of the list kit: what every connector of a mirrored list uses to turn a
 * cell that someone else wrote into text that is safe to store and to put in a prompt, and the
 * small checks they share.
 *
 * `lineOf` is the one that matters. It gives a cell as ONE clean line: control characters and lone
 * surrogates dealt with (`cleanText`), the compatibility forms folded (NFKC: a full-width `<` is a
 * `<` before the prompt's escaping sees it), the characters nobody sees out, white space collapsed,
 * and the line cut at a length, with a marker that says so. Every step is linear in the length of
 * the cell, and a cell is read to LINE_INPUT_MAX units at most, whatever it holds.
 *
 * The fold is the step that is not linear by itself. Unicode orders the combining marks of a run by
 * their class, and ICU does it by insertion: a run of marks of two classes in the worst order takes
 * the time of its square (measured on ICU 78: 64K units took 0.9 s, 256K took 14.5 s, and a run of
 * 2 MB would take minutes, in one synchronous call). No text has more than a few marks in a row, so
 * a longer run is cut to MARK_RUN_MAX before the fold, which bounds the sort of every run.
 */
import { cleanText, cutAtCodePoint } from "../../../text";
import { dayOf } from "../types";

/** What a cut text ends with, so that nobody takes the part kept for the whole. */
export const SHORTENED = " [shortened]";

/**
 * The most UTF-16 units of a cell that `lineOf` reads. The line is cut to a length far below this,
 * so only a cell that is hostile or broken is longer; it bounds the time and the memory of one cell
 * (the fold can make a text eighteen times longer).
 */
export const LINE_INPUT_MAX = 1 << 20;

/** The most combining marks in a row that a line keeps. */
export const MARK_RUN_MAX = 16;

/**
 * Characters no reader sees: the format characters (zero-width, bidirectional, soft hyphen, byte
 * order mark, tags), and the default-ignorable ones outside that category (the variation
 * selectors, the Hangul and half-width Hangul fillers, the combining grapheme joiner, the Khmer
 * inherent vowels), which a title made of them alone would otherwise fill with nothing. The
 * Braille pattern blank (U+2800) is no such character, but it shows nothing either.
 */
const HIDDEN = /[\p{Cf}\p{Default_Ignorable_Code_Point}\u{2800}]/gu;

/**
 * White space, and the controls that are left, as one blank. A loop with no upper bound keeps an entry
 * on the backtrack stack of the regular expression engine for every unit that it passes, and V8
 * compiles the loops of its later regular expressions without optimising them once a process has
 * compiled much regexp code: a run of a few million units then overflows that stack (a RangeError,
 * "Maximum call stack size exceeded"). A line is read to LINE_INPUT_MAX units only, which the stack
 * holds; a text of any length goes through `collapseBreaks`.
 */
const BREAKS = /[\s\p{Cc}]+/gu;

/** The most units of a run of white space that one match of `BREAK_PIECES` passes. */
const BREAK_PIECE_MAX = 1024;
const BREAK_PIECES = new RegExp(`[\\s\\p{Cc}]{1,${BREAK_PIECE_MAX}}`, "gu");
const BREAK_PAIR = /[\s\p{Cc}]{2}/u;

/**
 * The text with every run of white space and controls written as one blank, as `BREAKS` writes it,
 * whatever the length of the run. A run is written as one blank for each BREAK_PIECE_MAX units of it,
 * and a pass that follows joins those blanks, so that a run of n units takes about log(n) passes
 * (three for a run of five million) and the engine never passes more than BREAK_PIECE_MAX units of
 * a run in one loop. A pass with no run of two units left in the text is the last.
 */
export function collapseBreaks(text: string): string {
  let collapsed = text.replace(BREAK_PIECES, " ");
  while (BREAK_PAIR.test(collapsed)) collapsed = collapsed.replace(BREAK_PIECES, " ");
  return collapsed;
}

/**
 * A run of more than MARK_RUN_MAX marks. U+FF9E and U+FF9F are letters (the half-width voiced sound
 * marks) that the fold turns into marks, so a run that holds them counts as one: they are the only
 * characters outside the Mark category that the fold makes marks of.
 */
const MARK_RUNS = new RegExp(`[\\p{M}\\u{FF9E}\\u{FF9F}]{${MARK_RUN_MAX + 1},}`, "gu");

/** The first MARK_RUN_MAX marks of a run, by code point, in time that does not depend on its length. */
function firstMarks(run: string): string {
  let kept = "";
  let count = 0;
  for (const mark of run) {
    if (count === MARK_RUN_MAX) break;
    kept += mark;
    count += 1;
  }
  return kept;
}

/**
 * The text cut so that it and the marker are `max` units together, whatever its length; a cut that
 * leaves nothing of the text gives the marker alone. Where `max` has no room for a marker the text
 * is cut to `max`, and says nothing: a limit that small has no use for a text.
 */
function markedCut(text: string, max: number): string {
  if (max <= SHORTENED.length) return cutAtCodePoint(text, max);
  const kept = cutAtCodePoint(text, max - SHORTENED.length).trimEnd();
  return kept === "" ? SHORTENED.trimStart() : `${kept}${SHORTENED}`;
}

/**
 * The text as it is when it has at most `max` UTF-16 units, else cut so that it and the marker have
 * (SHORTENED, a blank before it dropped), never splitting a surrogate pair. It cleans nothing: use
 * `lineOf` for a cell. A `max` that is not above zero gives an empty text.
 */
export function shorten(text: string, max: number): string {
  if (!(max > 0)) return "";
  return text.length <= max ? text : markedCut(text, max);
}

/** A cell as one clean line before the cut (see `lineOf`). */
const flatLineOf = (text: string): string =>
  cleanText(text)
    .replace(MARK_RUNS, firstMarks)
    .normalize("NFKC")
    .replace(HIDDEN, "")
    .replace(BREAKS, " ")
    .trim();

/**
 * A value as ONE clean line of at most `max` UTF-16 units: the control characters out and the lone
 * surrogates replaced (`cleanText`), the compatibility forms folded (NFKC), the characters nobody
 * sees out, all white space and the remaining controls collapsed to one blank, no blank at either
 * end, and the line cut to `max`, marker included (SHORTENED), never splitting a surrogate pair. A
 * value that is no string gives an empty line, and so does a `max` that is not above zero.
 *
 * Linear in the length of the value, which is read to LINE_INPUT_MAX units: what lies beyond is
 * never seen, and a line that is left short by that says that it was cut (with a `max` of 12 or
 * fewer there is no room for the marker). The one exception: a value whose first LINE_INPUT_MAX
 * units clean to nothing gives an empty line, which no test of emptiness can tell from an empty
 * cell, so a decision on emptiness refuses a value over LINE_INPUT_MAX first (`lineWithin` does).
 * A real `<` stays: taking the angle brackets out of a record's text is the record builder's job
 * (`withoutAngles`).
 */
export function lineOf(value: unknown, max: number): string {
  if (typeof value !== "string" || !(max > 0)) return "";
  const over = value.length > LINE_INPUT_MAX;
  const line = flatLineOf(over ? cutAtCodePoint(value, LINE_INPUT_MAX) : value);
  if (line === "") return "";
  return over ? markedCut(line, max) : shorten(line, max);
}

/**
 * Whether a clean line ends in the cut marker: it was cut by `lineOf` or `shorten` (a cut after a
 * word has a blank before the marker, a cut that left nothing of the text has none), or it arrived
 * from a layer that cut it. Such a text is never a whole name, number or title.
 */
export const endsCut = (line: string): boolean => line.endsWith(SHORTENED.trimStart());

/**
 * How many units beyond `max` `lineWithin` asks of `lineOf`. A cut line is the kept text and the
 * marker; when the ask is `max`, the kept text loses a blank before the cut and one unit when the
 * cut would split a pair of surrogates, so a cut line has at least `max - 2` units. An ask of
 * `max + 4` leaves every cut line above `max`.
 */
const WITHIN_ROOM = 4;

/**
 * A value as ONE clean line (`lineOf`) of at most `max` UTF-16 units, or null when the clean line is
 * longer than that, or empty: a text that does not fit is never cut here. `lineOf(value, max + 1)`
 * cannot tell a text of `max + 1` units from a longer one that a cut left at `max` units or fewer
 * (the cut takes a blank before it off and never splits a pair of surrogates), so a cut line would
 * pass for a whole one and end in the marker. Use this wherever a name, a title or a cell that
 * does not fit must be left out and never used cut, as a key or as an id.
 */
export function lineWithin(value: unknown, max: number): string | null {
  if (!(max > 0)) return null;
  // A value of more than LINE_INPUT_MAX units is read to there only, so it cannot be known whole and
  // does not fit. `lineOf` marks the cut of such a value, but writes no marker where its limit has no
  // room for one (a `max` of 8 or less), and then a short part of the first megabyte would pass.
  if (typeof value === "string" && value.length > LINE_INPUT_MAX) return null;
  const line = lineOf(value, max + WITHIN_ROOM);
  // A text that arrives with the marker was cut by another layer: it is not whole either.
  return line !== "" && line.length <= max && !endsCut(line) ? line : null;
}

/**
 * A text that is made of sentences already cleaned, as one line: the control characters out and
 * the lone surrogates replaced (`cleanText`), the characters nobody sees out, white space and the
 * controls that are left collapsed to one blank, none at either end. Nothing is folded and nothing
 * is cut: the text is the caller's own, and a record's summary keeps its sentences intact.
 */
export const flatText = (text: string): string =>
  collapseBreaks(cleanText(text).replace(HIDDEN, "")).trim();

/**
 * `<` and the characters that a fold makes one: the full-width and the small less-than sign, and
 * the not-less-than sign, which a decomposition (NFD, NFKD) writes as `<` and a combining mark.
 */
const LESS_THAN = /[<\u{FE64}\u{FF1C}\u{226E}]/gu;
/**
 * `>` and the characters that a fold makes one: the full-width and the small greater-than sign, and
 * the not-greater-than sign, which a decomposition writes as `>` and a combining mark.
 */
const GREATER_THAN = /[>\u{FE65}\u{FF1E}\u{226F}]/gu;

/**
 * The text with `<` and `>` written as the angle quotation marks that look like them (U+2039 and
 * U+203A), so that no tag of the prompt, nor any other markup, can be written with what it holds.
 * The characters that a fold (NFKC) makes angle brackets, which are four, go the same way, and so
 * do the two that a decomposition (NFD, NFKD) makes them, so that a text that was not folded holds
 * none either. The prompt escapes these two characters as well: that is a second line of defence,
 * and this the first.
 */
export const withoutAngles = (text: string): string =>
  text.replace(LESS_THAN, "\u{2039}").replace(GREATER_THAN, "\u{203A}");

export const stringOf = (value: unknown): string => (typeof value === "string" ? value : "");

/** An object that is neither null nor an array. */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The order of two texts by UTF-16 unit, as the operators `<` and `>` compare them; never a locale's. */
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The first `max` distinct values, in the order they first appear. */
export function distinct<T>(values: readonly T[], max: number): T[] {
  const seen = new Set<T>();
  for (const value of values) {
    if (seen.size >= max) break;
    seen.add(value);
  }
  return [...seen];
}

/**
 * How many rows of a list may be left out because they do not parse: ten, or a hundredth of the
 * rows when that is more, as the CVE records are (connectors/cve.ts), and never more than a tenth
 * of the rows, rounded up, so that a short list cannot leave out most of itself (12 rows allow 2,
 * 100 allow 10, 5,000 allow 50). More is a new format.
 */
export const unreadableAllowed = (rows: number): number =>
  Math.min(Math.max(10, Math.floor(rows / 100)), Math.ceil(rows / 10));

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A day of the form YYYY-MM-DD that exists. Year 0000 does not: Postgres has no such year, and one
 * such date would fail the whole write of a list.
 */
const isRealDay = (text: string): boolean =>
  DAY.test(text) && text >= "0001-01-01" && dayOf(text) === text;

/**
 * A day of a list: the value cleaned as a line (`lineOf`, so a blank or a hidden character around
 * it is tolerated) and then exactly YYYY-MM-DD, a day that exists; null for anything else, a value
 * that is no text included. Never reads another form (`dayOf` reads dd/mm/yyyy).
 */
export function dayText(value: unknown): string | null {
  const text = lineOf(value, 32);
  return isRealDay(text) ? text : null;
}

const INSTANT =
  /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2})))?$/;

/** The first and the last instant of the years 1 to 9999, which a store holds. */
const FIRST_INSTANT_MS = Date.parse("0001-01-01T00:00:00.000Z");
const LAST_INSTANT_MS = Date.parse("9999-12-31T23:59:59.999Z");

/**
 * The value as it is when it is an ISO 8601 day, or a day and time with seconds and a zone (`Z` or
 * `+hh:mm`) that exist; null for anything else. A time without a zone is no instant, and nothing
 * around the text is tolerated. A day and time must also fall in the years 1 to 9999 once its zone
 * is applied (`0001-01-01T00:00:00+01:00` is an instant of year 0, and `9999-12-31T23:59:59-23:59`
 * one of year 10000): a store has no such year, and one such time would fail the whole write.
 */
export function instantText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = INSTANT.exec(value);
  if (match === null || !isRealDay(match[1])) return null;
  if (match[2] === undefined) return value;
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return null;
  if (match[5] !== undefined && (Number(match[5]) > 23 || Number(match[6]) > 59)) return null;
  const at = Date.parse(value);
  return at >= FIRST_INSTANT_MS && at <= LAST_INSTANT_MS ? value : null;
}
