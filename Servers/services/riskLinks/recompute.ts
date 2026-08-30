import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";
import {
  deleteRiskLinksQuery,
  getIncidentLinksQuery,
  getRiskScoringRowsQuery,
  updateRiskLinkScoreQuery,
  upsertRiskLinkQuery,
} from "../../utils/riskLink.utils";
import { fieldOverlapProvider } from "./providers/fieldOverlap";
import { structuralGraphProvider } from "./providers/structuralGraph";
import { canonicalPair, LinkCandidate, LinkSignalProvider } from "./types";

/** A pair scoring below this is not worth suggesting. */
export const LINK_SCORE_THRESHOLD = 3;

/** How many new suggestions one recompute may create for one risk. */
export const MAX_LINKS_PER_RISK = 20;

/** A2b appends the embedding provider here. */
const PROVIDERS: LinkSignalProvider[] = [fieldOverlapProvider, structuralGraphProvider];

/**
 * Rebuild the stored edges for one risk.
 *
 * Idempotent, and safe to run concurrently with a recompute of the other
 * endpoint: writes go through ON CONFLICT, and pruning is driven by the score,
 * which is symmetric. Three at once can still deadlock on a triangle — see the
 * retry note on `enqueueRiskLinkRecompute`.
 *
 * Rejects if any provider throws. With more than one provider, finishing on a
 * partial set would strip the missing tier's points from every pair and prune
 * the suggestions that then fell below the threshold — a transient error would
 * silently delete real data. Stale edges are better than wrong ones.
 */
export async function recomputeRiskLinks(
  organizationId: number,
  riskId: number,
): Promise<void> {
  const rows = await getRiskScoringRowsQuery(organizationId);
  const subject = rows.find((row) => row.id === riskId);
  // Deleted, archived, or another org's risk. R7: leave its edges alone.
  if (!subject) return;

  const candidates = rows.filter((row) => row.id !== riskId);

  // 1. Run every provider. Any one that throws aborts the run.
  const merged = new Map<number, LinkCandidate>();
  const candidateIds = new Set(candidates.map((row) => row.id));

  for (const provider of PROVIDERS) {
    try {
      const results = await provider.score({ organizationId, subject, candidates });
      for (const candidate of results) {
        // Tier 1 and up issue their own SQL. `candidates` is every other active
        // risk in this org, so a target outside it is another org's risk or a
        // soft-deleted one — never an edge we may write.
        if (!candidateIds.has(candidate.targetRiskId)) continue;

        const existing = merged.get(candidate.targetRiskId);
        if (existing) {
          existing.score += candidate.score;
          existing.reasons.push(...candidate.reasons);
        } else {
          merged.set(candidate.targetRiskId, { ...candidate, reasons: [...candidate.reasons] });
        }
      }
    } catch (error) {
      logger.error(
        `[riskLinks] provider ${provider.name} failed for risk ${riskId} (org ${organizationId})`,
        error,
      );
      throw error;
    }
  }

  // 2. Keepers: at or above threshold, best first, ties by target id.
  const keepers = [...merged.values()]
    .filter((candidate) => candidate.score >= LINK_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.targetRiskId - b.targetRiskId)
    .slice(0, MAX_LINKS_PER_RISK);
  const keeperIds = new Set(keepers.map((keeper) => keeper.targetRiskId));

  // 3. One transaction for the whole rewrite.
  const transaction = await sequelize.transaction();
  try {
    for (const keeper of keepers) {
      const [sourceRiskId, targetRiskId] = canonicalPair(riskId, keeper.targetRiskId);
      await upsertRiskLinkQuery(
        { organizationId, sourceRiskId, targetRiskId, score: keeper.score, reasons: keeper.reasons },
        transaction,
      );
    }

    const incident = await getIncidentLinksQuery(organizationId, riskId, transaction);
    const pruneIds: number[] = [];

    for (const existing of incident) {
      // C4 cross-entity inheritance is manual-only and has no project-risk
      // target column. Recompute owns related_to suggestions, so leave these
      // rows and their human decision untouched.
      if (existing.target_risk_id == null) continue;

      const otherId =
        existing.source_risk_id === riskId ? existing.target_risk_id : existing.source_risk_id;
      // Already refreshed by the upsert above.
      if (keeperIds.has(otherId)) continue;

      const candidate = merged.get(otherId);
      const score = candidate?.score ?? 0;

      // Prune only what fell below the threshold. The cap gates creation, never
      // deletion: score is symmetric but top-N membership is not, so pruning on
      // the cap would let two risks fight over the same edge on every save.
      const prunable =
        existing.source === "derived" &&
        existing.status === "suggested" &&
        score < LINK_SCORE_THRESHOLD;

      if (prunable) {
        pruneIds.push(existing.id);
        continue;
      }

      // A decided edge, or one the cap excluded. Keep the row, tell the truth
      // about its score.
      await updateRiskLinkScoreQuery(
        existing.id,
        organizationId,
        score,
        candidate?.reasons ?? [],
        transaction,
      );
    }

    if (pruneIds.length > 0) {
      await deleteRiskLinksQuery(pruneIds, organizationId, transaction);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
