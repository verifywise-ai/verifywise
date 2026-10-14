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
