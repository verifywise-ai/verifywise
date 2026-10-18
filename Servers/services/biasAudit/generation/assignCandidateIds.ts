import { checkIdOrder } from "../idOrderCheck";
import type { AllocationRow } from "./allocation";

/**
 * Map allocation rows onto candidate IDs by a seeded permutation.
 *
 * NEVER zip or index allocation rows onto candidate IDs. `buildAllocation`
 * returns rows in stratum order, so walking them puts every protected
 * category in a contiguous ID range, and generation runs in ID order.
 * Anything that varies over the course of a run then maps onto one category
 * instead of spreading across all of them.
 *
 * This is not hypothetical. It shipped twice in the audit tooling this module
 * replaces. One corpus produced a lowest race impact ratio of 0.8050 with
 * three intersectional cells below 0.80, and it survived its own permutation
 * test at p = 0.0010: it looked like a finding about the tool. The corpus had
 * to be rebuilt and the client asked to rescore.
 *
 * Neither balance checks nor blueprint-independence tests catch it. Balance
 * is perfect while ordering is broken, and blueprints are byte-identical under
 * demographic permutation because the defect is in generation order. A clean
 * ratio is not reassurance either: on that corpus sex was the most perfectly
 * blocked attribute, one split at the midpoint, and returned 0.9770, because a
 * two-block split averages position effects over half the corpus each and they
 * cancel.
 *
 * So the gate lives here, beside the assignment, not in the caller. Four
 * planners were written against an equivalent allocation function in the
 * Python tooling; two permuted and two did not, and both that did not shipped
 * the defect, the second after the lesson had been written down elsewhere.
 */
export const GENERATED_MIN_RUN_FRACTION = 0.9;

export class IdOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdOrderError";
  }
}

export type IdOrderChecks = Record<
  string,
  { observed: number; expected: number; fraction: number }
>;

type Assigned = { candidateId: string } & AllocationRow;

const DEFAULT_ATTRIBUTES = ["sex", "raceEthnicity"];

/** Small seeded PRNG (mulberry32): deterministic, dependency-free, pure. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Observed versus expected runs per attribute, in candidate-ID order. Never throws. */
export function measureIdOrder(assigned: Assigned[], attributes: string[]): IdOrderChecks {
  const ordered = [...assigned]
    .sort((a, b) => (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0))
    .map((a) => ({ sex: a.demographics.sex, raceEthnicity: a.demographics.raceEthnicity }));
  const checks: IdOrderChecks = {};
  for (const f of checkIdOrder(ordered, attributes)) {
    checks[f.attribute] = {
      observed: f.observedRuns,
      expected: f.expectedRuns,
      fraction: f.ratio,
    };
  }
  return checks;
}

/** `measureIdOrder` plus the threshold; throws IdOrderError below `minFraction`. */
export function verifyIdOrder(
  assigned: Assigned[],
  attributes: string[],
  minFraction: number = GENERATED_MIN_RUN_FRACTION,
): IdOrderChecks {
  const checks = measureIdOrder(assigned, attributes);
  for (const attribute of attributes) {
    const c = checks[attribute];
    if (c.fraction < minFraction) {
      throw new IdOrderError(
        `Candidate IDs are blocked by ${attribute}: observed ${c.observed} runs, expected about ${Math.round(c.expected)} (${c.fraction.toFixed(3)} of expected, minimum ${minFraction}).`,
      );
    }
  }
  return checks;
}

export function assignCandidateIds(args: {
  rows: AllocationRow[];
  seed: number;
  digits?: number;
  attributes?: string[];
}): { assigned: Assigned[]; checks: IdOrderChecks } {
  const { rows, seed } = args;
  const attributes = args.attributes ?? DEFAULT_ATTRIBUTES;
  const digits = args.digits ?? Math.max(4, String(rows.length).length);
  if (String(rows.length).length > digits) {
    throw new Error(`The digit width ${digits} is too narrow for ${rows.length} candidates.`);
  }

  // Fisher-Yates: position i in the shuffled list holds the row that gets ID i + 1.
  const random = seededRandom(seed);
  const order = rows.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const assigned: Assigned[] = order.map((rowIndex, i) => ({
    ...rows[rowIndex],
    candidateId: `C${String(i + 1).padStart(digits, "0")}`,
  }));

  // An unpermuted plan can never leave this function.
  return { assigned, checks: verifyIdOrder(assigned, attributes) };
}
