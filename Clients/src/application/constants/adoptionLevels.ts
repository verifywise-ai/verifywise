/**
 * Self-assessed adoption levels for frameworks whose structure sets
 * `adoption_levels` (Saudi NAII: SDAIA's levels 0-5, named as in the index
 * document). Labels are whole strings so the i18n dictionaries can match them.
 */

/** Drawer options. "" = not assessed (stored as null). */
export const ADOPTION_LEVEL_OPTIONS: Array<{ _id: string; name: string }> = [
  { _id: "", name: "Not assessed" },
  { _id: "0", name: "0: Absence of capabilities" },
  { _id: "1", name: "1: Establishing" },
  { _id: "2", name: "2: Activated" },
  { _id: "3", name: "3: Managed" },
  { _id: "4", name: "4: Excellence" },
  { _id: "5", name: "5: Pioneer" },
];

const ROW_LABELS = ["Level 0", "Level 1", "Level 2", "Level 3", "Level 4", "Level 5"];

/** Row badge text ("Level 3"), or null when no valid level is stored. */
export function adoptionLevelRowLabel(level: number | null | undefined): string | null {
  if (level == null || !Number.isInteger(level)) return null;
  return ROW_LABELS[level] ?? null;
}
