/**
 * @fileoverview SQL for the MRM model facts collector.
 *
 * Flat queries, one per table (the breach query also reads mrm_metrics, which
 * holds the model id), each scoped by organization_id; the collector joins them
 * in memory. Validation stages and finding stages are the enum values from
 * domain.layer/enums/mrm.enum.ts.
 *
 * @module services/reporting/collectors/mrmModelFacts.queries
 */

export const MODELS_SQL = `
  SELECT id, model, version, provider, type, status, mrm_tier, mrm_tiered_at,
         mrm_revalidation_flagged, intended_use, limitations, approver
    FROM model_inventories
   WHERE organization_id = :organizationId
   ORDER BY id`;

export const ROLES_SQL = `
  SELECT model_inventory_id, role, user_id
    FROM mrm_model_roles
   WHERE organization_id = :organizationId
     AND user_id IS NOT NULL
   ORDER BY id`;

/** Latest signed-off validation per model. */
export const LATEST_SIGNED_OFF_SQL = `
  SELECT DISTINCT ON (model_inventory_id)
         model_inventory_id, validator_id, outcome, signed_off_at, next_due, report
    FROM mrm_validations
   WHERE organization_id = :organizationId
     AND stage = 'validated'
     AND signed_off_at IS NOT NULL
   ORDER BY model_inventory_id, signed_off_at DESC, id DESC`;

/** At most one per model (idx_mrm_validations_one_active). */
export const OPEN_VALIDATIONS_SQL = `
  SELECT model_inventory_id, next_due
    FROM mrm_validations
   WHERE organization_id = :organizationId
     AND stage <> 'validated'
   ORDER BY id`;

export const FINDINGS_SQL = `
  SELECT model_inventory_id, severity, stage, due_date, remediation_plan, created_at, closed_at
    FROM mrm_findings
   WHERE organization_id = :organizationId
   ORDER BY id`;

export const ACTIVE_THRESHOLDS_SQL = `
  SELECT model_inventory_id, COUNT(*)::int AS count
    FROM mrm_thresholds
   WHERE organization_id = :organizationId
     AND active = true
   GROUP BY model_inventory_id`;

export const LAST_METRIC_SQL = `
  SELECT model_inventory_id, MAX(received_at) AS last_received_at
    FROM mrm_metrics
   WHERE organization_id = :organizationId
   GROUP BY model_inventory_id`;

// Period activity: [:from, :to) with :to the day after the period end.

export const SIGNED_OFF_IN_PERIOD_SQL = `
  SELECT model_inventory_id, COUNT(*)::int AS count
    FROM mrm_validations
   WHERE organization_id = :organizationId
     AND stage = 'validated'
     AND signed_off_at >= :from AND signed_off_at < :to
   GROUP BY model_inventory_id`;

export const BREACHES_IN_PERIOD_SQL = `
  SELECT m.model_inventory_id, COUNT(*)::int AS count
    FROM mrm_metric_evaluations e
    JOIN mrm_metrics m ON m.id = e.metric_id AND m.organization_id = e.organization_id
   WHERE e.organization_id = :organizationId
     AND e.status = 'breach'
     AND e.evaluated_at >= :from AND e.evaluated_at < :to
   GROUP BY m.model_inventory_id`;

export const REVALIDATION_EVENTS_IN_PERIOD_SQL = `
  SELECT model_inventory_id, COUNT(*)::int AS count
    FROM mrm_revalidation_events
   WHERE organization_id = :organizationId
     AND fired_at >= :from AND fired_at < :to
   GROUP BY model_inventory_id`;
