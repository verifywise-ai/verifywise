import { VendorRiskModel } from "../domain.layer/models/vendorRisk/vendorRisk.model";
import { IVendorRisk } from "../domain.layer/interfaces/i.vendorRisk";
import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { fetchCustomFieldsForEntities } from "./customField.utils";
import {
  recordEntityDeletion,
  recordEntityDeletionBulk,
  recordEntityRestoration,
} from "./changeHistory.base.utils";
import { findUserFieldOutsideOrganization, parseReferencedIds } from "./user.utils";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import { calculateRiskLevel } from "./riskLevel.utils";

export const getVendorRisksByProjectIdQuery = async (
  projectId: number,
  organizationId: number,
  filter: "active" | "deleted" | "all" = "active",
): Promise<IVendorRisk[]> => {
  let whereClause = "";
  switch (filter) {
    case "active":
      whereClause = "AND is_deleted = false";
      break;
    case "deleted":
      whereClause = "AND is_deleted = true";
      break;
    case "all":
      whereClause = "";
      break;
  }

  const vendorRisks = await sequelize.query(
    `SELECT * FROM vendorRisks WHERE organization_id = :organizationId AND vendor_id IN (SELECT vendor_id FROM vendors_projects WHERE organization_id = :organizationId AND project_id = :project_id) ${whereClause} ORDER BY created_at DESC, id ASC;`,
    {
      replacements: { organizationId, project_id: projectId },
      mapToModel: true,
      model: VendorRiskModel,
    },
  );
  return vendorRisks;
};

export const getVendorRisksByVendorIdQuery = async (
  vendorId: number,
  organizationId: number,
  filter: "active" | "deleted" | "all" = "active",
): Promise<IVendorRisk[]> => {
  let whereClause = "";
  switch (filter) {
    case "active":
      whereClause = "AND is_deleted = false";
      break;
    case "deleted":
      whereClause = "AND is_deleted = true";
      break;
    case "all":
      whereClause = "";
      break;
  }

  const vendorRisks = await sequelize.query(
    `SELECT * FROM vendorRisks WHERE organization_id = :organizationId AND vendor_id = :vendor_id ${whereClause} ORDER BY created_at DESC, id ASC;`,
    {
      replacements: { organizationId, vendor_id: vendorId },
      mapToModel: true,
      model: VendorRiskModel,
    },
  );
  return vendorRisks;
};

export const getVendorRiskByIdQuery = async (
  id: number,
  organizationId: number,
  includeDeleted: boolean = false,
): Promise<(IVendorRisk & { frameworks?: number[] }) | null> => {
  const whereClause = includeDeleted
    ? "WHERE organization_id = :organizationId AND id = :id"
    : "WHERE organization_id = :organizationId AND id = :id AND is_deleted = false";
  const result = await sequelize.query(
    `SELECT * FROM vendorRisks ${whereClause} ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: VendorRiskModel,
    },
  );
  if (!result[0]) return null;

  // Convert model instance to plain object so toJSON() doesn't strip extra fields
  const vendorRisk: IVendorRisk & { frameworks?: number[] } =
    typeof result[0].toJSON === "function" ? result[0].toJSON() : { ...(result[0] as any) };

  // Attach framework IDs (defensive: table may not exist if migration hasn't run)
  try {
    const frameworkResult = (await sequelize.query(
      `SELECT framework_id FROM frameworks_vendorrisks WHERE vendorrisk_id = :vendorRiskId AND organization_id = :organizationId`,
      { replacements: { vendorRiskId: id, organizationId } },
    )) as [{ framework_id: number }[], number];
    if (frameworkResult[0].length > 0) {
      vendorRisk.frameworks = frameworkResult[0].map((f) => f.framework_id);
    }
  } catch {
    // frameworks_vendorrisks table may not exist yet — skip
  }

  return vendorRisk;
};

/** enum_vendorrisks_likelihood, by lower-case spelling. */
const VENDOR_RISK_LIKELIHOOD_BY_KEY: Record<string, string> = {
  rare: "Rare",
  unlikely: "Unlikely",
  possible: "Possible",
  likely: "Likely",
  "almost certain": "Almost certain",
};

/**
 * The vendor risk likelihood enum spells the top value "Almost certain", while
 * project risks use "Almost Certain". Any casing (and surrounding spaces) of an
 * enum value is written as the enum spells it, so a caller using the project
 * spelling saves instead of failing on the enum. Other values pass unchanged.
 */
export const normalizeVendorRiskLikelihood = <T>(likelihood: T): T => {
  if (typeof likelihood !== "string") return likelihood;
  return (VENDOR_RISK_LIKELIHOOD_BY_KEY[likelihood.trim().toLowerCase()] ?? likelihood) as T;
};

/**
 * Tenant guard for a vendor risk's action owner: a new or changed one must be
 * a member of the organization, or the assignment email would reach another
 * organization's user. Every vendor risk write (REST, Advisor, demo seed)
 * goes through createNewVendorRiskQuery / updateVendorRiskByIdQuery.
 *
 * @throws ValidationException naming action_owner.
 */
export const assertVendorRiskOwnerInOrganization = async (
  actionOwner: unknown,
  organizationId: number,
  transaction: Transaction,
  stored?: unknown,
): Promise<void> => {
  const outside = await findUserFieldOutsideOrganization(
    [{ field: "action_owner", value: actionOwner, stored }],
    organizationId,
    transaction,
  );
  if (outside) {
    throw new ValidationException(
      outside.reason === "invalid"
        ? "The action owner is not a valid user id"
        : "The action owner must be a member of this organization",
      "action_owner",
      actionOwner,
    );
  }
};

/** The action_owner column value: null, '' and 0 mean no owner and are stored as NULL. */
const vendorActionOwnerValue = (value: unknown): unknown =>
  value === null || value === undefined || value === "" || value === 0 ? null : value;

/**
 * Tenant guard for a vendor risk's vendor: a vendor_id must name a vendor of
 * the organization, or the risk (and the vendor name in its assignment
 * email) would hang off another organization's vendor. Read on the caller's
 * transaction. undefined and null mean "not written" and pass.
 *
 * @throws ValidationException naming vendor_id.
 */
const assertVendorInOrganization = async (
  vendorId: unknown,
  organizationId: number,
  transaction: Transaction,
): Promise<void> => {
  if (vendorId === undefined || vendorId === null) return;
  const ids = parseReferencedIds([vendorId]);
  const found =
    ids && ids.length === 1
      ? ((await sequelize.query(
          `SELECT id FROM vendors WHERE organization_id = :organizationId AND id = :id`,
          {
            replacements: { organizationId, id: ids[0] },
            type: QueryTypes.SELECT,
            transaction,
          },
        )) as { id: number }[])
      : [];
  if (found.length === 0) {
    throw new ValidationException(
      "The vendor must belong to this organization",
      "vendor_id",
      vendorId,
    );
  }
};

export const createNewVendorRiskQuery = async (
  vendorRisk: IVendorRisk,
  organizationId: number,
  transaction: Transaction,
): Promise<VendorRiskModel> => {
  await assertVendorInOrganization(vendorRisk.vendor_id, organizationId, transaction);
  await assertVendorRiskOwnerInOrganization(vendorRisk.action_owner, organizationId, transaction);
  const result = await sequelize.query(
    `INSERT INTO vendorRisks (
      organization_id, vendor_id, order_no, risk_description, impact_description,
      likelihood, risk_severity, action_plan, action_owner, risk_level, is_demo
    ) VALUES (
      :organization_id, :vendor_id, :order_no, :risk_description, :impact_description,
      :likelihood, :risk_severity, :action_plan, :action_owner, :risk_level, :is_demo
    ) RETURNING *`,
    {
      replacements: {
        organization_id: organizationId,
        vendor_id: vendorRisk.vendor_id,
        order_no: vendorRisk.order_no || null,
        risk_description: vendorRisk.risk_description,
        // Optional: a create may leave them out.
        impact_description: vendorRisk.impact_description ?? null,
        likelihood: normalizeVendorRiskLikelihood(vendorRisk.likelihood),
        risk_severity: vendorRisk.risk_severity,
        action_plan: vendorRisk.action_plan ?? null,
        action_owner: vendorActionOwnerValue(vendorRisk.action_owner),
        // Computed from likelihood and severity; a sent risk_level is ignored.
        risk_level: calculateRiskLevel(vendorRisk.likelihood, vendorRisk.risk_severity),
        is_demo: vendorRisk.is_demo || false,
      },
      mapToModel: true,
      model: VendorRiskModel,
      // type: QueryTypes.INSERT
      transaction,
    },
  );
  return result[0];
};

export const updateVendorRiskByIdQuery = async (
  id: number,
  vendorRisk: Partial<VendorRiskModel>,
  organizationId: number,
  transaction: Transaction,
): Promise<VendorRiskModel | null> => {
  // The stored row, read and locked on this transaction so a concurrent save
  // cannot change it between the checks below and the UPDATE. A missing or
  // soft-deleted vendor risk is not edited: the caller answers 404.
  const [stored] = (await sequelize.query(
    `SELECT action_owner, likelihood, risk_severity FROM vendorrisks
      WHERE organization_id = :organizationId AND id = :id AND is_deleted = false
      FOR UPDATE`,
    { replacements: { organizationId, id }, type: QueryTypes.SELECT, transaction },
  )) as { action_owner: number | null; likelihood: string | null; risk_severity: string | null }[];
  if (!stored) return null;

  // An empty vendor_id is not written (see the SET clause below).
  if (vendorRisk.vendor_id) {
    await assertVendorInOrganization(vendorRisk.vendor_id, organizationId, transaction);
  }

  // Only a new owner is checked: one who has since left the organization
  // stays on the vendor risk and must not block every other edit.
  await assertVendorRiskOwnerInOrganization(
    vendorRisk.action_owner,
    organizationId,
    transaction,
    stored.action_owner,
  );

  const updateVendorRisk: Partial<Record<keyof VendorRiskModel, any>> & {
    organizationId?: number;
  } = {};
  const columns = [
    "vendor_id",
    "risk_description",
    "impact_description",
    "likelihood",
    "risk_severity",
    "action_plan",
    "action_owner",
  ].filter((f) => {
    // action_owner can be cleared: null, '' and 0 write NULL.
    if (f === "action_owner") {
      if (vendorRisk.action_owner === undefined) return false;
      updateVendorRisk.action_owner = vendorActionOwnerValue(vendorRisk.action_owner);
      return true;
    }
    // Optional text: a value that is sent is written, so '' and null clear it.
    if (f === "impact_description" || f === "action_plan") {
      const value = vendorRisk[f];
      if (value === undefined) return false;
      updateVendorRisk[f] = value;
      return true;
    }
    if (
      vendorRisk[f as keyof VendorRiskModel] !== undefined &&
      vendorRisk[f as keyof VendorRiskModel]
    ) {
      updateVendorRisk[f as keyof VendorRiskModel] =
        f === "likelihood"
          ? normalizeVendorRiskLikelihood(vendorRisk.likelihood)
          : vendorRisk[f as keyof VendorRiskModel];
      return true;
    }
    return false;
  });

  // The level follows likelihood and severity as they will be stored: the
  // sent ones, else the stored ones. A sent risk_level is ignored. Written
  // on every update, so a level left stale by an older write is corrected;
  // an older risk without likelihood or severity keeps its level.
  const level = calculateRiskLevel(
    updateVendorRisk.likelihood ?? stored.likelihood,
    updateVendorRisk.risk_severity ?? stored.risk_severity,
  );
  if (level) {
    updateVendorRisk.risk_level = level;
    columns.push("risk_level");
  }
  const setClause = columns.map((f) => `${f} = :${f}`).join(", ");

  // A request that changes only frameworks names no column: read the row
  // back instead of building an UPDATE with an empty SET.
  const query = setClause
    ? `UPDATE vendorrisks SET ${setClause} WHERE organization_id = :organizationId AND id = :id AND is_deleted = false RETURNING *;`
    : `SELECT * FROM vendorrisks WHERE organization_id = :organizationId AND id = :id AND is_deleted = false;`;

  updateVendorRisk.organizationId = organizationId;
  updateVendorRisk.id = id;

  const result = await sequelize.query(query, {
    replacements: updateVendorRisk,
    mapToModel: true,
    model: VendorRiskModel,
    // type: QueryTypes.UPDATE,
    transaction,
  });

  return result[0];
};

/**
 * Soft-deletes a vendor risk and records the deletion in its history, as
 * `deletedBy` or, without one (an Advisor tool), as the system. Its custom
 * field values, framework links and history stay, so a restore brings the
 * risk back whole. Returns false when there is no active risk with this id.
 */
export const deleteVendorRiskByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction,
  deletedBy?: number,
): Promise<boolean> => {
  // RETURNING rows, read as a SELECT: with QueryTypes.UPDATE the result is
  // [rows, count], which is never empty, so a missing id read as deleted.
  const rows = await sequelize.query(
    `UPDATE vendorrisks SET is_deleted = true, deleted_at = NOW(), updated_at = NOW() WHERE organization_id = :organizationId AND id = :id AND is_deleted = false RETURNING id`,
    {
      replacements: { organizationId, id },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  if (rows.length === 0) return false;
  await recordEntityDeletion(
    "vendor_risk",
    id,
    deletedBy ?? null,
    organizationId,
    transaction,
    deletedBy === undefined,
  );
  return true;
};

/**
 * Restores a soft-deleted vendor risk and records it in its history. Returns
 * the restored row, or null when there is no deleted risk with this id.
 */
export const restoreVendorRiskByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction,
  restoredBy: number,
): Promise<IVendorRisk | null> => {
  const rows = await sequelize.query<IVendorRisk>(
    `UPDATE vendorrisks SET is_deleted = false, deleted_at = NULL, updated_at = NOW()
      WHERE organization_id = :organizationId AND id = :id AND is_deleted = true
      RETURNING *`,
    {
      replacements: { organizationId, id },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  if (rows.length === 0) return null;
  await recordEntityRestoration("vendor_risk", id, restoredBy, organizationId, transaction);
  return rows[0];
};

/**
 * Hard-deletes every risk of a vendor (the vendor itself is being deleted),
 * with their custom field values; framework and risk links cascade. Risks
 * still active get a "deleted" history entry; soft-deleted ones already have
 * one. Returns the ids deleted.
 */
export const deleteVendorRisksForVendorQuery = async (
  vendorId: number,
  organizationId: number,
  transaction: Transaction,
  deletedBy?: number,
): Promise<number[]> => {
  const rows = await sequelize.query<{ id: number; is_deleted: boolean }>(
    `DELETE FROM vendorrisks WHERE organization_id = :organizationId AND vendor_id = :vendor_id RETURNING id, is_deleted`,
    {
      replacements: { organizationId, vendor_id: vendorId },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  const ids = rows.map((row) => Number(row.id));
  if (ids.length === 0) return ids;
  await sequelize.query(
    `DELETE FROM custom_field_values
      WHERE organization_id = :organizationId AND entity_type = 'vendor_risk' AND entity_id IN (:ids)`,
    { replacements: { organizationId, ids }, transaction },
  );
  const activeIds = rows.filter((row) => !row.is_deleted).map((row) => Number(row.id));
  if (activeIds.length > 0) {
    await recordEntityDeletionBulk(
      "vendor_risk",
      activeIds,
      deletedBy ?? null,
      organizationId,
      transaction,
      deletedBy === undefined,
    );
  }
  return ids;
};

export const getAllVendorRisksAllProjectsQuery = async (
  organizationId: number,
  filter: "active" | "deleted" | "all" = "active",
) => {
  let whereClause = "";
  switch (filter) {
    case "active":
      whereClause = "AND vr.is_deleted = false";
      break;
    case "deleted":
      whereClause = "AND vr.is_deleted = true";
      break;
    case "all":
      whereClause = "";
      break;
  }

  const risks = (await sequelize.query(
    `SELECT
      vr.id AS risk_id,
      vr.vendor_id,
      vr.order_no,
      vr.risk_description,
      vr.impact_description,
      vr.likelihood,
      vr.risk_severity,
      vr.action_plan,
      vr.action_owner,
      vr.risk_level,
      vr.is_demo,
      vr.created_at,
      vr.updated_at,
      vr.is_deleted,
      vr.deleted_at,
      v.vendor_name,
      vp.project_id AS project_id,
      p.project_title AS project_title
    FROM vendorRisks AS vr
    JOIN vendors AS v ON vr.vendor_id = v.id AND v.organization_id = :organizationId
    LEFT JOIN vendors_projects AS vp ON v.id = vp.vendor_id AND vp.organization_id = :organizationId
    LEFT JOIN projects AS p ON vp.project_id = p.id AND p.organization_id = :organizationId
    WHERE vr.organization_id = :organizationId ${whereClause}
    ORDER BY vp.project_id, v.id, vr.id`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  )) as any[];

  const ids = Array.from(
    new Set(risks.map((r) => r.risk_id).filter((id): id is number => typeof id === "number")),
  );
  const customFieldsByRisk = await fetchCustomFieldsForEntities("vendor_risk", ids, organizationId);
  for (const r of risks) {
    r.custom_fields = customFieldsByRisk.get(r.risk_id) ?? [];
  }
  return risks;
};

export const createVendorRiskFrameworkAssociations = async (
  frameworks: number[],
  vendorRiskId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<void> => {
  if (!frameworks || frameworks.length === 0) return;

  const frameworkReplacements: Record<string, number>[] = [];
  const placeholders = frameworks
    .map((_, index) => {
      frameworkReplacements.push({
        [`frameworkId_${index}`]: frameworks[index],
      });
      return `(:frameworkId_${index}, :vendorRiskId, :organizationId)`;
    })
    .join(", ");
  const replacements: any = {
    vendorRiskId,
    organizationId,
    ...Object.assign({}, ...frameworkReplacements),
  };
  await sequelize.query(
    `INSERT INTO frameworks_vendorrisks (framework_id, vendorrisk_id, organization_id) VALUES ${placeholders}`,
    {
      replacements,
      transaction,
    },
  );
};

export const deleteVendorRiskFrameworkAssociations = async (
  vendorRiskId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<void> => {
  await sequelize.query(
    `DELETE FROM frameworks_vendorrisks WHERE vendorrisk_id = :vendorRiskId AND organization_id = :organizationId`,
    {
      replacements: { vendorRiskId, organizationId },
      transaction,
    },
  );
};

export const getVendorRisksByFrameworkIdQuery = async (
  frameworkId: number,
  organizationId: number,
  filter: "active" | "deleted" | "all" = "active",
): Promise<any[]> => {
  let whereClause = "";
  switch (filter) {
    case "active":
      whereClause = "AND vr.is_deleted = false";
      break;
    case "deleted":
      whereClause = "AND vr.is_deleted = true";
      break;
    case "all":
      whereClause = "";
      break;
  }

  const risks = await sequelize.query(
    `SELECT
      vr.*,
      v.vendor_name
    FROM vendorRisks AS vr
    INNER JOIN frameworks_vendorrisks fvr ON vr.id = fvr.vendorrisk_id AND fvr.framework_id = :frameworkId AND fvr.organization_id = :organizationId
    JOIN vendors AS v ON vr.vendor_id = v.id AND v.organization_id = :organizationId
    WHERE vr.organization_id = :organizationId ${whereClause}
    ORDER BY vr.created_at DESC, vr.id ASC`,
    {
      replacements: { frameworkId, organizationId },
      type: QueryTypes.SELECT,
    },
  );
  return risks;
};

export const getVendorRiskFrameworkIds = async (
  vendorRiskId: number,
  organizationId: number,
): Promise<number[]> => {
  const result = (await sequelize.query(
    `SELECT framework_id FROM frameworks_vendorrisks WHERE vendorrisk_id = :vendorRiskId AND organization_id = :organizationId`,
    { replacements: { vendorRiskId, organizationId } },
  )) as [{ framework_id: number }[], number];
  return result[0].map((f) => f.framework_id);
};
