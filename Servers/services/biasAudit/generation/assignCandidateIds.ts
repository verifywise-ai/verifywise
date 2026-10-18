import { checkIdOrder } from "../idOrderCheck";
import type { AllocationRow } from "./allocation";

/** Smallest observed/expected run fraction a generated corpus may show per attribute. */
export const GENERATED_MIN_RUN_FRACTION = 0.9;

export class IdOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdOrderError";
  }
}

export type OrderAttribute = "sex" | "raceEthnicity" | "tierKey";

export type IdOrderChecks = Record<
  string,
  { observed: number; expected: number; fraction: number }
>;

type Assigned = { candidateId: string } & AllocationRow;

/** Redraws allowed after a shuffle lands on the statistical tail. */
export const MAX_SEED_ATTEMPTS = 16;

const DEFAULT_ATTRIBUTES: OrderAttribute[] = ["sex", "raceEthnicity", "tierKey"];

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

/** Measures rows already in candidate-ID order. */
function measureOrdered(ordered: Assigned[], attributes: OrderAttribute[]): IdOrderChecks {
  const records = ordered.map((a) => ({
    sex: a.demographics?.sex,
    raceEthnicity: a.demographics?.raceEthnicity,
    tierKey: a.tierKey,
  }));
  for (const attribute of attributes) {
    if (records.some((r) => r[attribute] === undefined)) {
      throw new Error(`The attribute "${attribute}" is missing from the records.`);
    }
  }
  const checks: IdOrderChecks = {};
  for (const f of checkIdOrder(records, attributes)) {
    checks[f.attribute] = {
      observed: f.observedRuns,
      expected: f.expectedRuns,
      fraction: f.ratio,
    };
  }
  return checks;
}

function sortById(assigned: Assigned[]): Assigned[] {
  return [...assigned].sort((a, b) =>
    a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0,
  );
}

function enforce(
  checks: IdOrderChecks,
  attributes: OrderAttribute[],
  minFraction: number,
): IdOrderChecks {
  const failures = attributes
    .filter((a) => checks[a].fraction < minFraction)
    .map(
      (a) =>
        `${a}: observed ${checks[a].observed} runs, expected about ${Math.round(checks[a].expected)} (${checks[a].fraction.toFixed(3)} of expected)`,
    );
  if (failures.length > 0) {
    throw new IdOrderError(
      `Candidate IDs are blocked, minimum ${minFraction}. ${failures.join("; ")}.`,
    );
  }
  return checks;
}

/** Observed versus expected runs per attribute, in candidate-ID order. Sorts external input; never throws on order. */
export function measureIdOrder(assigned: Assigned[], attributes: OrderAttribute[]): IdOrderChecks {
  return measureOrdered(sortById(assigned), attributes);
}

/** `measureIdOrder` plus the threshold; throws one IdOrderError naming every failing attribute. */
export function verifyIdOrder(
  assigned: Assigned[],
  attributes: OrderAttribute[],
  minFraction: number = GENERATED_MIN_RUN_FRACTION,
): IdOrderChecks {
  return enforce(measureIdOrder(assigned, attributes), attributes, minFraction);
}

function shuffleAssign(rows: AllocationRow[], seed: number, digits: number): Assigned[] {
  // Fisher-Yates: position i in the shuffled list holds the row that gets ID i + 1.
  const random = seededRandom(seed);
  const order = rows.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.map((rowIndex, i) => ({
    ...rows[rowIndex],
    candidateId: `C${String(i + 1).padStart(digits, "0")}`,
  }));
}

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
 *
 * Callers iterate `assigned` only, never the input rows.
 *
 * A uniform shuffle can land on the statistical tail and fail the gate (about
 * 0.35% of seeds at 700 records), so a failing seed is redrawn
 * deterministically with seed + 1, seed + 2, ... up to MAX_SEED_ATTEMPTS.
 * `seedUsed` is the seed that cleared the gate; persist it, and resume with it.
 */
export function assignCandidateIds(args: {
  rows: AllocationRow[];
  seed: number;
  digits?: number;
  attributes?: OrderAttribute[];
}): { assigned: Assigned[]; checks: IdOrderChecks; seedUsed: number } {
  const { rows, seed } = args;
  const attributes = args.attributes ?? DEFAULT_ATTRIBUTES;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error("The seed must be an integer from 0 to 4294967295.");
  }
  const digits = args.digits ?? Math.max(4, String(rows.length).length);
  if (!Number.isInteger(digits) || digits < 4 || digits > 9) {
    throw new Error("The digit width must be an integer from 4 to 9.");
  }
  if (String(rows.length).length > digits) {
    throw new Error(`The digit width ${digits} is too narrow for ${rows.length} candidates.`);
  }

  let last: IdOrderError | undefined;
  for (let attempt = 0; attempt < MAX_SEED_ATTEMPTS; attempt++) {
    const seedUsed = (seed + attempt) % 0x100000000;
    const assigned = shuffleAssign(rows, seedUsed, digits);
    try {
      // Already in ID order, so no re-sort. An unpermuted plan can never leave here.
      const checks = enforce(
        measureOrdered(assigned, attributes),
        attributes,
        GENERATED_MIN_RUN_FRACTION,
      );
      return { assigned, checks, seedUsed };
    } catch (e) {
      if (!(e instanceof IdOrderError)) throw e;
      last = e;
    }
  }
  throw new IdOrderError(
    `No seed cleared the gate in ${MAX_SEED_ATTEMPTS} attempts from ${seed}. ${last?.message ?? ""}`,
  );
}
