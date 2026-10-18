/** Display helpers the run figures and the ratio trend share. */

/** Display names for a result table's `categoryKey`. */
export const CATEGORY_LABEL: Record<string, string> = {
  sex: "Sex",
  race_ethnicity: "Race or ethnicity",
  intersectional: "Sex by race or ethnicity",
};

/** The display name for a category key, or the key itself when it has none. */
export const categoryLabel = (key: string) => CATEGORY_LABEL[key] ?? key;

/**
 * An impact ratio to three decimals, truncated rather than rounded, so a
 * ratio flagged below 0.80 (say 0.7996) never prints as "0.800". Ratios are
 * stored rounded to six decimals, so `toFixed(6)` reproduces them exactly
 * before the cut.
 */
export function formatRatio(ratio: number | null): string {
  if (ratio === null) return "—";
  const [whole, fraction = ""] = ratio.toFixed(6).split(".");
  return `${whole}.${fraction.slice(0, 3)}`;
}

/**
 * A job description key as the stance document prints it
 * (Servers/services/biasAudit/stance/compose.ts, testedBody): hyphens read
 * as spaces.
 */
export const jobDescriptionLabel = (key: string) => key.replace(/-/g, " ");
