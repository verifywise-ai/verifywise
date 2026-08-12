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
import { canonicalPair, LinkCandidate, LinkSignalProvider } from "./types";

/** A pair scoring below this is not worth suggesting. */
export const LINK_SCORE_THRESHOLD = 3;

/** How many new suggestions one recompute may create for one risk. */
export const MAX_LINKS_PER_RISK = 20;

/** A2 appends the structural-graph and embedding providers here. */
const PROVIDERS: LinkSignalProvider[] = [fieldOverlapProvider];

/**
 * Rebuild the stored edges for one risk.
 *
 * Idempotent and safe to run concurrently with a recompute of the other
 * endpoint: writes go through ON CONFLICT, and pruning is driven by the score,
 * which is symmetric.
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

  // 1. Run every provider. One that throws must not cost us the others.
  const merged = new Map<number, LinkCandidate>();
  let anyProviderSucceeded = false;

  for (const provider of PROVIDERS) {
    try {
      const results = await provider.score({ organizationId, subject, candidates });
      anyProviderSucceeded = true;
      for (const candidate of results) {
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
    }
  }

  // Every provider failed: we know nothing, so we must not act on nothing.
  // Writing would zero real scores; deleting would wipe live suggestions.
  if (!anyProviderSucceeded) return;

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
