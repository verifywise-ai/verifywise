/**
 * Word-overlap similarity for deciding whether two pieces of vendor risk wording are
 * near-duplicates. Thresholds belong to the callers; these two functions only define what
 * "similar" is measured on.
 */

/** Lowercase, strip everything but [a-z0-9 ], split, drop tokens of length <= 2. */
export function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

/** Size of the intersection over the size of the union; 0 when either set is empty. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}
