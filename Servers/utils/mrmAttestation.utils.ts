import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import {
  MrmFindingSeverity,
  MrmFindingStage,
  MrmValidationStage,
} from "../domain.layer/enums/mrm.enum";

/**
 * MRM (Model Risk Management) — Branch 3 (portfolio summary & attestation)
 * data-access. Read-only aggregate roll-ups across the fleet for the
 * board/examiner attestation artifact. No writes.
 *
 * Every query is tenant-isolated: `WHERE organization_id = :organizationId`.
 * Table names are UNQUALIFIED — the `search_path = verifywise` afterConnect hook
 * resolves the schema. Thin controllers call into these functions; all SQL lives
 * here per the backend Layer Flow.
 *
 * "Open" validation = stage <> validated. "Overdue" = an open validation whose
 * next_due has passed. "Monitoring active" for a model = it has at least one
 * active threshold. A tier's attestation is BLOCKED when it has any gap:
 * untiered-but-present is not applicable (rows are grouped by assigned tier),
 * an unvalidated model, an overdue validation, or an open critical/high finding.
 */

// A finding is "open" for attestation purposes when it has not reached a
// terminal, verified-closed state. resolved/closed still count until verified.
const OPEN_FINDING_STAGES = [
  MrmFindingStage.OPEN,
  MrmFindingStage.REMEDIATION_PLANNED,
  MrmFindingStage.IN_PROGRESS,
  MrmFindingStage.RESOLVED,
];

export interface AttestationTierRow {
  tier: string;
  models: number;
  tiering_current: number;
  validated: number;
  monitoring_active: number;
  open_findings: number;
  critical_high_findings: number;
  attestation_status: "ok" | "blocked";
}

export interface AttestationSummary {
  generated_at: string;
  models_total: number;
  models_untiered: number;
  models_by_tier: Record<string, number>;
  validation_coverage: {
    validated: number;
    in_review: number;
    not_started: number;
    overdue: number;
  };
  open_findings_by_severity: Record<string, number>;
  overdue_validations: number;
  per_tier: AttestationTierRow[];
  attestation_status: "ok" | "blocked";
}

/** Models-by-tier counts (assigned tiers only) + untiered/total. */
const getModelTierCountsQuery = async (
  organizationId: number,
): Promise<{ mrm_tier: string | null; count: number }[]> => {
  return (await sequelize.query(
    `SELECT mrm_tier, COUNT(*)::int AS count
       FROM model_inventories
      WHERE organization_id = :organizationId
      GROUP BY mrm_tier`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  )) as { mrm_tier: string | null; count: number }[];
};

/**
 * Validation coverage counts — per MODEL, not per validation row. Counting rows
 * lets a model with both a validated and an in-review validation land in two
 * buckets at once; the buckets must partition the fleet the same way the
 * per-tier query does (which already uses COUNT(DISTINCT mi.id) FILTER(...)).
 *
 * Bucket definitions (each model counted at most once per bucket, and the four
 * flags are independent — a model can be e.g. both `validated` and `overdue` if
 * it has a validated history plus an open overdue re-validation, which mirrors
 * the per-tier roll-up semantics):
 *   - validated:   the model has >= 1 validated validation.
 *   - in_review:   the model has >= 1 open validation in review
 *                  (in_validation or under_review).
 *   - not_started: the model has >= 1 open validation still not started.
 *   - overdue:     the model has >= 1 open validation whose next_due has passed.
 * The per-model roll-up is done over a GROUP BY model_inventory_id inner query,
 * then the outer aggregate counts how many models fall into each bucket.
 */
const getValidationCoverageQuery = async (
  organizationId: number,
  now: Date,
): Promise<{
  validated: number;
  in_review: number;
  not_started: number;
  overdue: number;
}> => {
  const rows = (await sequelize.query(
    `SELECT
        COUNT(*) FILTER (WHERE validated_count > 0)::int AS validated,
        COUNT(*) FILTER (WHERE in_review_count > 0)::int AS in_review,
        COUNT(*) FILTER (WHERE not_started_count > 0)::int AS not_started,
        COUNT(*) FILTER (WHERE overdue_count > 0)::int AS overdue
       FROM (
         SELECT model_inventory_id,
                COUNT(*) FILTER (WHERE stage = :validated) AS validated_count,
                COUNT(*) FILTER (WHERE stage IN (:inValidation, :underReview)) AS in_review_count,
                COUNT(*) FILTER (WHERE stage = :notStarted) AS not_started_count,
                COUNT(*) FILTER (WHERE stage <> :validated AND next_due IS NOT NULL AND next_due <= :now) AS overdue_count
           FROM mrm_validations
          WHERE organization_id = :organizationId
          GROUP BY model_inventory_id
       ) per_model`,
    {
      replacements: {
        organizationId,
        now,
        validated: MrmValidationStage.VALIDATED,
        inValidation: MrmValidationStage.IN_VALIDATION,
        underReview: MrmValidationStage.UNDER_REVIEW,
        notStarted: MrmValidationStage.NOT_STARTED,
      },
      type: QueryTypes.SELECT,
    },
  )) as {
    validated: number;
    in_review: number;
    not_started: number;
    overdue: number;
  }[];
  return rows[0] ?? { validated: 0, in_review: 0, not_started: 0, overdue: 0 };
};

/** Open findings counted by severity (open = not verified-closed). */
const getOpenFindingsBySeverityQuery = async (
  organizationId: number,
): Promise<{ severity: string; count: number }[]> => {
  return (await sequelize.query(
    `SELECT severity, COUNT(*)::int AS count
       FROM mrm_findings
      WHERE organization_id = :organizationId
        AND stage IN (:openStages)
      GROUP BY severity`,
    {
      replacements: {
        organizationId,
        openStages: OPEN_FINDING_STAGES,
      },
      type: QueryTypes.SELECT,
    },
  )) as { severity: string; count: number }[];
};

/**
 * Per-tier attestation breakdown. One row per assigned tier with the counts the
 * attestation table needs. Computed with correlated aggregates over the fleet so
 * the tier grouping and its coverage numbers come back together and org-scoped.
 */
const getPerTierAttestationQuery = async (
  organizationId: number,
  now: Date,
): Promise<
  {
    tier: string;
    models: number;
    tiering_current: number;
    validated: number;
    monitoring_active: number;
    open_findings: number;
    critical_high_findings: number;
    overdue: number;
  }[]
> => {
  return (await sequelize.query(
    `SELECT
        mi.mrm_tier AS tier,
        COUNT(DISTINCT mi.id)::int AS models,
        COUNT(DISTINCT mi.id) FILTER (WHERE mi.mrm_tiered_at IS NOT NULL)::int AS tiering_current,
        COUNT(DISTINCT mi.id) FILTER (WHERE v.validated_count > 0)::int AS validated,
        COUNT(DISTINCT mi.id) FILTER (WHERE t.active_count > 0)::int AS monitoring_active,
        COALESCE(SUM(f.open_findings), 0)::int AS open_findings,
        COALESCE(SUM(f.critical_high_findings), 0)::int AS critical_high_findings,
        COUNT(DISTINCT mi.id) FILTER (WHERE v.overdue_count > 0)::int AS overdue
       FROM model_inventories mi
       LEFT JOIN (
         SELECT model_inventory_id,
                COUNT(*) FILTER (WHERE stage = :validated) AS validated_count,
                COUNT(*) FILTER (WHERE stage <> :validated AND next_due IS NOT NULL AND next_due <= :now) AS overdue_count
           FROM mrm_validations
          WHERE organization_id = :organizationId
          GROUP BY model_inventory_id
       ) v ON v.model_inventory_id = mi.id
       LEFT JOIN (
         SELECT model_inventory_id, COUNT(*) FILTER (WHERE active) AS active_count
           FROM mrm_thresholds
          WHERE organization_id = :organizationId
          GROUP BY model_inventory_id
       ) t ON t.model_inventory_id = mi.id
       LEFT JOIN (
         SELECT model_inventory_id,
                COUNT(*) FILTER (WHERE stage IN (:openStages)) AS open_findings,
                COUNT(*) FILTER (WHERE stage IN (:openStages) AND severity IN (:critical, :high)) AS critical_high_findings
           FROM mrm_findings
          WHERE organization_id = :organizationId
          GROUP BY model_inventory_id
       ) f ON f.model_inventory_id = mi.id
      WHERE mi.organization_id = :organizationId
        AND mi.mrm_tier IS NOT NULL
      GROUP BY mi.mrm_tier
      ORDER BY mi.mrm_tier ASC`,
    {
      replacements: {
        organizationId,
        now,
        validated: MrmValidationStage.VALIDATED,
        openStages: OPEN_FINDING_STAGES,
        critical: MrmFindingSeverity.CRITICAL,
        high: MrmFindingSeverity.HIGH,
      },
      type: QueryTypes.SELECT,
    },
  )) as {
    tier: string;
    models: number;
    tiering_current: number;
    validated: number;
    monitoring_active: number;
    open_findings: number;
    critical_high_findings: number;
    overdue: number;
  }[];
};

/**
 * Assemble the full attestation summary for an org: fleet counts, validation
 * coverage, open findings by severity, and the per-tier attestation table with a
 * blocked/ok status per tier and overall.
 */
export const getAttestationSummary = async (
  organizationId: number,
): Promise<AttestationSummary> => {
  const now = new Date();
  const [tierCounts, coverage, findings, perTierRaw] = await Promise.all([
    getModelTierCountsQuery(organizationId),
    getValidationCoverageQuery(organizationId, now),
    getOpenFindingsBySeverityQuery(organizationId),
    getPerTierAttestationQuery(organizationId, now),
  ]);

  const modelsByTier: Record<string, number> = {};
  let modelsUntiered = 0;
  let modelsTotal = 0;
  for (const row of tierCounts) {
    modelsTotal += row.count;
    if (row.mrm_tier === null) {
      modelsUntiered += row.count;
    } else {
      modelsByTier[row.mrm_tier] = row.count;
    }
  }

  const openFindingsBySeverity: Record<string, number> = {
    [MrmFindingSeverity.CRITICAL]: 0,
    [MrmFindingSeverity.HIGH]: 0,
    [MrmFindingSeverity.MEDIUM]: 0,
    [MrmFindingSeverity.LOW]: 0,
  };
  for (const row of findings) {
    openFindingsBySeverity[row.severity] = row.count;
  }

  const perTier: AttestationTierRow[] = perTierRaw.map((r) => {
    // A tier is blocked when any model is untiered-in-time (tiering not current),
    // unvalidated, overdue, or carries an open CRITICAL/HIGH finding. Total open
    // findings (medium/low included) are informational only and do NOT block —
    // only critical/high do, per spec.
    const allTieringCurrent = r.tiering_current === r.models;
    const allValidated = r.validated === r.models;
    const noneOverdue = r.overdue === 0;
    const blocked =
      !allTieringCurrent || !allValidated || !noneOverdue || r.critical_high_findings > 0;
    return {
      tier: r.tier,
      models: r.models,
      tiering_current: r.tiering_current,
      validated: r.validated,
      monitoring_active: r.monitoring_active,
      open_findings: r.open_findings,
      critical_high_findings: r.critical_high_findings,
      attestation_status: blocked ? "blocked" : "ok",
    };
  });

  const overallBlocked =
    modelsUntiered > 0 || perTier.some((t) => t.attestation_status === "blocked");

  return {
    generated_at: now.toISOString(),
    models_total: modelsTotal,
    models_untiered: modelsUntiered,
    models_by_tier: modelsByTier,
    validation_coverage: coverage,
    open_findings_by_severity: openFindingsBySeverity,
    overdue_validations: coverage.overdue,
    per_tier: perTier,
    attestation_status: overallBlocked ? "blocked" : "ok",
  };
};
