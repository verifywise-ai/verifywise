export interface Demographics {
  sex: string;
  raceEthnicity: string;
}

export interface AllocationRow {
  demographics: Demographics;
  tierKey: string;
}

/**
 * The single definition of the LL 144 groups; runService.ts builds
 * LL144_CONFIG.categories from these.
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

/** Largest corpus a single generation may ask for. */
export const MAX_COUNT = 10000;

/**
 * Balances the sample across every sex by race/ethnicity cell, with the
 * identical tier mix in every cell: k = floor(count / (14 x tiers)) rows per
 * tier per cell. Any leftover scheme would make cell or tier sizes differ
 * along sex or race lines, so the achieved `count` can sit below the request.
 * Rows are returned in stratum order (sex outer, race inner), grouped by cell;
 * the caller must permute IDs before generation.
 */
export function buildAllocation(args: {
  count: number;
  tiers: string[];
  smallSampleExclusion: number;
}): {
  rows: AllocationRow[];
  cellSizes: Record<string, number>;
  smallestCellFraction: number;
  count: number;
} {
  const { count, tiers, smallSampleExclusion } = args;
  if (!Number.isInteger(count)) throw new Error("The record count must be a whole number.");
  if (count > MAX_COUNT) throw new Error(`The record count cannot exceed ${MAX_COUNT}.`);
  if (tiers.length === 0) throw new Error("At least one tier is required.");
  if (tiers.some((t) => typeof t !== "string" || t.trim() === "")) {
    throw new Error("Tier keys must not be blank.");
  }
  if (new Set(tiers).size !== tiers.length) throw new Error("Tier keys must be unique.");
  if (!(smallSampleExclusion > 0 && smallSampleExclusion < 1)) {
    throw new Error("The small-sample exclusion must be between 0 and 1.");
  }

  const cells: Demographics[] = [];
  for (const sex of LL144_SEX) {
    for (const raceEthnicity of LL144_RACE) {
      cells.push(Object.freeze({ sex, raceEthnicity }));
    }
  }

  const minCount = MIN_PER_CELL * cells.length;
  const perTier = Math.floor(count / (cells.length * tiers.length));
  const achieved = perTier * cells.length * tiers.length;
  if (achieved < minCount) {
    throw new Error(
      `A corpus needs at least ${minCount} records (${MIN_PER_CELL} per cell across ${cells.length} cells) ` +
        `after balancing ${tiers.length} tiers evenly; fewer gives each cell too little statistical power for a ratio to mean anything.`,
    );
  }

  const rows: AllocationRow[] = [];
  const cellSizes: Record<string, number> = {};
  for (const demographics of cells) {
    cellSizes[cellKey(demographics)] = perTier * tiers.length;
    for (let j = 0; j < perTier * tiers.length; j++) {
      rows.push({ demographics, tierKey: tiers[j % tiers.length] });
    }
  }

  const smallestCellFraction = Math.min(...Object.values(cellSizes)) / achieved;
  if (smallestCellFraction < smallSampleExclusion) {
    throw new Error("The smallest cell falls under the small-sample exclusion.");
  }
  return { rows, cellSizes, smallestCellFraction, count: achieved };
}
