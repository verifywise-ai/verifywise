import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  LinkSignal,
  RiskLinkRow,
  RiskLinkStatus,
  RiskScoringRow,
} from "../services/riskLinks/types";

/**
 * pg hands NUMERIC back as a string and can hand JSONB / JSON_AGG output back
 * as a string too. Everything crossing this boundary is coerced here so no
 * caller ever compares a number to "5.000".
 */
const toNumber = (value: unknown): number =>
  typeof value === "number" ? value : Number(value ?? 0);

const toJsonArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const toLinkRow = (row: any): RiskLinkRow => ({
  id: row.id,
  organization_id: row.organization_id,
  source_risk_id: row.source_risk_id,
  target_risk_id: row.target_risk_id,
  relation_type: row.relation_type,
  status: row.status,
  source: row.source,
  score: toNumber(row.score),
  reasons: toJsonArray<LinkSignal>(row.reasons),
  decided_at: row.decided_at ?? null,
  last_computed_at: row.last_computed_at ?? null,
});

/**
 * Every active risk in the org, reduced to the columns tier-0 scoring reads.
 *
 * risk_category is enum_projectrisks_risk_category[] — a custom enum array whose
 * OID node-pg has no parser for, so it is cast to text[] to guarantee a JS array.
 */
export async function getRiskScoringRowsQuery(
  organizationId: number,
): Promise<RiskScoringRow[]> {
  const rows = await sequelize.query(
    `SELECT r.id,
            r.risk_category::text[] AS risk_category,
            r.controls_mapping,
            r.assessment_mapping,
            r.ai_lifecycle_phase::text AS ai_lifecycle_phase,
            COALESCE(
              JSON_AGG(DISTINCT pr.project_id) FILTER (WHERE pr.project_id IS NOT NULL),
              '[]'
            ) AS projects
     FROM risks r
     LEFT JOIN projects_risks pr
       ON r.id = pr.risk_id AND pr.organization_id = :organizationId
     WHERE r.organization_id = :organizationId AND r.is_deleted = false
     GROUP BY r.id`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    risk_category: Array.isArray(row.risk_category) ? row.risk_category : null,
    controls_mapping: row.controls_mapping ?? null,
    assessment_mapping: row.assessment_mapping ?? null,
    ai_lifecycle_phase: row.ai_lifecycle_phase ?? null,
    projects: toJsonArray<number>(row.projects),
  }));
}

/** Every active risk id in the org — the fan-out list for a full recompute. */
export async function getActiveRiskIdsQuery(organizationId: number): Promise<number[]> {
  const rows = await sequelize.query(
    `SELECT id FROM risks
     WHERE organization_id = :organizationId AND is_deleted = false
     ORDER BY id ASC`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  );
  return (rows as any[]).map((row) => row.id);
}

/** Every stored edge touching this risk, in either direction, any status. */
export async function getIncidentLinksQuery(
  organizationId: number,
  riskId: number,
  transaction?: Transaction,
): Promise<RiskLinkRow[]> {
  const rows = await sequelize.query(
    `SELECT * FROM risk_links
     WHERE organization_id = :organizationId
       AND (source_risk_id = :riskId OR target_risk_id = :riskId)`,
    {
      replacements: { organizationId, riskId },
      type: QueryTypes.SELECT,
      ...(transaction && { transaction }),
    },
  );
  return (rows as any[]).map(toLinkRow);
}

export interface UpsertRiskLinkInput {
  organizationId: number;
  /** Already canonicalised: sourceRiskId < targetRiskId. */
  sourceRiskId: number;
  targetRiskId: number;
  score: number;
  reasons: LinkSignal[];
}

/**
 * Create a derived suggestion, or refresh an existing edge's score.
 *
 * ON CONFLICT deliberately touches neither status nor source: a confirmed or
 * dismissed edge keeps the human's decision across every recompute (R1, R3).
 */
export async function upsertRiskLinkQuery(
  input: UpsertRiskLinkInput,
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(
    `INSERT INTO risk_links
       (organization_id, source_risk_id, target_risk_id, relation_type,
        status, source, score, reasons, last_computed_at)
     VALUES (:organizationId, :sourceRiskId, :targetRiskId, 'related_to',
             'suggested', 'derived', :score, CAST(:reasons AS JSONB), NOW())
     ON CONFLICT (source_risk_id, target_risk_id, relation_type)
     DO UPDATE SET score = EXCLUDED.score,
                   reasons = EXCLUDED.reasons,
                   last_computed_at = NOW(),
                   updated_at = NOW()`,
    {
      replacements: {
        organizationId: input.organizationId,
        sourceRiskId: input.sourceRiskId,
        targetRiskId: input.targetRiskId,
        score: input.score,
        reasons: JSON.stringify(input.reasons),
      },
      type: QueryTypes.INSERT,
      transaction,
    },
  );
}

/** Refresh score and reasons on an edge the recompute is keeping but not upserting. */
export async function updateRiskLinkScoreQuery(
  id: number,
  organizationId: number,
  score: number,
  reasons: LinkSignal[],
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(
    `UPDATE risk_links
     SET score = :score,
         reasons = CAST(:reasons AS JSONB),
         last_computed_at = NOW(),
         updated_at = NOW()
     WHERE id = :id AND organization_id = :organizationId`,
    {
      replacements: { id, organizationId, score, reasons: JSON.stringify(reasons) },
      type: QueryTypes.UPDATE,
      transaction,
    },
  );
}

/**
 * Prune stale suggestions. The source/status predicate is belt-and-braces: the
 * caller already filtered, but a confirmed edge must never be deletable here.
 */
export async function deleteRiskLinksQuery(
  ids: number[],
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  if (ids.length === 0) return;
  await sequelize.query(
    `DELETE FROM risk_links
     WHERE organization_id = :organizationId
       AND id IN (:ids)
       AND source = 'derived'
       AND status = 'suggested'`,
    {
      replacements: { organizationId, ids },
      type: QueryTypes.DELETE,
      transaction,
    },
  );
}

export interface RiskLinkWithRelated extends RiskLinkRow {
  related_id: number;
  related_risk_name: string | null;
  related_risk_level: string | null;
  related_risk_owner: number | null;
}

/**
 * Every visible edge for one risk, in either direction.
 *
 * R7: edges outlive a soft-deleted risk, so the read — not the write — is what
 * hides them. Both endpoints are joined and both are filtered: `related` so a
 * deleted partner disappears from the list, `subject` so a deleted subject
 * returns an empty list rather than its old neighbours.
 */
export async function getRiskLinksForRiskQuery(
  organizationId: number,
  riskId: number,
  statuses: RiskLinkStatus[],
): Promise<RiskLinkWithRelated[]> {
  const rows = await sequelize.query(
    `SELECT l.*,
            related.id AS related_id,
            related.risk_name AS related_risk_name,
            related.risk_level_autocalculated::text AS related_risk_level,
            related.risk_owner AS related_risk_owner
     FROM risk_links l
     JOIN risks related
       ON related.id = CASE WHEN l.source_risk_id = :riskId
                            THEN l.target_risk_id ELSE l.source_risk_id END
     JOIN risks subject ON subject.id = :riskId
     WHERE l.organization_id = :organizationId
       AND (l.source_risk_id = :riskId OR l.target_risk_id = :riskId)
       AND related.organization_id = :organizationId
       AND related.is_deleted = false
       AND subject.organization_id = :organizationId
       AND subject.is_deleted = false
       AND l.status IN (:statuses)
     ORDER BY l.score DESC, related.id ASC`,
    { replacements: { organizationId, riskId, statuses }, type: QueryTypes.SELECT },
  );

  return (rows as any[]).map((row) => ({
    ...toLinkRow(row),
    related_id: row.related_id,
    related_risk_name: row.related_risk_name ?? null,
    related_risk_level: row.related_risk_level ?? null,
    related_risk_owner: row.related_risk_owner ?? null,
  }));
}

export async function getRiskLinkByIdQuery(
  id: number,
  organizationId: number,
): Promise<RiskLinkRow | null> {
  const rows = await sequelize.query(
    `SELECT * FROM risk_links WHERE id = :id AND organization_id = :organizationId`,
    { replacements: { id, organizationId }, type: QueryTypes.SELECT },
  );
  const row = (rows as any[])[0];
  return row ? toLinkRow(row) : null;
}

/**
 * Record a human decision. `decidedByUserId` of null is the explicit undo
 * (dismissed -> suggested): it clears decided_at too, so the edge looks
 * untouched again and a later recompute may prune it normally.
 */
export async function updateRiskLinkStatusQuery(
  id: number,
  organizationId: number,
  status: RiskLinkStatus,
  decidedByUserId: number | null,
): Promise<void> {
  await sequelize.query(
    `UPDATE risk_links
     SET status = :status,
         decided_by_user_id = :decidedByUserId,
         decided_at = CASE WHEN :decidedByUserId IS NULL THEN NULL ELSE NOW() END,
         updated_at = NOW()
     WHERE id = :id AND organization_id = :organizationId`,
    {
      replacements: { id, organizationId, status, decidedByUserId },
      type: QueryTypes.UPDATE,
    },
  );
}
