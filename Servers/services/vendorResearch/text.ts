/**
 * Limits and cuts for third-party text, shared by the search provider and the evidence pack.
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
