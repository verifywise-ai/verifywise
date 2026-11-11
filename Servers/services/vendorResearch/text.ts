/**
 * Limits, cuts and cleaning for text that someone else wrote: a web page, the search feed or the
 * model. Shared by the web research modules (the search feed, the page text and the loop), the
 * evidence pack and the validation of the model's answer.
 */

/** The longest snippet of a search result, in UTF-16 units, as String.length counts them. */
export const MAX_SNIPPET_CHARS = 1500;

/**
 * Cuts to `max` UTF-16 units, the unit String.length counts, without splitting a surrogate pair.
 * When the cut would end on a high surrogate, that unit goes too: it is the first half of a pair
 * or an unpaired surrogate, and Postgres refuses either in the stored evidence. Text that is not
 * longer than `max` is returned as it is.
 */
export function cutAtCodePoint(text: string, max: number): string {
  if (text.length <= max) return text;
  const lastKept = text.charCodeAt(max - 1);
  const endsInsidePair = lastKept >= 0xd800 && lastKept <= 0xdbff;
  return text.slice(0, endsInsidePair ? max - 1 : max);
}

/** The C0 control characters other than tab, line feed and carriage return. */
const UNWANTED_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/**
 * With the u flag a surrogate pair is read as one code point, so this matches an unpaired
 * surrogate and nothing else.
 */
const LONE_SURROGATES = /[\uD800-\uDFFF]/gu;

/**
 * Removes the control characters and replaces each lone surrogate with U+FFFD. Postgres refuses a
 * NUL character in a text column and in JSONB, and a lone surrogate in JSONB (JSON.stringify
 * writes it as an escape sequence), so one such character in text that a third party or the model
 * wrote would make a run fail to save. Tab, line feed and carriage return stay. A complete
 * surrogate pair is not touched.
 */
export function cleanText(text: string): string {
  return text.replace(UNWANTED_CONTROL_CHARACTERS, "").replace(LONE_SURROGATES, "\uFFFD");
}

/**
 * The most units of a run of white space that one match of `collapseBlanks` passes. A loop with no
 * upper bound keeps an entry on the backtrack stack of the regular expression engine for every unit
 * it passes, and V8 compiles the regular expressions of a process that has already compiled much
 * regexp code without optimising them: one run of a few million units then overflows that stack
 * (a RangeError, "Maximum call stack size exceeded"), in a long test run or a long-lived server and
 * not in a short one.
 */
const BLANK_PIECE_MAX = 1024;
const BLANK_PIECES = new RegExp(`\\s{1,${BLANK_PIECE_MAX}}`, "g");
const BLANK_PAIR = /\s{2}/;

/**
 * The text with every run of white space written as one blank, as `text.replace(/\s+/g, " ")` writes
 * it, whatever the length of the run. A run is written as one blank for each BLANK_PIECE_MAX units
 * of it and the passes that follow join those blanks, so a run of n units takes about log(n) passes
 * and the engine never passes more than BLANK_PIECE_MAX units of a run in one loop.
 */
export function collapseBlanks(text: string): string {
  let collapsed = text.replace(BLANK_PIECES, " ");
  while (BLANK_PAIR.test(collapsed)) collapsed = collapsed.replace(BLANK_PIECES, " ");
  return collapsed;
}
