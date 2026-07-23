import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import { getMrmOrgSettings } from "../../../utils/mrmSettings.utils";
import { getRetentionCutoffQuery, pruneMetricsBatchQuery } from "../../../utils/mrmRetention.utils";
import logger from "../../../utils/logger/fileLogger";

/**
 * MRM (Model Risk Management) — daily metric-retention prune.
 *
 * Removes benign (never warn/breach) mrm_metrics points older than the org's
 * retention window (mrm_org_settings.retention_months, default 25). Points
 * with any warn/breach evaluation are NEVER deleted — the examiner audit
 * trail is untouchable (see utils/mrmRetention.utils.ts for the guard).
 *
 * Batched (10k/batch) and capped (500 batches/run) so a pathological first
 * purge is bounded; the daily job picks up any remainder next day. Idempotent
 * — re-running only deletes what is now past cutoff.
 */

export const PRUNE_BATCH_SIZE = 10_000;
export const PRUNE_MAX_BATCHES = 500;

export interface RetentionPruneSummary {
  organization_id: number;
  cutoff: string;
  deleted: number;
  batches: number;
  capped: boolean;
}

/** Prune one org. */
export async function runRetentionPrune(organizationId: number): Promise<RetentionPruneSummary> {
  const settings = await getMrmOrgSettings(organizationId);
  const cutoff = await getRetentionCutoffQuery(settings.retention_months);

  let deleted = 0;
  let batches = 0;
  let capped = false;

  for (;;) {
    if (batches >= PRUNE_MAX_BATCHES) {
      capped = true;
      break;
    }
    const n = await pruneMetricsBatchQuery(
      organizationId,
      settings.retention_months,
      PRUNE_BATCH_SIZE,
    );
    batches += 1;
    deleted += n;
    if (n < PRUNE_BATCH_SIZE) {
      break;
    }
  }

  return { organization_id: organizationId, cutoff, deleted, batches, capped };
}

/**
 * Prune every org — the BullMQ daily job entry point. Isolated per org so one
 * org's failure cannot block the others (mirrors runRevalidationSweepAllOrgs).
 */
export async function runRetentionPruneAllOrgs(): Promise<void> {
  const organizations = await getAllOrganizationsQuery();
  for (const org of organizations) {
    if (org.id === undefined || org.id === null) continue;
    try {
      const summary = await runRetentionPrune(org.id);
      if (summary.deleted > 0 || summary.capped) {
        logger.info(
          `MRM retention prune org ${org.id}: deleted=${summary.deleted} batches=${summary.batches} capped=${summary.capped} cutoff=${summary.cutoff}`,
        );
      }
    } catch (error) {
      logger.error(`❌ MRM retention prune failed for org ${org.id}:`, error);
    }
  }
}
