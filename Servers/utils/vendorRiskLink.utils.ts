import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { LinkSignal, RiskLinkRow, RiskLinkStatus } from "../services/riskLinks/types";
import { UseCaseRef } from "./vendorRiskReport.utils";

/**
 * Queries behind `related_to` links between two vendor risks. These rows set
 * `source_vendor_risk_id` instead of `source_risk_id` and always point at a
 * vendor risk, smaller id first (risk_links_vendor_pair). Every query here
 * selects on `source_vendor_risk_id`, so none of them can see a project-risk
 * row, and none of the project-risk queries can see these.
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

/** What the vendor pair scorer reads about one vendor risk. */
export interface VendorRiskScoringRow {
  id: number;
  vendor_id: number | null;
  risk_description: string | null;
  impact_description: string | null;
  /** Frameworks the risk is mapped to (frameworks_vendorrisks), by name. */
  frameworks: string[];
  /** Use cases the risk's vendor serves (vendors_projects). */
  use_cases: UseCaseRef[];
}

/** Every active vendor risk in the org, with what the scorer compares. */
export async function getVendorRiskScoringRowsQuery(
  organizationId: number,
): Promise<VendorRiskScoringRow[]> {
  const rows = await sequelize.query(
    `WITH mapped AS (
       SELECT fv.vendorrisk_id, ARRAY_AGG(DISTINCT f.name ORDER BY f.name) AS names
         FROM frameworks_vendorrisks fv
         JOIN frameworks f ON f.id = fv.framework_id
        WHERE fv.organization_id = :organizationId
        GROUP BY fv.vendorrisk_id
     ),
     served AS (
       SELECT vp.vendor_id,
              JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT('id', p.id, 'name', p.project_title)) AS use_cases
         FROM vendors_projects vp
         JOIN projects p
           ON p.id = vp.project_id
          AND p.organization_id = :organizationId
        WHERE vp.organization_id = :organizationId
        GROUP BY vp.vendor_id
     )
     SELECT vr.id, vr.vendor_id, vr.risk_description, vr.impact_description,
            COALESCE(m.names, '{}') AS frameworks,
            COALESCE(s.use_cases, '[]'::jsonb) AS use_cases
       FROM vendorrisks vr
       LEFT JOIN mapped m ON m.vendorrisk_id = vr.id
       LEFT JOIN served s ON s.vendor_id = vr.vendor_id
      WHERE vr.organization_id = :organizationId
        AND vr.is_deleted = false
      ORDER BY vr.id`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  );

  return (rows as any[]).map((row) => ({
    id: toNumber(row.id),
    vendor_id: row.vendor_id ?? null,
    risk_description: row.risk_description ?? null,
    impact_description: row.impact_description ?? null,
    frameworks: row.frameworks ?? [],
    use_cases: toJsonArray<UseCaseRef>(row.use_cases),
  }));
}

/** Active vendor risk ids in the org, optionally for one vendor only. */
export async function getActiveVendorRiskIdsQuery(
  organizationId: number,
  vendorId?: number,
): Promise<number[]> {
  const rows = await sequelize.query(
    `SELECT id FROM vendorrisks
      WHERE organization_id = :organizationId
        AND is_deleted = false
        ${vendorId !== undefined ? "AND vendor_id = :vendorId" : ""}
      ORDER BY id`,
    { replacements: { organizationId, vendorId }, type: QueryTypes.SELECT },
  );
  return (rows as { id: number }[]).map((row) => toNumber(row.id));
}

/** Which of these ids are live vendor risks in this org. */
export async function getLiveVendorRiskIdsQuery(
  ids: number[],
  organizationId: number,
): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await sequelize.query(
    `SELECT id FROM vendorrisks
      WHERE id IN (:ids) AND organization_id = :organizationId AND is_deleted = false`,
    { replacements: { ids, organizationId }, type: QueryTypes.SELECT },
  );
  return (rows as { id: number }[]).map((row) => toNumber(row.id));
}

/** Every vendor pair touching this vendor risk, either end, any status. */
export async function getVendorRiskIncidentLinksQuery(
  organizationId: number,
  vendorRiskId: number,
  transaction?: Transaction,
): Promise<RiskLinkRow[]> {
  const rows = await sequelize.query(
    `SELECT * FROM risk_links
      WHERE organization_id = :organizationId
        AND source_vendor_risk_id IS NOT NULL
        AND (source_vendor_risk_id = :vendorRiskId OR target_vendor_risk_id = :vendorRiskId)`,
    {
      replacements: { organizationId, vendorRiskId },
      type: QueryTypes.SELECT,
      ...(transaction && { transaction }),
    },
  );
  return (rows as any[]).map((row) => ({
    id: toNumber(row.id),
    organization_id: row.organization_id,
    source_risk_id: null,
    source_vendor_risk_id: toNumber(row.source_vendor_risk_id),
    target_risk_id: null,
    target_model_risk_id: null,
    target_vendor_risk_id: toNumber(row.target_vendor_risk_id),
    relation_type: row.relation_type,
    status: row.status as RiskLinkStatus,
    source: row.source,
    score: toNumber(row.score),
    reasons: toJsonArray<LinkSignal>(row.reasons),
    decided_at: row.decided_at ?? null,
    last_computed_at: row.last_computed_at ?? null,
    dismiss_reason: row.dismiss_reason ?? null,
    dismiss_note: row.dismiss_note ?? null,
    parent_level_changed_at: row.parent_level_changed_at ?? null,
  }));
}

export interface UpsertVendorRiskLinkInput {
  organizationId: number;
  /** Already canonicalised: sourceVendorRiskId < targetVendorRiskId. */
  sourceVendorRiskId: number;
  targetVendorRiskId: number;
  score: number;
  reasons: LinkSignal[];
}

/**
 * Create a derived suggestion for a vendor pair, or refresh its score. Like
 * upsertRiskLinkQuery, ON CONFLICT never touches status or source, so a human
 * decision survives every recompute.
 */
export async function upsertVendorRiskLinkQuery(
  input: UpsertVendorRiskLinkInput,
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(
    `INSERT INTO risk_links
       (organization_id, source_vendor_risk_id, target_vendor_risk_id, relation_type,
        status, source, score, reasons, last_computed_at)
     VALUES (:organizationId, :sourceVendorRiskId, :targetVendorRiskId, 'related_to',
             'suggested', 'derived', :score, CAST(:reasons AS JSONB), NOW())
     ON CONFLICT (source_vendor_risk_id, target_vendor_risk_id, relation_type)
       WHERE source_vendor_risk_id IS NOT NULL
     DO UPDATE SET score = EXCLUDED.score,
                   reasons = EXCLUDED.reasons,
                   last_computed_at = NOW(),
                   updated_at = NOW()
     WHERE risk_links.organization_id = EXCLUDED.organization_id`,
    {
      replacements: {
        organizationId: input.organizationId,
        sourceVendorRiskId: input.sourceVendorRiskId,
        targetVendorRiskId: input.targetVendorRiskId,
        score: input.score,
        reasons: JSON.stringify(input.reasons),
      },
      type: QueryTypes.INSERT,
      transaction,
    },
  );
}

/**
 * A human relating two vendor risks: `confirmed` + `user`, so the recompute
 * prune can never remove it. Null when the pair already has a row, whatever its
 * status — the caller turns that into the same 409 as a project-risk pair.
 */
export async function createUserVendorRiskLinkQuery(input: {
  organizationId: number;
  sourceVendorRiskId: number;
  targetVendorRiskId: number;
  userId: number;
}): Promise<number | null> {
  const [rows] = await sequelize.query(
    `INSERT INTO risk_links
       (organization_id, source_vendor_risk_id, target_vendor_risk_id, relation_type,
        status, source, created_by_user_id, decided_by_user_id, decided_at)
     VALUES (:organizationId, :sourceVendorRiskId, :targetVendorRiskId, 'related_to',
             'confirmed', 'user', :userId, :userId, NOW())
     ON CONFLICT (source_vendor_risk_id, target_vendor_risk_id, relation_type)
       WHERE source_vendor_risk_id IS NOT NULL
     DO NOTHING
     RETURNING id`,
    { replacements: input },
  );
  const row = (rows as { id: number }[])[0];
  return row ? toNumber(row.id) : null;
}
