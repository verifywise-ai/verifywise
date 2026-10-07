import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";
import {
  deleteRiskLinksQuery,
  getRecomputeOwnedLinksQuery,
  getRiskScoringRowsQuery,
  updateRiskLinkScoreQuery,
  upsertRiskLinkQuery,
} from "../../utils/riskLink.utils";
import { fieldOverlapProvider } from "./providers/fieldOverlap";
import { structuralGraphProvider } from "./providers/structuralGraph";
import {
  canonicalPair,
  LinkCandidate,
  LinkSignalProvider,
  RiskLinkRow,
  RiskScoringRow,
} from "./types";

/** A pair scoring below this is not worth suggesting. */
export const LINK_SCORE_THRESHOLD = 3;

/** How many new suggestions one recompute may create for one risk. */
export const MAX_LINKS_PER_RISK = 20;

/** A2b appends the embedding provider here. */
const PROVIDERS: LinkSignalProvider[] = [fieldOverlapProvider, structuralGraphProvider];

/**
 * Whether recompute owns this edge: a machine-scored `related_to` suggestion.
 *
 * Everything else carries reasons recompute did not write and must not touch:
 * an `inherits_from` edge proposed by the direction agent holds the agent's
 * justification (a `hierarchy` / `cross_entity_hierarchy` signal, which the
 * dismissal analytics count), and a `user` row records a human's own link.
 * Rescoring either would overwrite those reasons with the `related_to` score.
 * A `derived` row a human has since confirmed or dismissed is still owned:
 * its reasons are machine reasons, and only its status is the human's.
 */
export const isRecomputeOwnedLink = (link: Pick<RiskLinkRow, "relation_type" | "source">) =>
  link.relation_type === "related_to" && link.source === "derived";

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
  /** The org's scoring rows, when a batch has already read them. */
  preloadedRows?: RiskScoringRow[],
): Promise<void> {
  const rows = preloadedRows ?? (await getRiskScoringRowsQuery(organizationId));
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
        {
          organizationId,
          sourceRiskId,
          targetRiskId,
          score: keeper.score,
          reasons: keeper.reasons,
        },
        transaction,
      );
    }

    const incident = await getRecomputeOwnedLinksQuery(organizationId, riskId, transaction);
    const pruneIds: number[] = [];

    for (const existing of incident) {
      // The query already returns only derived related_to rows, so cross-entity
      // (null target), agent, user and inherits_from rows never reach here. The
      // null check narrows the type; the ownership check is a cheap backstop.
      if (existing.target_risk_id == null || existing.source_risk_id == null) continue;
      if (!isRecomputeOwnedLink(existing)) continue;

      const otherId =
        existing.source_risk_id === riskId ? existing.target_risk_id : existing.source_risk_id;
      // Already refreshed by the upsert above.
      if (keeperIds.has(otherId)) continue;

      const candidate = merged.get(otherId);
      const score = candidate?.score ?? 0;

      // Prune only what fell below the threshold. The cap gates creation, never
      // deletion: score is symmetric but top-N membership is not, so pruning on
      // the cap would let two risks fight over the same edge on every save.
      const prunable = existing.status === "suggested" && score < LINK_SCORE_THRESHOLD;

      if (prunable) {
        pruneIds.push(existing.id);
        continue;
      }

      // A decided derived edge, or one the cap excluded. Keep the row, tell the truth
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

/**
 * Recompute many risks with one read of the org's scoring rows. One job per
 * risk re-read every active risk in the org for each of them, so a full scan
 * cost N whole-org reads. The rows are risk fields, which recomputing links
 * does not change, so one read serves the whole batch.
 *
 * Runs the risks one at a time, which also rules out the deadlocks concurrent
 * per-risk jobs could hit. A risk that fails is logged and returned rather than
 * failing the batch, so the caller can retry it on its own.
 */
export async function recomputeRiskLinksBatch(
  organizationId: number,
  riskIds: number[],
): Promise<number[]> {
  const rows = await getRiskScoringRowsQuery(organizationId);
  const failed: number[] = [];
  for (const riskId of riskIds) {
    try {
      await recomputeRiskLinks(organizationId, riskId, rows);
    } catch (error) {
      logger.error(
        `[riskLinks] batch recompute failed for risk ${riskId} (org ${organizationId})`,
        error,
      );
      failed.push(riskId);
    }
  }
  return failed;
}
