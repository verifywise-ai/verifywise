import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { toJsonArray, toNumber } from "./pgRow.utils";

/**
 * Reads behind the vendor risk insights on the Vendors page: exposure (blast
 * radius), duplicate candidates and framework coverage. All three are
 * read-only and org-scoped, and all three hide soft-deleted vendor risks and
 * soft-deleted children — the same R7 rule the risk link reads follow.
 */

export interface UseCaseRef {
  id: number;
  name: string;
}

export interface VendorExposureRow {
  vendor_risk_id: number;
  vendor_id: number | null;
  vendor_name: string | null;
  /** Confirmed children only: a suggestion is not yet anyone's exposure. */
  child_ids: number[];
  suggested: number;
  /** The projects (use cases) the confirmed children sit in. */
  use_cases: UseCaseRef[];
}

/**
 * One row per active vendor risk: who inherits from it, and where those
 * children live. Vendor risks with no children are included with empty lists,
 * so the caller can count "risks with no reach" without a second query.
 */
export async function getVendorExposureRowsQuery(
  organizationId: number,
): Promise<VendorExposureRow[]> {
  const rows = await sequelize.query(
    `WITH children AS (
       SELECT l.target_vendor_risk_id AS vendor_risk_id, l.status, child.id AS child_id
         FROM risk_links l
         JOIN risks child
           ON child.id = l.source_risk_id
          AND child.organization_id = :organizationId
          AND child.is_deleted = false
        WHERE l.organization_id = :organizationId
          AND l.target_vendor_risk_id IS NOT NULL
          AND l.relation_type = 'inherits_from'
          AND l.status IN ('confirmed', 'suggested')
     )
     SELECT vr.id AS vendor_risk_id,
            vr.vendor_id,
            v.vendor_name,
            COALESCE(
              ARRAY_AGG(DISTINCT c.child_id) FILTER (WHERE c.status = 'confirmed'),
              '{}'
            ) AS child_ids,
            COUNT(DISTINCT c.child_id) FILTER (WHERE c.status = 'suggested') AS suggested,
            COALESCE(
              JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT('id', p.id, 'name', p.project_title))
                FILTER (WHERE c.status = 'confirmed' AND p.id IS NOT NULL),
              '[]'::jsonb
            ) AS use_cases
       FROM vendorrisks vr
       LEFT JOIN vendors v
              ON v.id = vr.vendor_id
             AND v.organization_id = :organizationId
       LEFT JOIN children c ON c.vendor_risk_id = vr.id
       LEFT JOIN projects_risks pr
              ON pr.risk_id = c.child_id
             AND pr.organization_id = :organizationId
       LEFT JOIN projects p
              ON p.id = pr.project_id
             AND p.organization_id = :organizationId
      WHERE vr.organization_id = :organizationId
        AND vr.is_deleted = false
      GROUP BY vr.id, vr.vendor_id, v.vendor_name
      ORDER BY vr.id`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  );

  return (rows as any[]).map((row) => ({
    vendor_risk_id: row.vendor_risk_id,
    vendor_id: row.vendor_id ?? null,
    vendor_name: row.vendor_name ?? null,
    child_ids: (row.child_ids ?? []).map(toNumber),
    suggested: toNumber(row.suggested),
    use_cases: toJsonArray<UseCaseRef>(row.use_cases).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export interface VendorDuplicateScanRow {
  id: number;
  vendor_id: number | null;
  vendor_name: string | null;
  risk_description: string | null;
  impact_description: string | null;
  risk_level: string | null;
  action_owner: number | null;
}

/** Active vendor risks in id order, capped like the project risk scan. */
export async function getVendorDuplicateScanRowsQuery(
  organizationId: number,
  limit: number,
): Promise<VendorDuplicateScanRow[]> {
  const rows = await sequelize.query(
    `SELECT vr.id, vr.vendor_id, v.vendor_name, vr.risk_description, vr.impact_description,
            vr.risk_level, vr.action_owner
       FROM vendorrisks vr
       LEFT JOIN vendors v
              ON v.id = vr.vendor_id
             AND v.organization_id = :organizationId
      WHERE vr.organization_id = :organizationId
        AND vr.is_deleted = false
      ORDER BY vr.id
      LIMIT :limit`,
    { replacements: { organizationId, limit }, type: QueryTypes.SELECT },
  );
  return (rows as any[]).map((row) => ({
    id: row.id,
    vendor_id: row.vendor_id ?? null,
    vendor_name: row.vendor_name ?? null,
    risk_description: row.risk_description ?? null,
    impact_description: row.impact_description ?? null,
    risk_level: row.risk_level ?? null,
    action_owner: row.action_owner ?? null,
  }));
}

export interface VendorCoverageScanRow {
  id: number;
  risk_description: string | null;
  risk_level: string | null;
  action_owner: number | null;
  vendor_id: number | null;
  vendor_name: string | null;
  /** Frameworks this vendor risk is mapped to. */
  mapped_frameworks: string[];
  /** Frameworks attached to the use cases this vendor serves. */
  available_frameworks: string[];
}

/**
 * Every active vendor risk with the frameworks it is mapped to and the
 * frameworks it could be mapped to: those attached to a use case the vendor
 * serves. The service turns the pair into a state.
 */
export async function getVendorCoverageScanRowsQuery(
  organizationId: number,
): Promise<VendorCoverageScanRow[]> {
  const rows = await sequelize.query(
    `WITH available AS (
       SELECT vp.vendor_id, ARRAY_AGG(DISTINCT f.name ORDER BY f.name) AS names
         FROM vendors_projects vp
         JOIN projects_frameworks pf
           ON pf.project_id = vp.project_id
          AND pf.organization_id = :organizationId
         JOIN frameworks f ON f.id = pf.framework_id
        WHERE vp.organization_id = :organizationId
        GROUP BY vp.vendor_id
     ),
     mapped AS (
       SELECT fv.vendorrisk_id, ARRAY_AGG(DISTINCT f.name ORDER BY f.name) AS names
         FROM frameworks_vendorrisks fv
         JOIN frameworks f ON f.id = fv.framework_id
        WHERE fv.organization_id = :organizationId
        GROUP BY fv.vendorrisk_id
     )
     SELECT vr.id, vr.risk_description, vr.risk_level, vr.action_owner,
            vr.vendor_id, v.vendor_name,
            COALESCE(m.names, '{}') AS mapped_frameworks,
            COALESCE(a.names, '{}') AS available_frameworks
       FROM vendorrisks vr
       LEFT JOIN vendors v
              ON v.id = vr.vendor_id
             AND v.organization_id = :organizationId
       LEFT JOIN mapped m ON m.vendorrisk_id = vr.id
       LEFT JOIN available a ON a.vendor_id = vr.vendor_id
      WHERE vr.organization_id = :organizationId
        AND vr.is_deleted = false
      ORDER BY vr.id`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  );
  return (rows as any[]).map((row) => ({
    id: row.id,
    risk_description: row.risk_description ?? null,
    risk_level: row.risk_level ?? null,
    action_owner: row.action_owner ?? null,
    vendor_id: row.vendor_id ?? null,
    vendor_name: row.vendor_name ?? null,
    mapped_frameworks: row.mapped_frameworks ?? [],
    available_frameworks: row.available_frameworks ?? [],
  }));
}
