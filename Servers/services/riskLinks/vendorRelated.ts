import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";
import { deleteRiskLinksQuery, updateRiskLinkScoreQuery } from "../../utils/riskLink.utils";
import {
  getRecomputeOwnedVendorLinksQuery,
  getVendorRiskScoringRowsQuery,
  upsertVendorRiskLinkQuery,
  VendorRiskScoringRow,
} from "../../utils/vendorRiskLink.utils";
import { jaccard, tokeniseText } from "./duplicates";
import { isRecomputeOwnedLink, LINK_SCORE_THRESHOLD, MAX_LINKS_PER_RISK } from "./recompute";
import { canonicalPair, LinkSignal } from "./types";

/**
 * `related_to` suggestions between two vendor risks: the same exposure at one
 * vendor, or the same exposure showing up at two vendors. The vendor duplicate
 * report already says that the same risk at two vendors "is a pattern, not a
 * duplicate"; this is where the pattern is recorded.
 *
 * Same contract as the project risk engine (recompute.ts): the same threshold
 * and per-risk cap, upserts that never touch a human decision, and a prune that
 * only removes derived suggestions which fell below the threshold.
 */

/** Jaccard over description + impact at or above which wording counts as similar. */
export const VENDOR_WORDING_SIMILAR = 0.15;
/** ...and at or above which it is strong enough to suggest a link on its own. */
export const VENDOR_WORDING_STRONG = 0.3;
/** One shared word is a coincidence, not a topic. */
export const MIN_SHARED_WORDS = 2;
/** How many shared words the reason names. */
const MAX_DETAIL_WORDS = 6;

/**
 * Words that carry no topic. tokeniseText keeps every word longer than two
 * letters, which is right for the duplicate scan's high threshold but lets
 * "the" and "with" count as overlap at this one.
 */
// prettier-ignore
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "these", "those", "are", "was",
  "were", "has", "have", "had", "not", "its", "our", "can", "could", "may", "might",
  "will", "would", "should", "into", "onto", "than", "then", "they", "their", "them",
  "which", "when", "while", "where", "also", "any", "all", "out", "per", "via", "due",
  "been", "being", "but", "such", "other", "more", "most", "some", "there", "what",
  "through", "about", "after", "before", "over", "under", "within", "without",
]);

/** Topic words of a vendor risk: its description and impact, minus stopwords. */
export function vendorRiskWords(row: VendorRiskScoringRow): Set<string> {
  const words = tokeniseText(`${row.risk_description ?? ""} ${row.impact_description ?? ""}`);
  for (const word of [...words]) if (STOPWORDS.has(word)) words.delete(word);
  return words;
}

export interface VendorPairScore {
  targetVendorRiskId: number;
  score: number;
  reasons: LinkSignal[];
}

/**
 * How related two vendor risks are, or null when they are not.
 *
 * Similar wording is required. Without it, "same vendor", "same framework" and
 * "same use case" would relate every risk of a vendor to every other one —
 * true, and useless. The structural signals only add weight to a pair that is
 * already about the same thing:
 *
 * - similar_wording: 3 when strong, 2 when similar
 * - same_vendor, shared_framework, shared_use_case: 1 each
 *
 * With the shared threshold of 3, strong wording is enough on its own and
 * similar wording needs one structural signal beside it. shared_use_case only
 * counts across vendors: two risks of one vendor share every use case.
 */
export function scoreVendorRiskPair(
  subject: VendorRiskScoringRow,
  candidate: VendorRiskScoringRow,
  subjectWords: Set<string>,
  candidateWords: Set<string>,
): VendorPairScore | null {
  const shared = [...subjectWords].filter((word) => candidateWords.has(word)).sort();
  const similarity = jaccard(subjectWords, candidateWords);
  if (shared.length < MIN_SHARED_WORDS || similarity < VENDOR_WORDING_SIMILAR) return null;

  const reasons: LinkSignal[] = [];
  const wording = similarity >= VENDOR_WORDING_STRONG ? 3 : 2;
  reasons.push({
    signal: "similar_wording",
    weight: wording,
    detail: shared.slice(0, MAX_DETAIL_WORDS).join(", "),
  });
  let score = wording;

  const sameVendor = subject.vendor_id !== null && subject.vendor_id === candidate.vendor_id;
  if (sameVendor) {
    score += 1;
    reasons.push({ signal: "same_vendor", weight: 1 });
  }

  const frameworks = subject.frameworks.filter((name) => candidate.frameworks.includes(name));
  if (frameworks.length > 0) {
    score += 1;
    reasons.push({ signal: "shared_framework", weight: 1, detail: frameworks.join(", ") });
  }

  if (!sameVendor) {
    const theirs = new Set(candidate.use_cases.map((useCase) => useCase.id));
    const useCases = subject.use_cases
      .filter((useCase) => theirs.has(useCase.id))
      .map((useCase) => useCase.name)
      .sort((a, b) => a.localeCompare(b));
    if (useCases.length > 0) {
      score += 1;
      reasons.push({ signal: "shared_use_case", weight: 1, detail: useCases.join(", ") });
    }
  }

  return { targetVendorRiskId: candidate.id, score, reasons };
}

/**
 * Score the subject against every other vendor risk and pick the keepers:
 * at or above the threshold, best first, ties by id, capped. Pure, so the
 * arithmetic is testable without a database.
 */
export function planVendorRiskLinks(
  subject: VendorRiskScoringRow,
  rows: VendorRiskScoringRow[],
): { scored: Map<number, VendorPairScore>; keepers: VendorPairScore[] } {
  const words = new Map(rows.map((row) => [row.id, vendorRiskWords(row)]));
  const subjectWords = words.get(subject.id) ?? vendorRiskWords(subject);
  const scored = new Map<number, VendorPairScore>();
  for (const candidate of rows) {
    if (candidate.id === subject.id) continue;
    const result = scoreVendorRiskPair(subject, candidate, subjectWords, words.get(candidate.id)!);
    if (result) scored.set(candidate.id, result);
  }

  const keepers = [...scored.values()]
    .filter((pair) => pair.score >= LINK_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.targetVendorRiskId - b.targetVendorRiskId)
    .slice(0, MAX_LINKS_PER_RISK);

  return { scored, keepers };
}

/**
 * Rebuild the stored vendor pairs for one vendor risk. Idempotent; a deleted,
 * soft-deleted or foreign vendor risk is left alone (R7), exactly like
 * recomputeRiskLinks.
 */
export async function recomputeVendorRiskLinks(
  organizationId: number,
  vendorRiskId: number,
  /** The org's vendor risk scoring rows, when a batch has already read them. */
  preloadedRows?: VendorRiskScoringRow[],
): Promise<void> {
  const rows = preloadedRows ?? (await getVendorRiskScoringRowsQuery(organizationId));
  const subject = rows.find((row) => row.id === vendorRiskId);
  if (!subject) return;

  const { scored, keepers } = planVendorRiskLinks(subject, rows);
  const keeperIds = new Set(keepers.map((keeper) => keeper.targetVendorRiskId));

  const transaction = await sequelize.transaction();
  try {
    for (const keeper of keepers) {
      const [sourceVendorRiskId, targetVendorRiskId] = canonicalPair(
        vendorRiskId,
        keeper.targetVendorRiskId,
      );
      await upsertVendorRiskLinkQuery(
        {
          organizationId,
          sourceVendorRiskId,
          targetVendorRiskId,
          score: keeper.score,
          reasons: keeper.reasons,
        },
        transaction,
      );
    }

    const incident = await getRecomputeOwnedVendorLinksQuery(
      organizationId,
      vendorRiskId,
      transaction,
    );
    const pruneIds: number[] = [];
    for (const existing of incident) {
      // The query returns only derived pairs; this is a backstop so a user-made
      // vendor pair always keeps its own (empty) reasons and score.
      if (!isRecomputeOwnedLink(existing)) continue;
      const otherId =
        existing.source_vendor_risk_id === vendorRiskId
          ? existing.target_vendor_risk_id!
          : existing.source_vendor_risk_id!;
      if (keeperIds.has(otherId)) continue;

      const pair = scored.get(otherId);
      const score = pair?.score ?? 0;

      // Same rule as the project engine: the cap gates creation, never
      // deletion, and only an undecided derived row may be removed.
      if (existing.status === "suggested" && score < LINK_SCORE_THRESHOLD) {
        pruneIds.push(existing.id);
        continue;
      }
      await updateRiskLinkScoreQuery(
        existing.id,
        organizationId,
        score,
        pair?.reasons ?? [],
        transaction,
      );
    }

    if (pruneIds.length > 0) {
      await deleteRiskLinksQuery(pruneIds, organizationId, transaction);
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    logger.error(
      `[riskLinks] vendor pair recompute failed for vendor risk ${vendorRiskId} (org ${organizationId})`,
      error,
    );
    throw error;
  }
}

/**
 * The vendor risk counterpart of recomputeRiskLinksBatch: one read of the
 * org's vendor risk scoring rows for the whole batch, risks one at a time, and
 * the ids that failed returned for the caller to retry on their own.
 */
export async function recomputeVendorRiskLinksBatch(
  organizationId: number,
  vendorRiskIds: number[],
): Promise<number[]> {
  const rows = await getVendorRiskScoringRowsQuery(organizationId);
  const failed: number[] = [];
  for (const vendorRiskId of vendorRiskIds) {
    try {
      await recomputeVendorRiskLinks(organizationId, vendorRiskId, rows);
    } catch (error) {
      logger.error(
        `[riskLinks] batch recompute failed for vendor risk ${vendorRiskId} (org ${organizationId})`,
        error,
      );
      failed.push(vendorRiskId);
    }
  }
  return failed;
}
