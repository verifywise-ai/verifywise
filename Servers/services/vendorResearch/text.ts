/**
 * Limits, cuts and cleaning for text that someone else wrote: a search provider, a web page or the
 * model. Shared by the search provider, the evidence pack and the validation of the model's answer.
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
