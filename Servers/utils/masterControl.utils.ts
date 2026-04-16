/**
 * Raw-SQL queries for master_controls and master_control_framework_mappings.
 *
 * All queries use unqualified table names (resolved via `search_path`) and
 * enforce multi-tenant isolation with `organization_id = :organizationId`.
 *
 * Controllers must pass `req.organizationId` from the authenticated request.
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { MasterControlModel } from "../domain.layer/models/masterControl/masterControl.model";
import { MasterControlFrameworkMappingModel } from "../domain.layer/models/masterControl/masterControlMapping.model";
import type { IMasterControl } from "../domain.layer/interfaces/i.masterControl";
import type {
  IMasterControlFrameworkMapping,
  Framework,
  FrameworkEntityType,
} from "../domain.layer/interfaces/i.masterControlMapping";

/** Row shape returned by enriched list queries (joins with users for owner name). */
export interface MasterControlListRow extends IMasterControl {
  owner_name?: string | null;
  reviewer_name?: string | null;
  approver_name?: string | null;
  mapping_count?: number;
  mapping_summary?: Record<Framework, number>;
}

// ---------- Master Controls CRUD ----------

export const getAllMasterControlsQuery = async (
  organizationId: number
): Promise<MasterControlListRow[]> => {
  const rows = await sequelize.query<MasterControlListRow>(
    `
    SELECT mc.*,
           (CASE WHEN mc.owner IS NULL THEN NULL
                 ELSE (SELECT name || ' ' || surname FROM users WHERE id = mc.owner) END) AS owner_name,
           (CASE WHEN mc.reviewer IS NULL THEN NULL
                 ELSE (SELECT name || ' ' || surname FROM users WHERE id = mc.reviewer) END) AS reviewer_name,
           (CASE WHEN mc.approver IS NULL THEN NULL
                 ELSE (SELECT name || ' ' || surname FROM users WHERE id = mc.approver) END) AS approver_name,
           (SELECT COUNT(*) FROM master_control_framework_mappings m
              WHERE m.master_control_id = mc.id
                AND m.organization_id = mc.organization_id) AS mapping_count
      FROM master_controls mc
     WHERE mc.organization_id = :organizationId
     ORDER BY mc.created_at DESC, mc.id ASC
    `,
    { replacements: { organizationId }, type: QueryTypes.SELECT }
  );

  // Attach per-framework mapping counts.
  const mcIds = rows.map((r) => r.id).filter((id): id is number => !!id);
  if (mcIds.length > 0) {
    const summaries = await sequelize.query<{
      master_control_id: number;
      framework: Framework;
      n: string;
    }>(
      `
      SELECT master_control_id, framework, COUNT(*)::text AS n
        FROM master_control_framework_mappings
       WHERE organization_id = :organizationId
         AND master_control_id IN (:mcIds)
       GROUP BY master_control_id, framework
      `,
      {
        replacements: { organizationId, mcIds },
        type: QueryTypes.SELECT,
      }
    );
    const map = new Map<number, Record<Framework, number>>();
    for (const s of summaries) {
      if (!map.has(s.master_control_id)) {
        map.set(s.master_control_id, {
          eu_ai_act: 0,
          iso_42001: 0,
          iso_27001: 0,
          nist_ai_rmf: 0,
        });
      }
      map.get(s.master_control_id)![s.framework] = parseInt(s.n, 10);
    }
    for (const r of rows) {
      if (r.id) {
        r.mapping_summary = map.get(r.id) ?? {
          eu_ai_act: 0,
          iso_42001: 0,
          iso_27001: 0,
          nist_ai_rmf: 0,
        };
      }
    }
  }

  return rows;
};

export const getMasterControlByIdQuery = async (
  id: number,
  organizationId: number
): Promise<MasterControlListRow | null> => {
  const rows = await sequelize.query<MasterControlListRow>(
    `
    SELECT mc.*,
           (CASE WHEN mc.owner IS NULL THEN NULL
                 ELSE (SELECT name || ' ' || surname FROM users WHERE id = mc.owner) END) AS owner_name,
           (CASE WHEN mc.reviewer IS NULL THEN NULL
                 ELSE (SELECT name || ' ' || surname FROM users WHERE id = mc.reviewer) END) AS reviewer_name,
           (CASE WHEN mc.approver IS NULL THEN NULL
                 ELSE (SELECT name || ' ' || surname FROM users WHERE id = mc.approver) END) AS approver_name
      FROM master_controls mc
     WHERE mc.organization_id = :organizationId
       AND mc.id = :id
     LIMIT 1
    `,
    { replacements: { organizationId, id }, type: QueryTypes.SELECT }
  );
  return rows[0] ?? null;
};

export const createMasterControlQuery = async (
  mc: MasterControlModel,
  organizationId: number,
  transaction: Transaction
): Promise<MasterControlModel> => {
  const result = await sequelize.query(
    `
    INSERT INTO master_controls (
      organization_id, title, description, status, risk_review,
      owner, reviewer, approver, due_date, implementation_details, is_demo
    ) VALUES (
      :organization_id, :title, :description, :status, :risk_review,
      :owner, :reviewer, :approver, :due_date, :implementation_details, :is_demo
    ) RETURNING *;
    `,
    {
      replacements: {
        organization_id: organizationId,
        title: mc.title,
        description: mc.description ?? null,
        status: mc.status ?? "Waiting",
        risk_review: mc.risk_review ?? null,
        owner: mc.owner ?? null,
        reviewer: mc.reviewer ?? null,
        approver: mc.approver ?? null,
        due_date: mc.due_date ?? null,
        implementation_details: mc.implementation_details ?? null,
        is_demo: mc.is_demo ?? false,
      },
      mapToModel: true,
      model: MasterControlModel,
      transaction,
    }
  );
  return (result as MasterControlModel[])[0];
};

export const updateMasterControlQuery = async (
  id: number,
  mc: Partial<IMasterControl>,
  organizationId: number,
  transaction: Transaction
): Promise<MasterControlModel | null> => {
  // Build dynamic SET clause from provided keys only.
  const allowed: (keyof IMasterControl)[] = [
    "title",
    "description",
    "status",
    "risk_review",
    "owner",
    "reviewer",
    "approver",
    "due_date",
    "implementation_details",
  ];
  const sets: string[] = [];
  const replacements: Record<string, any> = { id, organizationId };
  for (const k of allowed) {
    if (k in mc) {
      sets.push(`${k} = :${k}`);
      replacements[k] = (mc as any)[k] ?? null;
    }
  }
  if (sets.length === 0) {
    // nothing to update; return the existing row
    const row = await getMasterControlByIdQuery(id, organizationId);
    return row ? new MasterControlModel(row) : null;
  }
  sets.push(`updated_at = NOW()`);
  const result = await sequelize.query(
    `
    UPDATE master_controls
       SET ${sets.join(", ")}
     WHERE id = :id
       AND organization_id = :organizationId
     RETURNING *;
    `,
    {
      replacements,
      mapToModel: true,
      model: MasterControlModel,
      transaction,
    }
  );
  const rows = result as MasterControlModel[];
  return rows.length ? rows[0] : null;
};

export const deleteMasterControlQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction
): Promise<boolean> => {
  // Delete mappings first (ON DELETE CASCADE should handle this, but be
  // explicit so the operation is portable across environments).
  await sequelize.query(
    `DELETE FROM master_control_framework_mappings
      WHERE master_control_id = :id AND organization_id = :organizationId`,
    { replacements: { id, organizationId }, transaction }
  );
  const [, affected] = await sequelize.query(
    `DELETE FROM master_controls
      WHERE id = :id AND organization_id = :organizationId`,
    { replacements: { id, organizationId }, transaction }
  );
  // Sequelize returns [results, metadata]; for DELETE without RETURNING,
  // the second element is rowCount (number).
  const rowCount =
    typeof affected === "number"
      ? affected
      : (affected as any)?.rowCount ?? 0;
  return rowCount > 0;
};

export const countMasterControlsByOrgQuery = async (
  organizationId: number
): Promise<number> => {
  const rows = await sequelize.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM master_controls WHERE organization_id = :organizationId`,
    { replacements: { organizationId }, type: QueryTypes.SELECT }
  );
  return parseInt(rows[0]?.n ?? "0", 10);
};

// ---------- Mappings CRUD ----------

export const getMappingsForMasterQuery = async (
  masterControlId: number,
  organizationId: number
): Promise<IMasterControlFrameworkMapping[]> => {
  const rows = await sequelize.query<IMasterControlFrameworkMapping>(
    `
    SELECT id, master_control_id, framework, framework_entity_type,
           framework_entity_id, created_at
      FROM master_control_framework_mappings
     WHERE master_control_id = :masterControlId
       AND organization_id = :organizationId
     ORDER BY framework ASC, framework_entity_id ASC
    `,
    {
      replacements: { masterControlId, organizationId },
      type: QueryTypes.SELECT,
    }
  );
  return rows;
};

export const createMappingQuery = async (
  mapping: IMasterControlFrameworkMapping,
  organizationId: number,
  transaction: Transaction
): Promise<MasterControlFrameworkMappingModel> => {
  const result = await sequelize.query(
    `
    INSERT INTO master_control_framework_mappings (
      organization_id, master_control_id, framework, framework_entity_type, framework_entity_id
    ) VALUES (
      :organization_id, :master_control_id, :framework, :framework_entity_type, :framework_entity_id
    )
    ON CONFLICT (master_control_id, framework, framework_entity_type, framework_entity_id)
      DO NOTHING
    RETURNING *;
    `,
    {
      replacements: {
        organization_id: organizationId,
        master_control_id: mapping.master_control_id,
        framework: mapping.framework,
        framework_entity_type: mapping.framework_entity_type,
        framework_entity_id: mapping.framework_entity_id,
      },
      mapToModel: true,
      model: MasterControlFrameworkMappingModel,
      transaction,
    }
  );
  return (result as MasterControlFrameworkMappingModel[])[0];
};

export const deleteMappingQuery = async (
  mappingId: number,
  organizationId: number,
  transaction: Transaction
): Promise<IMasterControlFrameworkMapping | null> => {
  // Fetch the row first so we can return the deleted payload for audit.
  const existing = await sequelize.query<IMasterControlFrameworkMapping>(
    `SELECT id, master_control_id, framework, framework_entity_type,
            framework_entity_id, created_at
       FROM master_control_framework_mappings
      WHERE id = :mappingId AND organization_id = :organizationId
      LIMIT 1`,
    {
      replacements: { mappingId, organizationId },
      type: QueryTypes.SELECT,
      transaction,
    }
  );
  if (existing.length === 0) return null;

  await sequelize.query(
    `DELETE FROM master_control_framework_mappings
      WHERE id = :mappingId AND organization_id = :organizationId`,
    { replacements: { mappingId, organizationId }, transaction }
  );
  return existing[0];
};

export const deleteMappingByTupleQuery = async (
  masterControlId: number,
  framework: Framework,
  frameworkEntityType: FrameworkEntityType,
  frameworkEntityId: number,
  organizationId: number,
  transaction: Transaction
): Promise<boolean> => {
  const [, affected] = await sequelize.query(
    `
    DELETE FROM master_control_framework_mappings
     WHERE organization_id = :organizationId
       AND master_control_id = :masterControlId
       AND framework = :framework
       AND framework_entity_type = :frameworkEntityType
       AND framework_entity_id = :frameworkEntityId
    `,
    {
      replacements: {
        organizationId,
        masterControlId,
        framework,
        frameworkEntityType,
        frameworkEntityId,
      },
      transaction,
    }
  );
  const rowCount =
    typeof affected === "number"
      ? affected
      : (affected as any)?.rowCount ?? 0;
  return rowCount > 0;
};

/**
 * Bulk update helper for the "Apply to selected" action on the Controls Hub.
 * Only the allow-listed fields may be mass-updated.
 */
// ---------- Framework Catalog ----------
//
// Returns the full list of struct rows for every framework_entity_type, so the
// Mappings tab picker can display real requirement titles instead of asking
// the user to type raw numeric ids. Struct tables are framework metadata
// (not tenant-scoped), so no organization filter is needed.

export interface FrameworkCatalogEntry {
  id: number;
  code: string;
  title: string;
  description: string | null;
}

export type FrameworkCatalog = Record<FrameworkEntityType, FrameworkCatalogEntry[]>;

export const getFrameworkCatalogQuery = async (): Promise<FrameworkCatalog> => {
  // EU AI Act controls — no stable code column, synthesise from category + order.
  const controlsEu = await sequelize.query<FrameworkCatalogEntry>(
    `
    SELECT c.id,
           ('Control ' || COALESCE(c.order_no::text, c.id::text)) AS code,
           c.title,
           c.description
      FROM controls_struct_eu c
     ORDER BY c.control_category_id ASC NULLS LAST, c.order_no ASC NULLS LAST, c.id ASC
    `,
    { type: QueryTypes.SELECT }
  );

  const subcontrolsEu = await sequelize.query<FrameworkCatalogEntry>(
    `
    SELECT s.id,
           ('Subcontrol ' || COALESCE(s.order_no::text, s.id::text)) AS code,
           s.title,
           s.description
      FROM subcontrols_struct_eu s
     ORDER BY s.control_id ASC NULLS LAST, s.order_no ASC NULLS LAST, s.id ASC
    `,
    { type: QueryTypes.SELECT }
  );

  const subclausesIso = await sequelize.query<FrameworkCatalogEntry>(
    `
    SELECT id, subclause_id AS code, title, description
      FROM subclauses_struct_iso
     ORDER BY order_no ASC NULLS LAST, id ASC
    `,
    { type: QueryTypes.SELECT }
  );

  const annexCategoriesIso = await sequelize.query<FrameworkCatalogEntry>(
    `
    SELECT id,
           ('Annex A.' || COALESCE(sub_id::text, id::text)) AS code,
           title,
           description
      FROM annexcategories_struct_iso
     ORDER BY annex_id ASC NULLS LAST, order_no ASC NULLS LAST, id ASC
    `,
    { type: QueryTypes.SELECT }
  );

  const subclausesIso27001 = await sequelize.query<FrameworkCatalogEntry>(
    `
    SELECT id, subclause_id AS code, title, description
      FROM subclauses_struct_iso27001
     ORDER BY order_no ASC NULLS LAST, id ASC
    `,
    { type: QueryTypes.SELECT }
  );

  const annexControlsIso27001 = await sequelize.query<FrameworkCatalogEntry>(
    `
    SELECT id, control_id AS code, title, description
      FROM annexcontrols_struct_iso27001
     ORDER BY order_no ASC NULLS LAST, id ASC
    `,
    { type: QueryTypes.SELECT }
  );

  const subcategoriesNist = await sequelize.query<FrameworkCatalogEntry>(
    `
    SELECT id,
           (function || '-' || subcategory_id::text) AS code,
           COALESCE(description, (function || '-' || subcategory_id::text)) AS title,
           description
      FROM nist_ai_rmf_subcategories_struct
     ORDER BY function ASC, subcategory_id ASC, id ASC
    `,
    { type: QueryTypes.SELECT }
  );

  return {
    control_eu: controlsEu,
    subcontrol_eu: subcontrolsEu,
    subclause_struct_iso: subclausesIso,
    annex_category_iso: annexCategoriesIso,
    iso27001_subclause: subclausesIso27001,
    iso27001_annex_category: annexControlsIso27001,
    subcategory_nist: subcategoriesNist,
  };
};

export const bulkUpdateMasterControlsQuery = async (
  ids: number[],
  patch: Partial<Pick<IMasterControl, "status" | "owner" | "due_date">>,
  organizationId: number,
  transaction: Transaction
): Promise<number> => {
  const sets: string[] = [];
  const replacements: Record<string, any> = { ids, organizationId };
  if ("status" in patch) {
    sets.push("status = :status");
    replacements.status = patch.status ?? null;
  }
  if ("owner" in patch) {
    sets.push("owner = :owner");
    replacements.owner = patch.owner ?? null;
  }
  if ("due_date" in patch) {
    sets.push("due_date = :due_date");
    replacements.due_date = patch.due_date ?? null;
  }
  if (sets.length === 0 || ids.length === 0) return 0;
  sets.push("updated_at = NOW()");
  const [, affected] = await sequelize.query(
    `
    UPDATE master_controls
       SET ${sets.join(", ")}
     WHERE organization_id = :organizationId
       AND id IN (:ids)
    `,
    { replacements, transaction }
  );
  const rowCount =
    typeof affected === "number"
      ? affected
      : (affected as any)?.rowCount ?? 0;
  return rowCount;
};
