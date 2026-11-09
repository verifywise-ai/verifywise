/**
 * Words that never appear in generated output. Customers paste whatever is
 * printed into procurement answers, so a word that reads as a conclusion
 * ("compliant", "audited") would be quoted as one.
 */
export const FORBIDDEN_WORDS = [
  "compliant",
  "certified",
  "passed",
  "bias-free",
  "audited",
] as const;

/**
 * Forbidden words found in `text`, matched as whole words so "bypassed" and
 * "uncertified" are not flagged but "passed", "non-compliant" and "bias-free"
 * are. A word is bounded by anything that is not a letter or digit.
 */
export function findForbidden(text: string): string[] {
  const lower = text.toLowerCase();
  return FORBIDDEN_WORDS.filter((w) =>
    new RegExp(`(?<![a-z0-9])${w.replace(/-/g, "\\-")}(?![a-z0-9])`).test(lower),
  );
}
