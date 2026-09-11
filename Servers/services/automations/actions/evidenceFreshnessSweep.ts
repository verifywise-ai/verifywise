import { sequelize } from "../../../database/db";
import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import { getStaleEvidenceRiskIdsQuery } from "../../../utils/evidenceHub.utils";
import { notifyEvidenceStale } from "../../inAppNotification.service";
import { recordSnapshotIfChanged } from "../../../utils/history/riskHistory.utils";
import logger from "../../../utils/logger/fileLogger";

/**
 * Evidence freshness — nightly sweep.
 *
 * Flags risks whose mapped evidence has gone stale (past its explicit expiry
 * date, or untouched for EVIDENCE_FRESHNESS_DAYS) by setting
 * risks.evidence_stale_at, and clears the flag when nothing mapped is stale
 * anymore. Transition detection is the WHERE clause, not application code:
 * both UPDATEs filter on the current flag state and RETURNING hands back
 * exactly the rows that transitioned, so a re-run over unchanged state writes
 * nothing and notifies nothing. There is deliberately no DB trigger here —
 * the sweep owns both the set and the clear.
 *
 * Freshly flagged risks sitting at 'Completed' are downgraded to
 * 'Requires review': stale evidence contradicts a completed mitigation, and
 * 'Completed' is the only status that claim is made from — every other status
 * is already open or parked, so there is nothing to walk back. The clear path
 * deliberately does NOT restore it. Re-attesting a mitigation as complete is a
 * human act; an unattended 05:00 job promoting a risk back to 'Completed' is a
 * far more dangerous write than leaving a review flag up one day too long.
 */

export interface EvidenceFreshnessSweepSummary {
  organization_id: number;
  stale: number; // risks newly flagged this run
  downgraded: number; // flagged risks knocked off 'Completed' this run
  cleared: number; // risks whose flag was lifted this run
  notified: number;
}

interface FlaggedRiskRow {
  id: number;
  risk_name: string;
  risk_owner: number | null;
}

/** Sweep one org. Each notification is isolated so one failure cannot poison the rest. */
export async function runEvidenceFreshnessSweep(
  organizationId: number,
  now: Date = new Date(),
): Promise<EvidenceFreshnessSweepSummary> {
  const staleRiskIds = await getStaleEvidenceRiskIdsQuery(organizationId, now);

  // Flag: only rows not already flagged. Skipped entirely when empty —
  // id IN () is a syntax error in Postgres.
  let flagged: FlaggedRiskRow[] = [];
  if (staleRiskIds.length > 0) {
    const [flaggedRows] = (await sequelize.query(
      `UPDATE risks
          SET evidence_stale_at = :now
        WHERE organization_id = :organizationId
          AND is_deleted = false
          AND id IN (:staleRiskIds)
          AND evidence_stale_at IS NULL
       RETURNING id, risk_name, risk_owner`,
      { replacements: { organizationId, staleRiskIds, now } },
    )) as [FlaggedRiskRow[], number];
    flagged = flaggedRows;
  }

  // Downgrade the freshly flagged rows that still claim 'Completed'. Separate
  // UPDATE rather than a CASE in the one above: RETURNING hands back the NEW
  // value, so an exact count of what changed is only available this way. No
  // is_deleted filter needed — these ids came out of the UPDATE that applied it.
  let downgraded: { id: number }[] = [];
  if (flagged.length > 0) {
    const [downgradedRows] = (await sequelize.query(
      `UPDATE risks
          SET mitigation_status = 'Requires review'
        WHERE organization_id = :organizationId
          AND id IN (:flaggedIds)
          AND mitigation_status = 'Completed'
       RETURNING id`,
      {
        replacements: {
          organizationId,
          flaggedIds: flagged.map((risk) => risk.id),
        },
      },
    )) as [{ id: number }[], number];
    downgraded = downgradedRows;
  }

  // Clear: only flagged rows that no longer qualify. Without the NOT IN
  // clause when there is nothing stale, so an empty sweep still heals.
  const [clearedRows] =
    staleRiskIds.length > 0
      ? ((await sequelize.query(
          `UPDATE risks
              SET evidence_stale_at = NULL
            WHERE organization_id = :organizationId
              AND evidence_stale_at IS NOT NULL
              AND id NOT IN (:staleRiskIds)
           RETURNING id`,
          { replacements: { organizationId, staleRiskIds } },
        )) as [{ id: number }[], number])
      : ((await sequelize.query(
          `UPDATE risks
              SET evidence_stale_at = NULL
            WHERE organization_id = :organizationId
              AND evidence_stale_at IS NOT NULL
           RETURNING id`,
          { replacements: { organizationId } },
        )) as [{ id: number }[], number]);

  // Notify only freshly flagged rows — once per transition, not once per
  // night. A risk with no owner is flagged but not notified.
  let notified = 0;
  for (const risk of flagged) {
    try {
      if (risk.risk_owner == null) continue;
      try {
        await notifyEvidenceStale(organizationId, {
          id: risk.id,
          risk_name: risk.risk_name,
          risk_owner: risk.risk_owner,
        });
        notified += 1;
      } catch (error) {
        logger.error(
          `❌ Evidence-stale notification failed for org ${organizationId} risk ${risk.id}:`,
          error,
        );
      }
    } catch (error) {
      logger.error(
        `❌ Evidence freshness sweep failed for org ${organizationId} risk ${risk.id}:`,
        error,
      );
    }
  }

  // The downgrade is a raw UPDATE, so it bypasses the snapshot call the normal
  // risk create/update paths make — without this the mitigation_status chart
  // would keep showing the pre-sweep distribution. recordSnapshotIfChanged is
  // self-guarding (it no-ops when the distribution is unchanged), so there is
  // nothing to condition on here. A history failure must not fail the sweep.
  try {
    await recordSnapshotIfChanged("mitigation_status", organizationId);
  } catch (error) {
    logger.error(
      `❌ Evidence freshness sweep history snapshot failed for org ${organizationId}:`,
      error,
    );
  }

  return {
    organization_id: organizationId,
    stale: flagged.length,
    downgraded: downgraded.length,
    cleared: clearedRows.length,
    notified,
  };
}

/**
 * Sweep every org — the BullMQ daily job entry point. Isolated per org so one
 * org's failure cannot block the others.
 */
export async function runEvidenceFreshnessSweepAllOrgs(): Promise<void> {
  const now = new Date();
  const organizations = await getAllOrganizationsQuery();
  for (const org of organizations) {
    if (org.id === undefined || org.id === null) continue;
    try {
      const summary = await runEvidenceFreshnessSweep(org.id, now);
      if (summary.stale > 0 || summary.cleared > 0) {
        logger.info(
          `Evidence freshness sweep org ${org.id}: stale=${summary.stale} downgraded=${summary.downgraded} cleared=${summary.cleared} notified=${summary.notified}`,
        );
      }
    } catch (error) {
      logger.error(`❌ Evidence freshness sweep failed for org ${org.id}:`, error);
    }
  }
}
