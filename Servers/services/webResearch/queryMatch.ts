/**
 * Whether one search query repeats another. A model that has not found what it wanted asks again
 * in other words, and often in the same ones: "Acme data breach" and "breaches Acme data" return
 * the same feed, so the second search costs a unit of the budget and an interval of the search
 * queue and brings nothing new. The web session refuses a query that is too close to one it has
 * already had answered, without using budget.
 *
 * Two queries are compared by their words: the letters and digits of any script, in lower case,
 * with a plural taken for its singular, as sets. Their similarity is the share of the words that
 * they have in common (Jaccard), so the order, the case, the punctuation and a plural do not make
 * a query new.
 */

/** A query at or above this similarity to an answered one is a repeat. */
export const REPEATED_QUERY_JACCARD = 0.8;

const WORD = /[\p{L}\p{N}]+/gu;

/** The singular of an English plural, as far as a comparison needs it; short words are left alone. */
function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(?:ch|sh|ss|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

/** The words of a query, as a set. */
export function queryWords(query: string): Set<string> {
  const words = new Set<string>();
  for (const word of query.toLowerCase().match(WORD) ?? []) words.add(singular(word));
  return words;
}

/** The share of the words that two sets have in common: 0 when either has none. */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}
