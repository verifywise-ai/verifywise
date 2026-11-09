/**
 * Detect protected attributes assigned in contiguous blocks of the input
 * order.
 *
 * Why this exists. A corpus that assigns demographics in contiguous blocks
 * while generation runs in order lets anything that drifted over the run land
 * on one category instead of spreading across all of them. That produced a
 * false race finding on a real engagement: impact ratio 0.8050, p = 0.0010,
 * from a generator defect rather than from the tool under audit.
 *
 * Neither balance checks nor blueprint-independence tests can see it. Balance
 * is perfect while ordering is broken, and blueprints are byte-identical under
 * demographic permutation because the defect is in order, not content.
 *
 * A clean impact ratio on a blocked attribute is not reassurance either. On
 * that corpus, sex was the most perfectly blocked attribute (one split at the
 * midpoint) and returned 0.9770, because a two-block split averages position
 * effects over half the corpus each and they cancel.
 */

/** Number of maximal consecutive stretches of equal values. */
export function countRuns(values: string[]): number {
  if (!Array.isArray(values)) throw new TypeError("countRuns needs an array of values.");
  if (values.length === 0) return 0;
  let runs = 1;
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== values[i - 1]) runs += 1;
  }
  return runs;
}

/**
 * Expected runs under random ordering: `n + 1 - sum(ni^2) / n`.
 *
 * NOT `n * (1 - 1/k)`, which assumes equal group sizes. That form rejected a
 * correct interleave when it was used here before.
 */
export function expectedRuns(values: string[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let sumSquares = 0;
  for (const c of counts.values()) sumSquares += c * c;
  return n + 1 - sumSquares / n;
}

export interface OrderFinding {
  attribute: string;
  observedRuns: number;
  expectedRuns: number;
  ratio: number;
  blocked: boolean;
}

/**
 * Observed-versus-expected runs per attribute.
 *
 * `blocked` is true below 0.5 of expected. A correct interleave sits near
 * 1.0; the real defect measured 14 observed against about 4,286 expected,
 * a ratio of 0.003.
 */
export function checkIdOrder(
  records: Record<string, unknown>[],
  attributes: string[],
): OrderFinding[] {
  return attributes.map((attribute) => {
    const values = records.map((r) => String(r[attribute] ?? ""));
    const observed = countRuns(values);
    const expected = expectedRuns(values);
    const ratio = expected > 0 ? observed / expected : 1;
    return {
      attribute,
      observedRuns: observed,
      expectedRuns: expected,
      ratio,
      blocked: expected > 0 && ratio < 0.5,
    };
  });
}
