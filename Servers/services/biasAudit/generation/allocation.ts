export interface Demographics {
  sex: string;
  raceEthnicity: string;
}

export interface AllocationRow {
  demographics: Demographics;
  tierKey: string;
}

/**
 * The groups below restate LL144_CONFIG.categories in runService.ts. This
 * file is pure and cannot import it; a later task asserts the two match.
 */
export const LL144_SEX: readonly string[] = ["Male", "Female"];

export const LL144_RACE: readonly string[] = [
  "Hispanic or Latino",
  "White",
  "Black or African American",
  "Native Hawaiian or Pacific Islander",
  "Asian",
  "Native American or Alaska Native",
  "Two or more races",
];

/** Smallest per-cell size at which a ratio is more than noise. */
export const MIN_PER_CELL = 50;

export function cellKey(d: Demographics): string {
  return `${d.sex}|${d.raceEthnicity}`;
}

/**
 * Balances the sample across every sex by race/ethnicity cell, then balances
 * the tiers within each cell. Rows are returned in stratum order (sex outer,
 * race inner), grouped by cell; the caller must permute IDs before generation.
 */
export function buildAllocation(args: {
  count: number;
  tiers: string[];
  smallSampleExclusion: number;
}): {
  rows: AllocationRow[];
  cellSizes: Record<string, number>;
  smallestCellFraction: number;
} {
  const { count, tiers, smallSampleExclusion } = args;
  const cells: Demographics[] = [];
  for (const sex of LL144_SEX) {
    for (const raceEthnicity of LL144_RACE) cells.push({ sex, raceEthnicity });
  }

  const minCount = MIN_PER_CELL * cells.length;
  if (!Number.isInteger(count) || count < minCount) {
    throw new Error(
      `A corpus needs at least ${minCount} records (${MIN_PER_CELL} per cell across ${cells.length} cells); ` +
        `fewer gives each cell too little statistical power for a ratio to mean anything.`,
    );
  }
  if (tiers.length === 0) throw new Error("At least one tier is required.");

  const base = Math.floor(count / cells.length);
  const extra = count % cells.length;
  const rows: AllocationRow[] = [];
  const cellSizes: Record<string, number> = {};

  cells.forEach((demographics, i) => {
    const size = base + (i < extra ? 1 : 0);
    cellSizes[cellKey(demographics)] = size;
    for (let j = 0; j < size; j++) {
      rows.push({ demographics: { ...demographics }, tierKey: tiers[j % tiers.length] });
    }
  });

  const smallestCellFraction = Math.min(...Object.values(cellSizes)) / count;
  if (smallestCellFraction <= smallSampleExclusion) {
    throw new Error("The smallest cell falls under the small-sample exclusion.");
  }
  return { rows, cellSizes, smallestCellFraction };
}
