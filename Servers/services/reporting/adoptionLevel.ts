/**
 * @fileoverview Report labels for a framework's self-assessed adoption level
 * (Saudi NAII: SDAIA's levels 0-5, named as in the index document).
 * Shared by the PDF template and the DOCX generator.
 *
 * @module services/reporting/adoptionLevel
 */

import type { AdoptionLevelSummary } from "../../domain.layer/interfaces/i.reportGeneration";

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

function isValidLevel(level: number | null | undefined): level is number {
  return (
    level != null && Number.isInteger(level) && level >= 0 && level < ADOPTION_LEVEL_NAMES.length
  );
}

/**
 * A group's adoption levels at a glance: how many of its domains are assessed
 * and the lowest and highest level among them. No average: SDAIA publishes no
 * domain weights, so a mean would invent a score the index does not have.
 */
export function summarizeAdoptionLevels(
  levels: ReadonlyArray<number | null | undefined>,
): AdoptionLevelSummary {
  const assessed = levels.filter(isValidLevel);
  return {
    assessed: assessed.length,
    total: levels.length,
    min: assessed.length ? Math.min(...assessed) : null,
    max: assessed.length ? Math.max(...assessed) : null,
  };
}

/** "2 of 3 domains assessed · levels 2 to 4"; "· level 3" when all assessed share one. */
export function adoptionSummaryLabel(s: AdoptionLevelSummary): string {
  const count = `${s.assessed} of ${s.total} ${s.total === 1 ? "domain" : "domains"} assessed`;
  if (s.min == null || s.max == null) return count;
  return s.min === s.max ? `${count} · level ${s.min}` : `${count} · levels ${s.min} to ${s.max}`;
}
