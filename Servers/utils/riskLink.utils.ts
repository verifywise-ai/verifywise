import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  LinkSignal,
  RiskLinkRelationType,
  RiskLinkRow,
  RiskLinkStatus,
  RiskScoringRow,
  StructuralNeighbourRow,
  RelatedPair,
} from "../services/riskLinks/types";
import { HierarchyEdge, ParentEntityType } from "../services/riskLinks/hierarchy";
import { DismissReason } from "../services/riskLinks/dismissReason";

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

/** Which parent the caller is proposing, and which table it lives in. */
export interface HierarchyParent {
  id: number;
  entityType: ParentEntityType;
}

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
  dismiss_reason: row.dismiss_reason ?? null,
  dismiss_note: row.dismiss_note ?? null,
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

/**
 * Every active risk in the org that shares a framework element with this one,
 * one row per (neighbour, shared element), with that element's degree.
 *
 * Eight of the ten join tables call the risk column `projects_risks_id`. That is
 * a legacy misnomer: it holds a risk id and joins straight to `risks.id` — there
 * is no hop through `projects_risks`.
 *
 * The org filter appears on every arm AND on the risks join. Element ids are not
 * global — each of the ten element tables is org-scoped — but `organization_id`
 * is nullable on these join tables and nothing declares a foreign key to the
 * element table, so a row naming another org's element is schema-legal. The
 * filter is what makes this correct instead of dependent on ids not colliding.
 */
export async function getStructuralNeighboursQuery(
  organizationId: number,
  riskId: number,
): Promise<StructuralNeighbourRow[]> {
  const rows = await sequelize.query(
    `WITH element_links AS (
       SELECT projects_risks_id AS risk_id, 'iso42001_subclause:'     || subclause_id                 AS element_key FROM subclauses_iso__risks            WHERE organization_id = :organizationId
       UNION ALL
       SELECT projects_risks_id,            'iso27001_subclause:'     || subclause_id                                FROM subclauses_iso27001__risks       WHERE organization_id = :organizationId
       UNION ALL
       SELECT projects_risks_id,            'iso42001_annexcategory:' || annexcategory_id                            FROM annexcategories_iso__risks       WHERE organization_id = :organizationId
       UNION ALL
       SELECT projects_risks_id,            'iso27001_annexcontrol:'  || annexcontrol_id                             FROM annexcontrols_iso27001__risks    WHERE organization_id = :organizationId
       UNION ALL
       SELECT projects_risks_id,            'eu_control:'             || control_id                                  FROM controls_eu__risks               WHERE organization_id = :organizationId
       UNION ALL
       SELECT projects_risks_id,            'eu_subcontrol:'          || subcontrol_id                               FROM subcontrols_eu__risks            WHERE organization_id = :organizationId
       UNION ALL
       SELECT projects_risks_id,            'eu_answer:'              || answer_id                                   FROM answers_eu__risks                WHERE organization_id = :organizationId
       UNION ALL
       SELECT projects_risks_id,            'nist_subcategory:'       || nist_ai_rmf_subcategory_id                  FROM nist_ai_rmf_subcategories__risks WHERE organization_id = :organizationId
       UNION ALL
       SELECT risk_id,                      'custom_l2:'              || level2_impl_id                              FROM custom_framework_level2_risks    WHERE organization_id = :organizationId
       UNION ALL
       SELECT risk_id,                      'custom_l3:'              || level3_impl_id                              FROM custom_framework_level3_risks    WHERE organization_id = :organizationId
     ),
     active AS (
       SELECT DISTINCT el.risk_id, el.element_key
       FROM element_links el
       JOIN risks r
         ON r.id = el.risk_id
        AND r.organization_id = :organizationId
        AND r.is_deleted = false
     ),
     degrees AS (
       SELECT element_key, COUNT(*) AS degree
       FROM active
       GROUP BY element_key
     )
     SELECT a2.risk_id  AS target_risk_id,
            a1.element_key,
            d.degree
     FROM active a1
     JOIN active a2 ON a2.element_key = a1.element_key AND a2.risk_id <> a1.risk_id
     JOIN degrees d ON d.element_key = a1.element_key
     WHERE a1.risk_id = :riskId`,
    { replacements: { organizationId, riskId }, type: QueryTypes.SELECT },
  );

  return (rows as any[]).map((row) => ({
    target_risk_id: row.target_risk_id,
    element_key: row.element_key,
    degree: toNumber(row.degree),
  }));
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
                   updated_at = NOW()
     WHERE risk_links.organization_id = EXCLUDED.organization_id`,
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

/**
 * Which of these ids are live risks in this org.
 *
 * Both risk id columns on `risk_links` carry real foreign keys to `risks`, so an
 * id that exists nowhere is already rejected by the database. What no constraint
 * catches is an id that exists and belongs to another org, or one that is
 * soft-deleted — so both clauses below are load-bearing, and neither has a
 * safety net behind it. Callers compare the result length against the input.
 */
export async function getLiveRiskIdsQuery(
  ids: number[],
  organizationId: number,
): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await sequelize.query(
    `SELECT id FROM risks
      WHERE id IN (:ids) AND organization_id = :organizationId AND is_deleted = false`,
    { replacements: { ids, organizationId }, type: QueryTypes.SELECT },
  );
  return (rows as { id: number }[]).map((row) => row.id);
}

/** Does this exact directed edge already exist? Used to refuse a two-cycle. */
export async function riskLinkPairExistsQuery(
  organizationId: number,
  sourceRiskId: number,
  targetRiskId: number,
  relationType: RiskLinkRelationType,
): Promise<boolean> {
  const rows = await sequelize.query(
    `SELECT 1 FROM risk_links
      WHERE organization_id = :organizationId
        AND source_risk_id = :sourceRiskId
        AND target_risk_id = :targetRiskId
        AND relation_type = :relationType
      LIMIT 1`,
    {
      replacements: { organizationId, sourceRiskId, targetRiskId, relationType },
      type: QueryTypes.SELECT,
    },
  );
  return (rows as unknown[]).length > 0;
}

/**
 * Every CONFIRMED `inherits_from` edge touching either endpoint of a proposed
 * edge — the input to `validateTwoLevel`.
 *
 * A superset of what the three rules need. Narrowing it would mean three
 * queries or a UNION; both existing indexes
 * (`risk_links_org_source_status_idx`, `risk_links_org_target_status_idx`)
 * serve this one, and the surplus keeps the SQL and the rule simple.
 *
 * `status = 'confirmed'` is load-bearing, not a filter for tidiness: competing
 * SUGGESTED parents are legal by design, so including them would reject
 * proposals the product is supposed to offer.
 */
export async function getConfirmedHierarchyEdgesQuery(
  organizationId: number,
  childRiskId: number,
  parent: HierarchyParent,
): Promise<HierarchyEdge[]> {
  // Only one of the three parent bindings is ever non-null. `IN` and `=`
  // against NULL yield NULL, so the unused branches match nothing rather than
  // matching everything — the same fail-closed property the tenant filters use.
  const rows = await sequelize.query(
    `SELECT source_risk_id, target_risk_id, target_model_risk_id, target_vendor_risk_id
       FROM risk_links
      WHERE organization_id = :organizationId
        AND relation_type = 'inherits_from'
        AND status = 'confirmed'
        AND (source_risk_id IN (:childRiskId, :parentRiskId)
             OR target_risk_id IN (:childRiskId, :parentRiskId)
             OR target_model_risk_id = :parentModelRiskId
             OR target_vendor_risk_id = :parentVendorRiskId)`,
    {
      replacements: {
        organizationId,
        childRiskId,
        parentRiskId: parent.entityType === "risk" ? parent.id : null,
        parentModelRiskId: parent.entityType === "model_risk" ? parent.id : null,
        parentVendorRiskId: parent.entityType === "vendor_risk" ? parent.id : null,
      },
      type: QueryTypes.SELECT,
    },
  );
  // source is the child, target is the parent — see risk_links_canonical, which
  // exempts inherits_from from id reordering precisely so this holds.
  return (
    rows as {
      source_risk_id: number;
      target_risk_id: number | null;
      target_model_risk_id: number | null;
      target_vendor_risk_id: number | null;
    }[]
  ).map((row) => ({
    childRiskId: row.source_risk_id,
    parentRiskId: (row.target_model_risk_id ??
      row.target_vendor_risk_id ??
      row.target_risk_id) as number,
    parentEntityType:
      row.target_model_risk_id != null
        ? ("model_risk" as const)
        : row.target_vendor_risk_id != null
          ? ("vendor_risk" as const)
          : ("risk" as const),
  }));
}

/**
 * Every `related_to` pair in the org that still has two live risks behind it —
 * the edge list `connectedComponents` partitions.
 *
 * `dismissed` is excluded deliberately. A dismissed relation is a statement
 * that these two risks are not related; letting it through would merge two
 * clusters the user has already told us to keep apart, and then hand the merged
 * cluster to the model as one grouping problem.
 *
 * The joins to `risks` are what keep a soft-deleted partner out. Without them a
 * dead id reaches the prompt with no risk row behind it: harmless in the sense
 * that the model cannot name what it cannot see, but it inflates the size check
 * and can spend a whole call on a component with one real member.
 */
export async function getRelatedPairsQuery(
  organizationId: number,
): Promise<RelatedPair[]> {
  const rows = await sequelize.query(
    `SELECT l.source_risk_id, l.target_risk_id
       FROM risk_links l
       JOIN risks s ON s.id = l.source_risk_id
                   AND s.organization_id = :organizationId
                   AND s.is_deleted = false
       JOIN risks t ON t.id = l.target_risk_id
                   AND t.organization_id = :organizationId
                   AND t.is_deleted = false
      WHERE l.organization_id = :organizationId
        AND l.relation_type = 'related_to'
        AND l.status IN ('suggested', 'confirmed')`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  );

  return (rows as { source_risk_id: number; target_risk_id: number }[]).map((row) => ({
    a: toNumber(row.source_risk_id),
    b: toNumber(row.target_risk_id),
  }));
}

/** The four columns the direction prompt shows the model about one risk. */
export interface RiskPromptRow {
  id: number;
  risk_name: string | null;
  risk_description: string | null;
  risk_category: string[] | null;
  ai_lifecycle_phase: string | null;
}

/**
 * The prompt payload for one component.
 *
 * `risk_description` is the column that actually carries the signal a grouping
 * decision needs — the name alone rarely says whether a risk is the umbrella or
 * one instance under it. The two enum columns are cast to text for the same
 * reason `getRiskScoringRowsQuery` casts them: the driver returns a Postgres
 * enum as an opaque value otherwise.
 */
export async function getRiskPromptRowsQuery(
  organizationId: number,
  riskIds: number[],
): Promise<RiskPromptRow[]> {
  if (riskIds.length === 0) return [];
  const rows = await sequelize.query(
    `SELECT id,
            risk_name,
            risk_description,
            risk_category::text[] AS risk_category,
            ai_lifecycle_phase::text AS ai_lifecycle_phase
       FROM risks
      WHERE id IN (:riskIds)
        AND organization_id = :organizationId
        AND is_deleted = false
      ORDER BY id`,
    { replacements: { riskIds, organizationId }, type: QueryTypes.SELECT },
  );

  return (rows as any[]).map((row) => ({
    id: toNumber(row.id),
    risk_name: row.risk_name ?? null,
    risk_description: row.risk_description ?? null,
    risk_category: Array.isArray(row.risk_category) ? row.risk_category : null,
    ai_lifecycle_phase: row.ai_lifecycle_phase ?? null,
  }));
}

/** One stored `inherits_from` edge, in the child/parent terms the rules use. */
export interface HierarchyPairRow {
  childRiskId: number;
  parentRiskId: number;
  status: RiskLinkStatus;
}

/**
 * Every `inherits_from` row touching any of these risks, in every status.
 *
 * One round trip serving two different needs. Rule 4 of the filter needs all
 * three statuses, because a `dismissed` pair must never be proposed again;
 * rule 5 needs the `confirmed` and `suggested` subset, because those are the
 * edges a new proposal could contradict. Splitting it would be two queries for
 * one index scan.
 *
 * Note the direction mapping: `source_risk_id` is the child.
 */
export async function getHierarchyPairsQuery(
  organizationId: number,
  riskIds: number[],
): Promise<HierarchyPairRow[]> {
  if (riskIds.length === 0) return [];
  const rows = await sequelize.query(
    `SELECT source_risk_id, target_risk_id, status
       FROM risk_links
      WHERE organization_id = :organizationId
        AND relation_type = 'inherits_from'
        AND (source_risk_id IN (:riskIds) OR target_risk_id IN (:riskIds))`,
    { replacements: { organizationId, riskIds }, type: QueryTypes.SELECT },
  );

  return (rows as any[]).map((row) => ({
    childRiskId: toNumber(row.source_risk_id),
    parentRiskId: toNumber(row.target_risk_id),
    status: row.status as RiskLinkStatus,
  }));
}

export interface CreateAgentHierarchyLinkInput {
  organizationId: number;
  childRiskId: number;
  parentRiskId: number;
  /** The model's own one-line justification, 15-120 chars by schema. */
  reason: string;
}

/**
 * Writes one agent proposal as a `suggested` / `agent` row.
 *
 * A fourth query rather than a flag on `upsertRiskLinkQuery` or
 * `createUserRiskLinkQuery`: the first hardcodes `related_to`/`derived` and
 * exists to be re-run by the scoring engine, the second hardcodes
 * `confirmed`/`user` and stamps `decided_at`. An agent row is neither — it is
 * an undecided proposal, so `decided_at` stays NULL and `score` stays at its
 * column default of 0. §9 of the design stops the frontend showing that 0.
 *
 * The reason travels in the existing `reasons` column as a single signal with
 * `weight: 0`, which is what the panel's `reasonLabel` already knows how to
 * render.
 *
 * `ON CONFLICT DO NOTHING` returns null on a pair that already has a row of
 * this relation type. That should not happen — rule 4 of the filter drops those
 * before they get here — but two components can only be processed concurrently,
 * so the constraint stays the last word.
 */
export async function createAgentHierarchyLinkQuery(
  input: CreateAgentHierarchyLinkInput,
): Promise<number | null> {
  const reasons: LinkSignal[] = [
    { signal: "hierarchy", weight: 0, detail: input.reason },
  ];
  const rows = await sequelize.query(
    `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id,
                             relation_type, status, source, reasons, created_at)
     VALUES (:organizationId, :childRiskId, :parentRiskId,
             'inherits_from', 'suggested', 'agent', CAST(:reasons AS JSONB), NOW())
     ON CONFLICT (source_risk_id, target_risk_id, relation_type) DO NOTHING
     RETURNING id`,
    {
      replacements: {
        organizationId: input.organizationId,
        childRiskId: input.childRiskId,
        parentRiskId: input.parentRiskId,
        reasons: JSON.stringify(reasons),
      },
      type: QueryTypes.SELECT,
    },
  );

  const row = (rows as { id: number }[])[0];
  return row ? toNumber(row.id) : null;
}

export interface CreateUserRiskLinkInput {
  organizationId: number;
  sourceRiskId: number;
  targetRiskId: number;
  relationType: RiskLinkRelationType;
  userId: number;
}

/**
 * Write a human-asserted link. `confirmed` + `user` makes the row immune to the
 * recompute prune on both of that prune's two conditions. `score` and `reasons`
 * are left to their column defaults (0, []) — a human link has no score.
 *
 * Returns null when the pair already exists: the ON CONFLICT names
 * `risk_links_unique`, so a duplicate pair is absorbed here rather than raised.
 *
 * It does NOT absorb `risk_links_single_parent_idx` — a different constraint,
 * which raises. The controller catches that one by name; see
 * `isSingleParentViolation` in riskLinks.ctrl.ts.
 */
export async function createUserRiskLinkQuery(
  input: CreateUserRiskLinkInput,
): Promise<number | null> {
  const [rows] = await sequelize.query(
    `INSERT INTO risk_links
       (organization_id, source_risk_id, target_risk_id, relation_type,
        status, source, created_by_user_id, decided_by_user_id, decided_at)
     VALUES (:organizationId, :sourceRiskId, :targetRiskId, :relationType,
             'confirmed', 'user', :userId, :userId, NOW())
     ON CONFLICT (source_risk_id, target_risk_id, relation_type) DO NOTHING
     RETURNING id`,
    {
      replacements: {
        organizationId: input.organizationId,
        sourceRiskId: input.sourceRiskId,
        targetRiskId: input.targetRiskId,
        relationType: input.relationType,
        userId: input.userId,
      },
    },
  );
  const row = (rows as { id: number }[])[0];
  return row ? row.id : null;
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
 *
 * Both dismissal columns are written on EVERY call, and both parameters are
 * required rather than defaulted. That is the clearing rule (C3 §3.5) made
 * structural: leaving `dismissed` passes nulls, so a stale reason cannot
 * survive onto a confirmed row, and a future second caller cannot forget.
 */
export async function updateRiskLinkStatusQuery(
  id: number,
  organizationId: number,
  status: RiskLinkStatus,
  decidedByUserId: number | null,
  dismissReason: DismissReason | null,
  dismissNote: string | null,
): Promise<void> {
  await sequelize.query(
    `UPDATE risk_links
     SET status = :status,
         decided_by_user_id = :decidedByUserId,
         decided_at = CASE WHEN :decidedByUserId IS NULL THEN NULL ELSE NOW() END,
         dismiss_reason = :dismissReason,
         dismiss_note = :dismissNote,
         updated_at = NOW()
     WHERE id = :id AND organization_id = :organizationId`,
    {
      replacements: {
        id,
        organizationId,
        status,
        decidedByUserId,
        dismissReason,
        dismissNote,
      },
      type: QueryTypes.UPDATE,
    },
  );
}
