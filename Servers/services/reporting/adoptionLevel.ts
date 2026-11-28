/**
 * @fileoverview Report labels for a framework's self-assessed adoption level
 * (Saudi NAII: SDAIA's levels 0-5, named as in the index document).
 * Shared by the PDF template and the DOCX generator.
 *
 * @module services/reporting/adoptionLevel
 */

export const ADOPTION_LEVEL_NAMES: readonly string[] = [
  "Absence of capabilities",
  "Establishing",
  "Activated",
  "Managed",
  "Excellence",
  "Pioneer",
];

/** "3: Managed"; "Not assessed" for null, undefined or a value outside 0-5. */
export function adoptionLevelLabel(level: number | null | undefined): string {
  if (level == null || !Number.isInteger(level)) return "Not assessed";
  const name = ADOPTION_LEVEL_NAMES[level];
  return name ? `${level}: ${name}` : "Not assessed";
}
