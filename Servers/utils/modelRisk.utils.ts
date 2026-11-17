import { ModelRiskModel } from "../domain.layer/models/modelRisk/modelRisk.model";
import { IModelRisk } from "../domain.layer/interfaces/i.modelRisk";
import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import {
  assertModelInOrganization,
  assertOrganizationMember,
  toPositiveId,
} from "./modelReferences.utils";

export const OWNER_NOT_IN_ORGANIZATION = "The owner must be a member of this organization.";
import {
  deleteAllCustomFieldValuesForEntityQuery,
  fetchCustomFieldsForEntities,
} from "./customField.utils";
import { getFieldLabel, recordEntityChange } from "./changeHistory.base.utils";

/**
 * Get all model risks for an organization
 */
export async function getAllModelRisksQuery(
  organizationId: number,
  filter: "active" | "deleted" | "all" = "active",
): Promise<ModelRiskModel[]> {
  let whereClause = "WHERE organization_id = :organizationId";
  switch (filter) {
    case "active":
      whereClause += " AND is_deleted = false";
      break;
    case "deleted":
      whereClause += " AND is_deleted = true";
      break;
    case "all":
      // No additional filter
      break;
  }

  const modelRisks = await sequelize.query(
    `SELECT * FROM model_risks ${whereClause} ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: ModelRiskModel,
    },
  );

  const ids = modelRisks.map((r) => r.id).filter((id): id is number => typeof id === "number");
  const customFieldsByRisk = await fetchCustomFieldsForEntities("model_risk", ids, organizationId);
  for (const r of modelRisks as any[]) {
    r.custom_fields = customFieldsByRisk.get(r.id) ?? [];
  }
  return modelRisks;
}

/**
 * Get a model risk by ID
 */
export async function getModelRiskByIdQuery(
  id: number,
  organizationId: number,
  includeDeleted: boolean = false,
): Promise<ModelRiskModel | null> {
  const whereClause = includeDeleted
    ? "WHERE organization_id = :organizationId AND id = :id"
    : "WHERE organization_id = :organizationId AND id = :id AND is_deleted = false";
  const modelRisk = await sequelize.query(`SELECT * FROM model_risks ${whereClause}`, {
    replacements: { organizationId, id },
    mapToModel: true,
    model: ModelRiskModel,
  });

  if (!modelRisk.length) return null;

  return modelRisk[0];
}

/**
 * Create a new model risk
 */
export async function createNewModelRiskQuery(
  data: Partial<IModelRisk>,
  organizationId: number,
  transaction?: import("sequelize").Transaction,
): Promise<ModelRiskModel> {
  const created_at = new Date();
  // The model and the owner must be the organization's, checked in the
  // transaction that stores them. Every caller (REST, advisor, intake, Shadow
  // AI, seeds) goes through here.
  const modelId =
    data.model_id === undefined || data.model_id === null || (data.model_id as unknown) === ""
      ? null
      : await assertModelInOrganization(data.model_id, organizationId, transaction ?? null);
  const ownerId = await assertOrganizationMember(
    data.owner,
    organizationId,
    "owner",
    OWNER_NOT_IN_ORGANIZATION,
    transaction ?? null,
  );
  const result = await sequelize.query(
    `INSERT INTO model_risks (organization_id, risk_name, risk_category, risk_level, status, owner, target_date, description, mitigation_plan, impact, likelihood, key_metrics, current_values, threshold, model_id, created_at, updated_at, is_demo)
        VALUES (:organization_id, :risk_name, :risk_category, :risk_level, :status, :owner, :target_date, :description, :mitigation_plan, :impact, :likelihood, :key_metrics, :current_values, :threshold, :model_id, :created_at, :updated_at, :is_demo) RETURNING *`,
    {
      replacements: {
        organization_id: organizationId,
        risk_name: data.risk_name || "",
        risk_category: data.risk_category,
        risk_level: data.risk_level,
        status: data.status || "Open",
        owner: ownerId,
        target_date: data.target_date,
        description: data.description || "",
        mitigation_plan: data.mitigation_plan || "",
        impact: data.impact || "",
        likelihood: data.likelihood || "",
        key_metrics: data.key_metrics || "",
        current_values: data.current_values || "",
        threshold: data.threshold || "",
        model_id: modelId,
        created_at: created_at,
        updated_at: created_at,
        is_demo: data.is_demo || false,
      },
      mapToModel: true,
      model: ModelRiskModel,
      transaction,
    },
  );

  return result[0];
}

/**
 * Update a model risk by ID
 */
export async function updateModelRiskByIdQuery(
  id: number,
  updatedModelRisk: Partial<IModelRisk>,
  organizationId: number,
  transaction?: import("sequelize").Transaction,
): Promise<ModelRiskModel | null> {
  const updated_at = new Date();

  // A changed model or owner must be the organization's. Unchanged values are
  // not re-checked, so a risk whose owner has since left can still be edited.
  // An archived (deleted) risk is not found: it cannot be edited.
  const current = (await sequelize.query(
    `SELECT owner, model_id FROM model_risks WHERE organization_id = :organizationId AND id = :id AND is_deleted = false`,
    { replacements: { organizationId, id }, type: QueryTypes.SELECT, transaction },
  )) as { owner: number | null; model_id: number | null }[];
  if (current.length === 0) return null;
  const checked: Partial<IModelRisk> = { ...updatedModelRisk };
  if (updatedModelRisk.model_id !== undefined) {
    const raw = updatedModelRisk.model_id as unknown;
    if (raw === null || raw === "") {
      checked.model_id = null as any;
    } else if (toPositiveId(raw) !== current[0].model_id) {
      checked.model_id = await assertModelInOrganization(raw, organizationId, transaction ?? null);
    } else {
      checked.model_id = current[0].model_id as number;
    }
  }
  if (updatedModelRisk.owner !== undefined) {
    const raw = updatedModelRisk.owner as unknown;
    if (raw !== null && raw !== "" && toPositiveId(raw) === current[0].owner) {
      checked.owner = current[0].owner as any;
    } else {
      checked.owner = (await assertOrganizationMember(
        raw,
        organizationId,
        "owner",
        OWNER_NOT_IN_ORGANIZATION,
        transaction ?? null,
      )) as any;
    }
  }
  updatedModelRisk = checked;

  const updateModelRisk: Partial<IModelRisk> & { organization_id?: number } = { updated_at };
  const setClause = [
    "risk_name",
    "risk_category",
    "risk_level",
    "status",
    "owner",
    "target_date",
    "description",
    "mitigation_plan",
    "impact",
    "likelihood",
    "key_metrics",
    "current_values",
    "threshold",
    "model_id",
  ]
    .filter((field) => {
      if (updatedModelRisk[field as keyof IModelRisk] !== undefined) {
        (updateModelRisk as any)[field] = updatedModelRisk[field as keyof IModelRisk];
        return true;
      }
      return false;
    })
    .map((field) => `${field} = :${field}`)
    .join(", ");

  if (!setClause) {
    return getModelRiskByIdQuery(id, organizationId); // No fields to update, return current state
  }

  updateModelRisk.id = id;
  updateModelRisk.organization_id = organizationId;

  const query = `UPDATE model_risks SET ${setClause} WHERE organization_id = :organization_id AND id = :id AND is_deleted = false RETURNING *`;

  const result = await sequelize.query(query, {
    replacements: updateModelRisk,
    mapToModel: true,
    model: ModelRiskModel,
    transaction,
  });
  return result[0] || null;
}

/**
 * Delete a model risk by ID (soft delete). False when the organization has no
 * such risk or it is already archived.
 */
export async function deleteModelRiskByIdQuery(
  id: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<boolean> {
  // A raw query returns [rows, result]: the RETURNING rows say whether a row
  // was archived. (QueryTypes.UPDATE returned [rows, rowCount], a pair that
  // always has length 2, so an archived or unknown risk read as deleted.)
  const [rows] = (await sequelize.query(
    `UPDATE model_risks SET is_deleted = true, deleted_at = NOW(), updated_at = NOW() WHERE organization_id = :organizationId AND id = :id AND is_deleted = false RETURNING id`,
    { replacements: { organizationId, id }, transaction },
  )) as [{ id: number }[], unknown];
  if (rows.length === 0) return false;
  await deleteAllCustomFieldValuesForEntityQuery("model_risk", id, organizationId, transaction);
  return true;
}

/**
 * Before a model is deleted: its risks lose the model, and with `archive` its
 * live risks are archived first, each the way a single model risk delete is
 * (custom field values removed, deletion in change history). Kept live risks
 * get an "Associated model" change in their history. The foreign key
 * (ON DELETE SET NULL) clears model_id too; doing it here, scoped to the
 * organization, is what records the history.
 *
 * `changedByUserId` null (AI Advisor) records the history as the system's.
 */
export async function releaseModelRisksOfModelQuery(
  modelId: number,
  archive: boolean,
  organizationId: number,
  changedByUserId: number | null,
  transaction: Transaction,
): Promise<{ archived: number[]; kept: number[] }> {
  const bySystem = changedByUserId === null;
  const archived: number[] = [];
  if (archive) {
    const live = (await sequelize.query(
      `SELECT id FROM model_risks
        WHERE organization_id = :organizationId AND model_id = :modelId AND is_deleted = false
        ORDER BY id`,
      { replacements: { organizationId, modelId }, type: QueryTypes.SELECT, transaction },
    )) as { id: number }[];
    for (const { id } of live) {
      if (!(await deleteModelRiskByIdQuery(id, organizationId, transaction))) continue;
      archived.push(id);
      await recordEntityChange(
        "model_risk",
        id,
        "deleted",
        changedByUserId,
        organizationId,
        "Model Risk",
        "Active",
        "Deleted",
        transaction,
        bySystem,
      );
    }
  }

  const models = (await sequelize.query(
    `SELECT model FROM model_inventories WHERE organization_id = :organizationId AND id = :modelId`,
    { replacements: { organizationId, modelId }, type: QueryTypes.SELECT, transaction },
  )) as { model: string | null }[];
  const modelName = models[0]?.model || `Model #${modelId}`;

  const [detached] = (await sequelize.query(
    `UPDATE model_risks SET model_id = NULL, updated_at = NOW()
      WHERE organization_id = :organizationId AND model_id = :modelId
      RETURNING id, is_deleted`,
    { replacements: { organizationId, modelId }, transaction },
  )) as [{ id: number; is_deleted: boolean }[], unknown];
  const kept = detached
    .filter((row) => !row.is_deleted)
    .map((row) => row.id)
    .sort((a, b) => a - b);
  for (const id of kept) {
    await recordEntityChange(
      "model_risk",
      id,
      "updated",
      changedByUserId,
      organizationId,
      getFieldLabel("model_risk", "model_id"),
      modelName,
      "-",
      transaction,
      bySystem,
    );
  }
  return { archived, kept };
}
