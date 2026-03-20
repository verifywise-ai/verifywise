import { VendorRiskModel } from "../domain.layer/models/vendorRisk/vendorRisk.model";
import { IVendorRisk } from "../domain.layer/interfaces/i.vendorRisk";
import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";

export const getVendorRisksByProjectIdQuery = async (
  projectId: number,
  organizationId: number,
  filter: "active" | "deleted" | "all" = "active"
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
    }
  );
  return vendorRisks;
};

export const getVendorRisksByVendorIdQuery = async (
  vendorId: number,
  organizationId: number,
  filter: "active" | "deleted" | "all" = "active"
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
    }
  );
  return vendorRisks;
};

export const getVendorRiskByIdQuery = async (
  id: number,
  organizationId: number,
  includeDeleted: boolean = false
): Promise<IVendorRisk | null> => {
  const whereClause = includeDeleted
    ? "WHERE organization_id = :organizationId AND id = :id"
    : "WHERE organization_id = :organizationId AND id = :id AND is_deleted = false";
  const result = await sequelize.query(
    `SELECT * FROM vendorRisks ${whereClause} ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: VendorRiskModel,
    }
  );
  return result[0];
};

export const createNewVendorRiskQuery = async (
  vendorRisk: IVendorRisk,
  organizationId: number,
  transaction: Transaction
): Promise<VendorRiskModel> => {
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
        impact_description: vendorRisk.impact_description,
        likelihood: vendorRisk.likelihood,
        risk_severity: vendorRisk.risk_severity,
        action_plan: vendorRisk.action_plan,
        action_owner: vendorRisk.action_owner,
        risk_level: vendorRisk.risk_level,
        is_demo: vendorRisk.is_demo || false,
      },
      mapToModel: true,
      model: VendorRiskModel,
      // type: QueryTypes.INSERT
      transaction,
    }
  );
  return result[0];
};

export const updateVendorRiskByIdQuery = async (
  id: number,
  vendorRisk: Partial<VendorRiskModel>,
  organizationId: number,
  transaction: Transaction
): Promise<VendorRiskModel | null> => {
  const updateVendorRisk: Partial<Record<keyof VendorRiskModel, any>> & { organizationId?: number } = {};
  const setClause = [
    "vendor_id",
    "risk_description",
    "impact_description",
    "likelihood",
    "risk_severity",
    "action_plan",
    "action_owner",
    "risk_level",
  ]
    .filter((f) => {
      if (
        vendorRisk[f as keyof VendorRiskModel] !== undefined &&
        vendorRisk[f as keyof VendorRiskModel]
      ) {
        updateVendorRisk[f as keyof VendorRiskModel] =
          vendorRisk[f as keyof VendorRiskModel];
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");

  const query = `UPDATE vendorrisks SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;

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

export const deleteVendorRiskByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction
): Promise<Boolean> => {
  const result = await sequelize.query(
    `UPDATE vendorrisks SET is_deleted = true, deleted_at = NOW(), updated_at = NOW() WHERE organization_id = :organizationId AND id = :id AND is_deleted = false RETURNING *`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: VendorRiskModel,
      type: QueryTypes.UPDATE,
      transaction,
    }
  );
  return result.length > 0;
};

export const deleteVendorRisksForVendorQuery = async (
  vendorId: number,
  organizationId: number,
  transaction: Transaction
): Promise<Boolean> => {
  const result = await sequelize.query(
    `DELETE FROM vendorrisks WHERE organization_id = :organizationId AND vendor_id = :vendor_id RETURNING id`,
    {
      replacements: { organizationId, vendor_id: vendorId },
      mapToModel: true,
      model: VendorRiskModel,
      type: QueryTypes.UPDATE,
      transaction,
    }
  );
  return result.length > 0;
};

export const getAllVendorRisksAllProjectsQuery = async (
  organizationId: number,
  filter: "active" | "deleted" | "all" = "active"
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

  const risks = await sequelize.query(
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
    }
  );
  return risks;
};
