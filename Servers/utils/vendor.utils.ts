import { VendorModel } from "../domain.layer/models/vendor/vendor.model";
import { sequelize } from "../database/db";
import { deleteVendorRisksForVendorQuery } from "./vendorRisk.utils";
import { VendorsProjectsModel } from "../domain.layer/models/vendorsProjects/vendorsProjects.model";
import { QueryTypes, Transaction } from "sequelize";
import {
  getUserProjects,
  updateProjectUpdatedByIdQuery,
} from "./project.utils";
import { IVendor } from "../domain.layer/interfaces/i.vendor";
import { enqueueAutomationAction } from "../services/automations/automationProducer";
import { TenantAutomationActionModel } from "../domain.layer/models/tenantAutomationAction/tenantAutomationAction.model";
import {
  buildVendorReplacements,
  buildVendorUpdateReplacements,
} from "./automation/vendor.automation.utils";
import { replaceTemplateVariables } from "./automation/automation.utils";

export const getAllVendorsQuery = async (
  organizationId: number
): Promise<IVendor[]> => {
  const vendors = await sequelize.query(
    `SELECT * FROM vendors WHERE organization_id = :organizationId ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: VendorModel,
    }
  );
  const vendorsWithDetails = [];
  for (let vendor of vendors as VendorModel[]) {
    const projects = await sequelize.query(
      `SELECT project_id FROM vendors_projects WHERE organization_id = :organizationId AND vendor_id = :vendor_id`,
      {
        replacements: { organizationId, vendor_id: vendor.id },
        mapToModel: true,
        model: VendorsProjectsModel,
      }
    );

    const reviewer_name = (await sequelize.query(
      `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :reviewer_id`,
      {
        replacements: { reviewer_id: vendor.reviewer },
      }
    )) as [{ full_name: string }[], number];

    // Extract dataValues to include all database columns including scorecard fields
    vendorsWithDetails.push({
      ...vendor.dataValues,
      created_at: (vendor.createdAt ?? vendor.created_at)?.toISOString(),
      updated_at: (vendor.updatedAt ?? vendor.updated_at)?.toISOString(),
      projects: projects.map((p) => p.project_id),
      reviewer_name:
        reviewer_name[0].length > 0 ? reviewer_name[0][0].full_name : "",
    });
  }
  return vendorsWithDetails;
};

export const getVendorByIdQuery = async (
  id: number,
  organizationId: number
): Promise<IVendor | null> => {
  const result = await sequelize.query(
    `SELECT * FROM vendors WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: VendorModel,
    }
  );
  if (!result.length) return null;
  const projects = await sequelize.query(
    `SELECT project_id FROM vendors_projects WHERE organization_id = :organizationId AND vendor_id = :vendor_id`,
    {
      replacements: { organizationId, vendor_id: id },
      mapToModel: true,
      model: VendorsProjectsModel,
    }
  );
  const vendor = result[0] as VendorModel;
  return {
    ...vendor.dataValues,
    created_at: (vendor.createdAt ?? vendor.created_at)?.toISOString(),
    updated_at: (vendor.updatedAt ?? vendor.updated_at)?.toISOString(),
    projects: (projects || []).map((p) => p.project_id),
  };
};

export const getVendorByProjectIdQuery = async (
  project_id: number,
  organizationId: number
): Promise<IVendor[] | null> => {
  const projectExists = await sequelize.query(
    `SELECT 1 AS exists FROM projects WHERE organization_id = :organizationId AND id = :project_id`,
    { replacements: { organizationId, project_id } }
  );
  if (!(projectExists[0].length > 0)) return null;
  const vendors_projects = await sequelize.query(
    `SELECT vendor_id FROM vendors_projects WHERE organization_id = :organizationId AND project_id = :project_id`,
    {
      replacements: { organizationId, project_id },
      mapToModel: true,
      model: VendorsProjectsModel,
    }
  );
  const vendors: IVendor[] = [];
  for (let vendors_project of vendors_projects || []) {
    const vendor = await sequelize.query(
      `SELECT * FROM vendors WHERE organization_id = :organizationId AND id = :id ORDER BY created_at DESC, id ASC`,
      {
        replacements: {
          organizationId,
          id: vendors_project.vendor_id,
        },
        mapToModel: true,
        model: VendorModel,
      }
    );
    // commenting as, for the current functionality, project and vendor have 1:1 mapping
    // const projects = await sequelize.query("SELECT project_id FROM vendors_projects WHERE vendor_id = $1", [vendors_project.vendor_id])
    // vendors.push({ ...vendor[0], projects: projects.map(p => p.project_id) })
    const v = vendor[0] as VendorModel;
    vendors.push({
      ...v.dataValues,
      created_at: (v.createdAt ?? v.created_at)?.toISOString(),
      updated_at: (v.updatedAt ?? v.updated_at)?.toISOString(),
      projects: [project_id],
    });
  }
  return vendors;
};

export const addVendorProjects = async (
  vendorId: number,
  projects: number[],
  organizationId: number,
  transaction: Transaction
) => {
  let vendorsProjectFlat = [];
  let placeholdersArray = [];
  for (let project of projects) {
    vendorsProjectFlat.push(organizationId, vendorId, project);
    placeholdersArray.push("(?, ?, ?)");
  }
  let placeholders = placeholdersArray.join(", ");
  const query = `INSERT INTO vendors_projects (organization_id, vendor_id, project_id) VALUES ${placeholders} RETURNING *`;
  const vendors_projects = await sequelize.query(query, {
    replacements: vendorsProjectFlat,
    mapToModel: true,
    model: VendorsProjectsModel,
    transaction,
  });
  return vendors_projects;
};

export const createNewVendorQuery = async (
  vendor: IVendor,
  organizationId: number,
  transaction: Transaction,
  is_demo: boolean = false
): Promise<VendorModel> => {
  // Build dynamic query for optional fields
  const fields = [
    "organization_id",
    "order_no",
    "vendor_name",
    "vendor_provides",
    "assignee",
    "website",
    "vendor_contact_person",
    "is_demo",
  ];
  const values = [
    "organization_id",
    "order_no",
    "vendor_name",
    "vendor_provides",
    "assignee",
    "website",
    "vendor_contact_person",
    "is_demo",
  ];
  const replacements: any = {
    organization_id: organizationId,
    order_no: vendor.order_no || null,
    vendor_name: vendor.vendor_name,
    vendor_provides: vendor.vendor_provides,
    assignee: vendor.assignee,
    website: vendor.website,
    vendor_contact_person: vendor.vendor_contact_person,
    is_demo: is_demo,
  };

  // Add optional review fields only if provided
  if (vendor.review_result !== undefined) {
    fields.push("review_result");
    values.push("review_result");
    replacements.review_result = vendor.review_result;
  }
  if (vendor.review_status !== undefined) {
    fields.push("review_status");
    values.push("review_status");
    replacements.review_status = vendor.review_status;
  }
  if (vendor.reviewer !== undefined) {
    fields.push("reviewer");
    values.push("reviewer");
    replacements.reviewer = vendor.reviewer;
  }
  if (vendor.review_date !== undefined) {
    fields.push("review_date");
    values.push("review_date");
    replacements.review_date = vendor.review_date;
  }

  // Add optional scorecard fields only if provided
  if (vendor.data_sensitivity !== undefined) {
    fields.push("data_sensitivity");
    values.push("data_sensitivity");
    replacements.data_sensitivity = vendor.data_sensitivity;
  }
  if (vendor.business_criticality !== undefined) {
    fields.push("business_criticality");
    values.push("business_criticality");
    replacements.business_criticality = vendor.business_criticality;
  }
  if (vendor.past_issues !== undefined) {
    fields.push("past_issues");
    values.push("past_issues");
    replacements.past_issues = vendor.past_issues;
  }
  if (vendor.regulatory_exposure !== undefined) {
    fields.push("regulatory_exposure");
    values.push("regulatory_exposure");
    replacements.regulatory_exposure = vendor.regulatory_exposure;
  }
  if (vendor.risk_score !== undefined) {
    fields.push("risk_score");
    values.push("risk_score");
    replacements.risk_score = vendor.risk_score;
  }

  const fieldsList = fields.join(", ");
  const valuesList = values.map((v) => `:${v}`).join(", ");

  const result = await sequelize.query(
    `INSERT INTO vendors (${fieldsList}) VALUES (${valuesList}) RETURNING *`,
    {
      replacements,
      mapToModel: true,
      model: VendorModel,
      transaction,
    }
  );
  const createdVendor = result[0] as VendorModel & { projects: number[] };
  const vendorId = createdVendor.id!;

  createdVendor["projects"] = [];
  if (vendor.projects && vendor.projects.length > 0) {
    const vendors_projects = await addVendorProjects(
      vendorId,
      vendor.projects,
      organizationId,
      transaction
    );
    createdVendor["projects"] = vendors_projects.map((p) => p.project_id);
  }
  await updateProjectUpdatedByIdQuery(vendorId, "vendors", organizationId, transaction);

  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.organization_id = :organizationId AND a.trigger_id = pat.id JOIN automation_actions_data aa ON aa.organization_id = :organizationId AND a.id = aa.automation_id JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'vendor_added' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction }
  )) as [
    (TenantAutomationActionModel & {
      trigger_key: string;
      action_key: string;
      automation_id: number;
    })[],
    number,
  ];
  if (automations[0].length > 0) {
    const automation = automations[0][0];
    if (automation["trigger_key"] === "vendor_added") {
      const params = automation.params!;

      // Build replacements
      const replacements = buildVendorReplacements(createdVendor);

      // Replace variables in subject and body
      const processedParams = {
        ...params,
        subject: replaceTemplateVariables(params.subject || "", replacements),
        body: replaceTemplateVariables(params.body || "", replacements),
        automation_id: automation.automation_id,
      };

      // Enqueue with processed params
      await enqueueAutomationAction(automation.action_key, {
        ...processedParams,
        organizationId,
      });
    } else {
      console.warn(
        `No matching trigger found for key: ${automation["trigger_key"]}`
      );
    }
  }
  return createdVendor;
};

export const updateVendorByIdQuery = async (
  {
    id,
    vendor,
    userId,
    role,
    transaction,
  }: {
    id: number;
    vendor: Partial<IVendor>;
    userId: number;
    role: string;
    transaction: Transaction;
  },
  organizationId: number
): Promise<IVendor> => {
  const updateVendor: Partial<Record<keyof IVendor, any>> & { organizationId?: number } = {};
  const setClause = [
    "vendor_name",
    "vendor_provides",
    "assignee",
    "website",
    "vendor_contact_person",
    "review_result",
    "review_status",
    "reviewer",
    "review_date",
    "data_sensitivity",
    "business_criticality",
    "past_issues",
    "regulatory_exposure",
    "risk_score",
  ]
    .filter((f) => {
      // For review and scorecard fields, allow undefined or null to be updated (to clear the field)
      // For other required fields, only update if they have a value
      const isReviewField = [
        "review_result",
        "review_status",
        "reviewer",
        "review_date",
      ].includes(f);
      const isScorecardField = [
        "data_sensitivity",
        "business_criticality",
        "past_issues",
        "regulatory_exposure",
        "risk_score",
      ].includes(f);
      const value = vendor[f as keyof IVendor];

      if (isReviewField || isScorecardField) {
        // Review and scorecard fields: include if explicitly provided (even if null/empty)
        if (value !== undefined) {
          updateVendor[f as keyof IVendor] = value;
          return true;
        }
      } else {
        // Required fields: include only if they have a value
        if (value !== undefined && value) {
          updateVendor[f as keyof IVendor] = value;
          return true;
        }
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");

  const oldVendor = await getVendorByIdQuery(id, organizationId);

  const query = `UPDATE vendors SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;

  updateVendor.organizationId = organizationId;

  updateVendor.id = id;

  const result: IVendor[] = await sequelize.query(query, {
    replacements: updateVendor,
    mapToModel: true,
    model: VendorModel,
    // type: QueryTypes.UPDATE,
    transaction,
  });

  if (vendor.projects && vendor.projects.length > 0) {
    // Delete old projects first
    await deleteAuthorizedVendorProjectsQuery(
      {
        vendorId: id,
        userId,
        role,
        transaction,
      },
      organizationId
    );

    const vendors_projects = await addVendorProjects(
      id,
      vendor.projects,
      organizationId,
      transaction
    );
    result[0]["projects"] = vendors_projects.map((p) => p.project_id);
  } else {
    const projects = await sequelize.query(
      "SELECT project_id FROM vendors_projects WHERE organization_id = :organizationId AND vendor_id = :vendor_id",
      {
        replacements: { organizationId, vendor_id: id },
        mapToModel: true,
        model: VendorsProjectsModel,
      }
    );
    result[0]["projects"] = projects.map((p) => p.project_id);
  }
  await updateProjectUpdatedByIdQuery(id, "vendors", organizationId, transaction);
  const updatedVendor = result[0];
  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.organization_id = :organizationId AND a.trigger_id = pat.id JOIN automation_actions_data aa ON aa.organization_id = :organizationId AND a.id = aa.automation_id JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'vendor_updated' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction }
  )) as [
    (TenantAutomationActionModel & {
      trigger_key: string;
      action_key: string;
      automation_id: number;
    })[],
    number,
  ];
  if (automations[0].length > 0) {
    const automation = automations[0][0];
    if (automation["trigger_key"] === "vendor_updated") {
      const params = automation.params!;

      // Build replacements
      const replacements = buildVendorUpdateReplacements(
        oldVendor,
        updatedVendor
      );

      // Replace variables in subject and body
      const processedParams = {
        ...params,
        subject: replaceTemplateVariables(params.subject || "", replacements),
        body: replaceTemplateVariables(params.body || "", replacements),
        automation_id: automation.automation_id,
      };

      // Enqueue with processed params
      await enqueueAutomationAction(automation.action_key, {
        ...processedParams,
        organizationId,
      });
    } else {
      console.warn(
        `No matching trigger found for key: ${automation["trigger_key"]}`
      );
    }
  }
  return updatedVendor;
};

export const deleteVendorByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction
): Promise<Boolean> => {
  await deleteVendorRisksForVendorQuery(id, organizationId, transaction);
  await updateProjectUpdatedByIdQuery(id, "vendors", organizationId, transaction);
  await sequelize.query(
    `DELETE FROM vendors_projects WHERE organization_id = :organizationId AND vendor_id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: VendorsProjectsModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  const result = await sequelize.query(
    `DELETE FROM vendors WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: VendorModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  const deletedVendor = result[0];
  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.organization_id = :organizationId AND a.trigger_id = pat.id JOIN automation_actions_data aa ON aa.organization_id = :organizationId AND a.id = aa.automation_id JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'vendor_deleted' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction }
  )) as [
    (TenantAutomationActionModel & {
      trigger_key: string;
      action_key: string;
      automation_id: number;
    })[],
    number,
  ];
  if (automations[0].length > 0) {
    const automation = automations[0][0];
    if (automation["trigger_key"] === "vendor_deleted") {
      const params = automation.params!;

      // Build replacements
      const replacements = buildVendorReplacements(deletedVendor);

      // Replace variables in subject and body
      const processedParams = {
        ...params,
        subject: replaceTemplateVariables(params.subject || "", replacements),
        body: replaceTemplateVariables(params.body || "", replacements),
        automation_id: automation.automation_id,
      };

      // Enqueue with processed params
      await enqueueAutomationAction(automation.action_key, {
        ...processedParams,
        organizationId,
      });
    } else {
      console.warn(
        `No matching trigger found for key: ${automation["trigger_key"]}`
      );
    }
  }
  return result.length > 0;
};

interface DeleteAuthorizedVendorProjectsParams {
  vendorId: number;
  userId: number;
  role: string;
  transaction?: Transaction;
}

export const deleteAuthorizedVendorProjectsQuery = async (
  { vendorId, userId, role, transaction }: DeleteAuthorizedVendorProjectsParams,
  organizationId: number
) => {
  // 1. Get user-authorized project IDs
  const userProjects = await getUserProjects(
    { userId, role, transaction },
    organizationId
  );
  const userProjectIds = userProjects
    .map((p) => p.id)
    .filter((value, index, self) => self.indexOf(value) === index);

  // 2. Delete old links (only authorized ones)
  if (userProjectIds.length > 0) {
    await sequelize.query(
      `
      DELETE FROM vendors_projects
      WHERE organization_id = :organizationId
        AND vendor_id = :vendorId
        AND project_id IN (:userProjectIds)
      `,
      {
        replacements: { organizationId, vendorId, userProjectIds },
        transaction,
      }
    );
  }
};
