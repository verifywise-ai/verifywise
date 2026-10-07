import { getDuplicateScanRowsQuery, DuplicateScanRow } from "../../utils/riskLink.utils";
import logger from "../../utils/logger/fileLogger";

/**
 * F7 — Risk duplicate candidate report.
 *
 * Read-only: pairs of risks that look like the same risk entered twice,
 * ranked by Jaccard similarity over name+description tokens, with context
 * attached. It writes nothing — no `risk_links` rows, no new relation type.
 * A human reads the report and cleans up by hand (merge executes in phase 2).
 */

/**
 * Tuned on the 33-risk dev org (528 pairs): noise max 0.23, hand-written
 * signal 0.27-0.56, 0/2 false positives. The margin is 0.02 with NO large-org
 * validation — at thousands of risks the noise distribution shifts and
 * stopword-heavy Jaccard (no stoplist; the/and/for/with survive the len>2
 * filter) can cross it. Failure direction is fail-by-missing on a human-read
 * report, which is the safe side. Re-tune on a sampled holdout before raising
 * MAX_DUPLICATE_SCAN; see the F7 design doc §5.
 */
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.25;
/** Band below the threshold whose pair count is logged for re-tuning. */
const NEAR_MISS_BAND = 0.05;
export const MAX_DUPLICATE_SCAN = 2000;
/**
 * A CPU guard, not a sampling knob: past it the report stops being a full scan.
 * 2000 was sized for the 33-risk org (largest bucket 45 pairs) and tripped at
 * 213 risks, where category blocking yields ~6500 pairs — it scored 2000 and
 * found 2 of the 15 matches. Scoring runs ~1µs a pair (6498 pairs in <10ms),
 * so this bounds the worst case, one 700-risk bucket, at roughly 250ms.
 */
export const MAX_DUPLICATE_PAIRS = 250_000;
export const MAX_DUPLICATE_RESULTS = 50;

export interface DuplicateCandidate {
  risk_a: { id: number; risk_name: string; risk_owner: number | null };
  risk_b: { id: number; risk_name: string; risk_owner: number | null };
  similarity: number; // rounded to 2 decimals
  shared_tokens: string[]; // the intersection, for "why"
  also_shares: string[]; // e.g. ["category: Operational risk", "project"]
}

export interface DuplicateReport {
  organization_id: number;
  scanned: number; // risks read
  compared: number; // pairs actually scored
  matched: number; // pairs above the threshold; candidates keeps the closest MAX_DUPLICATE_RESULTS
  truncated: boolean; // the scan stopped early: hit MAX_DUPLICATE_SCAN or MAX_DUPLICATE_PAIRS
  candidates: DuplicateCandidate[];
}

/**
 * Token set from `risk_name + " " + risk_description`: lowercase, strip
 * everything but [a-z0-9 ], split on whitespace, drop tokens of length <= 2
 * ("an", "in", "AI" — but not "bias", "data", "PII", which the cutoff of 3
 * would eat), de-duplicated into a Set.
 */
export function tokeniseRisk(row: DuplicateScanRow): Set<string> {
  return tokeniseText(`${row.risk_name} ${row.risk_description ?? ""}`);
}

/** The rule above on any text; the vendor risk report tokenises its own fields. */
export function tokeniseText(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

export async function findDuplicateCandidates(organizationId: number): Promise<DuplicateReport> {
  const rows = await getDuplicateScanRowsQuery(organizationId, MAX_DUPLICATE_SCAN);
  const tokenSets = rows.map(tokeniseRisk);

  // Block by category: only compare risks sharing at least one value. A risk
  // with 2 categories lands in 2 buckets, so de-duplicate generated pairs —
  // without this a pair sharing both categories is scored (and reported) twice.
  const buckets = new Map<string, number[]>();
  rows.forEach((row, index) => {
    for (const category of row.risk_category) {
      const bucket = buckets.get(category);
      if (bucket) bucket.push(index);
      else buckets.set(category, [index]);
    }
  });

  const seen = new Set<string>();
  const scored: { a: number; b: number; similarity: number; shared: string[] }[] = [];
  let compared = 0;
  let pairCapHit = false;
  let nearMiss = 0;

  for (const bucket of buckets.values()) {
    for (let x = 0; x < bucket.length && !pairCapHit; x++) {
      for (let y = x + 1; y < bucket.length; y++) {
        if (compared >= MAX_DUPLICATE_PAIRS) {
          pairCapHit = true;
          break;
        }
        const a = bucket[x];
        const b = bucket[y];
        const low = rows[a].id < rows[b].id ? a : b;
        const high = rows[a].id < rows[b].id ? b : a;
        const key = `${rows[low].id}:${rows[high].id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const setA = tokenSets[low];
        const setB = tokenSets[high];
        if (setA.size === 0 || setB.size === 0) continue;
        compared += 1;

        const similarity = jaccard(setA, setB);
        if (similarity < DUPLICATE_SIMILARITY_THRESHOLD) {
          if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD - NEAR_MISS_BAND) nearMiss += 1;
          continue;
        }
        const shared = [...setA].filter((token) => setB.has(token)).sort();
        scored.push({ a: low, b: high, similarity, shared });
      }
    }
    if (pairCapHit) break;
  }

  scored.sort((p, q) => q.similarity - p.similarity || rows[p.a].id - rows[q.a].id);

  if (nearMiss > 0) {
    logger.info(
      `duplicate scan org ${organizationId}: ${nearMiss} pairs within ${NEAR_MISS_BAND} below threshold ${DUPLICATE_SIMILARITY_THRESHOLD} (compared ${compared})`,
    );
  }

  const candidates: DuplicateCandidate[] = scored
    .slice(0, MAX_DUPLICATE_RESULTS)
    .map(({ a, b, similarity, shared }) => {
      const rowA = rows[a];
      const rowB = rows[b];
      // Display context only — never affects whether the pair is included.
      const alsoShares: string[] = [];
      for (const category of rowA.risk_category) {
        if (rowB.risk_category.includes(category)) alsoShares.push(`category: ${category}`);
      }
      if (rowA.projects.some((project) => rowB.projects.includes(project))) {
        alsoShares.push("project");
      }
      if (rowA.ai_lifecycle_phase && rowA.ai_lifecycle_phase === rowB.ai_lifecycle_phase) {
        alsoShares.push(`lifecycle: ${rowA.ai_lifecycle_phase}`);
      }
      return {
        risk_a: { id: rowA.id, risk_name: rowA.risk_name, risk_owner: rowA.risk_owner },
        risk_b: { id: rowB.id, risk_name: rowB.risk_name, risk_owner: rowB.risk_owner },
        similarity: Math.round(similarity * 100) / 100,
        shared_tokens: shared,
        also_shares: alsoShares,
      };
    });

  return {
    organization_id: organizationId,
    scanned: rows.length,
    compared,
    matched: scored.length,
    // Only a scan that stopped early is a sample. Keeping the closest 50 of a
    // complete scan is reported through `matched`, not as truncation.
    truncated: pairCapHit || rows.length >= MAX_DUPLICATE_SCAN,
    candidates,
  };
}
