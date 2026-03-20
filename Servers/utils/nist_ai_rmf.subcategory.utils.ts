import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { NISTAIMRFSubcategoryModel } from "../domain.layer/frameworks/NIST-AI-RMF/nist_ai_rmf_subcategory.model";
import { getEvidenceFilesForEntity } from "./files/evidenceFiles.utils";

/**
 * Get all subcategories for a category (using function and category_id from struct)
 * Returns fields aliased for frontend compatibility: index, title, category_id
 */
export const getAllNISTAIRMFSubcategoriesByCategoryQuery = async (
  functionName: string,
  categoryId: number,
  organizationId: number
): Promise<NISTAIMRFSubcategoryModel[]> => {
  const results = await sequelize.query(
    `SELECT s.*,
            ss.function,
            ss.subcategory_id as index,
            ss.description as title,
            ss.description as description,
            cs.id as category_id
     FROM nist_ai_rmf_subcategories s
     JOIN nist_ai_rmf_subcategories_struct ss ON s.subcategory_meta_id = ss.id
     JOIN nist_ai_rmf_categories_struct cs ON ss.category_struct_id = cs.id
     WHERE s.organization_id = :organizationId
       AND cs.function = :functionName
       AND cs.category_id = :categoryId
     ORDER BY ss.order_no ASC, ss.subcategory_id ASC`,
    {
      replacements: { organizationId, functionName, categoryId },
      mapToModel: true,
      model: NISTAIMRFSubcategoryModel,
    }
  );
  return Array.isArray(results)
    ? (results as NISTAIMRFSubcategoryModel[])
    : [];
};

/**
 * Legacy function - kept for backward compatibility
 * Maps categoryId to struct category lookup
 * Returns fields aliased for frontend compatibility: index, title, category_id
 */
export const getAllNISTAIRMFSubcategoriesBycategoryIdAndtitleQuery = async (
  categoryStructId: number,
  _title: string,
  organizationId: number
): Promise<NISTAIMRFSubcategoryModel[]> => {
  const results = await sequelize.query(
    `SELECT s.*,
            ss.function,
            ss.subcategory_id as index,
            ss.description as title,
            ss.description as description,
            ss.category_struct_id as category_id
     FROM nist_ai_rmf_subcategories s
     JOIN nist_ai_rmf_subcategories_struct ss ON s.subcategory_meta_id = ss.id
     WHERE s.organization_id = :organizationId
       AND ss.category_struct_id = :categoryStructId
     ORDER BY ss.order_no ASC, ss.subcategory_id ASC`,
    {
      replacements: { organizationId, categoryStructId },
      mapToModel: true,
      model: NISTAIMRFSubcategoryModel,
    }
  );
  return Array.isArray(results)
    ? (results as NISTAIMRFSubcategoryModel[])
    : [];
};

export const getNISTAIRMFSubcategoryByIdQuery = async (
  id: number,
  organizationId: number
) => {
  const subcategory = await sequelize.query(
    `SELECT s.*,
            ss.function,
            ss.subcategory_id as index,
            ss.description as title,
            ss.description as description,
            ss.category_struct_id as category_id
     FROM nist_ai_rmf_subcategories s
     LEFT JOIN nist_ai_rmf_subcategories_struct ss ON s.subcategory_meta_id = ss.id
     WHERE s.organization_id = :organizationId AND s.id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: NISTAIMRFSubcategoryModel,
    }
  );

  if (!subcategory[0]) {
    return null;
  }

  // Fetch evidence files from file_entity_links
  const evidenceFiles = await getEvidenceFilesForEntity(
    organizationId,
    "nist_ai_rmf",
    "subcategory",
    id,
    "evidence"
  );
  (subcategory[0] as any).evidence_links = evidenceFiles;

  return subcategory[0];
};

/**
 * Get all risks linked to a NIST AI RMF subcategory
 */
export const getNISTAIRMFSubcategoryRisksQuery = async (
  subcategoryId: number,
  organizationId: number
): Promise<any[]> => {
  const risks = await sequelize.query(
    `SELECT pr.*
     FROM risks pr
     INNER JOIN nist_ai_rmf_subcategories__risks nsr
       ON pr.organization_id = nsr.organization_id AND pr.id = nsr.projects_risks_id
     WHERE nsr.organization_id = :organizationId AND nsr.nist_ai_rmf_subcategory_id = :subcategoryId
     ORDER BY pr.id ASC`,
    {
      replacements: { organizationId, subcategoryId },
    }
  );
  return risks[0] as any[];
};

// Helper function to validate risk array (copied from ISO 27001 pattern)
const validateRiskArray = (arr: any[], fieldName: string): number[] => {
  if (!Array.isArray(arr)) {
    throw new Error(`${fieldName} must be an array`);
  }
  return arr.map((item, index) => {
    const num = typeof item === "string" ? parseInt(item, 10) : item;
    if (typeof num !== "number" || isNaN(num) || !Number.isInteger(num)) {
      throw new Error(`${fieldName}[${index}] must be a valid integer`);
    }
    return num;
  });
};

export const updateNISTAIRMFSubcategoryByIdQuery = async (
  id: number,
  subcategory: Partial<NISTAIMRFSubcategoryModel> & {
    risksDelete?: string;
    risksMitigated?: string;
  },
  uploadedFiles: {
    id: string;
    fileName: string;
    project_id?: number;
    uploaded_by: number;
    uploaded_time: string;
    type: string;
    source: string;
  }[] = [],
  deletedFiles: string[] = [],
  organizationId: number,
  transaction: Transaction
) => {
  const updateFields: Partial<Record<keyof NISTAIMRFSubcategoryModel, any>> & { organizationId?: number } =
    {};

  const setClause = [
    "implementation_description",
    "status",
    "owner",
    "reviewer",
    "approver",
    "due_date",
    "auditor_feedback",
  ]
    .filter((f) => {
      // Handle other fields
      if (
        subcategory[f as keyof NISTAIMRFSubcategoryModel] !== undefined &&
        subcategory[f as keyof NISTAIMRFSubcategoryModel] !== null &&
        subcategory[f as keyof NISTAIMRFSubcategoryModel] !== ""
      ) {
        let value = subcategory[f as keyof NISTAIMRFSubcategoryModel];

        // Handle empty strings for integer fields (owner, reviewer, approver)
        if (["owner", "reviewer", "approver"].includes(f)) {
          if (value === "" || value === null || value === undefined) {
            return false; // Skip this field if it's empty
          }
          const numValue = parseInt(value as string);
          if (isNaN(numValue)) {
            return false; // Skip this field if it's not a valid number
          }
          value = numValue;
        }

        updateFields[f as keyof NISTAIMRFSubcategoryModel] = value;
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");

  let subcategoryResult: NISTAIMRFSubcategoryModel & { risks: number[] };

  if (setClause.length > 0) {
    const query = `UPDATE nist_ai_rmf_subcategories SET ${setClause}, updated_at = NOW() WHERE organization_id = :organizationId AND id = :id RETURNING *;`;

    updateFields.id = id;
    updateFields.organizationId = organizationId;

    const result = (await sequelize.query(query, {
      replacements: updateFields,
      transaction,
    })) as [NISTAIMRFSubcategoryModel[], number];

    subcategoryResult = result[0][0] as NISTAIMRFSubcategoryModel & { risks: number[] };
  } else {
    // No fields to update, fetch current record
    const result = (await sequelize.query(
      `SELECT * FROM nist_ai_rmf_subcategories WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: { organizationId, id },
        transaction,
      }
    )) as [NISTAIMRFSubcategoryModel[], number];
    subcategoryResult = result[0][0] as NISTAIMRFSubcategoryModel & { risks: number[] };
  }

  (subcategoryResult as any).risks = [];

  // Handle risk linking (following ISO 27001 pattern)
  const risksDeletedRaw = JSON.parse(subcategory.risksDelete || "[]");
  const risksMitigatedRaw = JSON.parse(subcategory.risksMitigated || "[]");

  // Validate that both arrays contain only valid integers
  const risksDeleted = validateRiskArray(risksDeletedRaw, "risksDelete");
  const risksMitigated = validateRiskArray(risksMitigatedRaw, "risksMitigated");

  // Get current risks for this subcategory
  const risks = (await sequelize.query(
    `SELECT projects_risks_id FROM nist_ai_rmf_subcategories__risks WHERE organization_id = :organizationId AND nist_ai_rmf_subcategory_id = :id`,
    {
      replacements: { organizationId, id },
      transaction,
    }
  )) as [{ projects_risks_id: number }[], number];

  let currentRisks = risks[0].map((r) => r.projects_risks_id);
  currentRisks = currentRisks.filter((r) => !risksDeleted.includes(r));
  currentRisks = currentRisks.concat(risksMitigated);

  // Remove duplicates
  currentRisks = [...new Set(currentRisks)];

  // Delete old associations
  await sequelize.query(
    `DELETE FROM nist_ai_rmf_subcategories__risks WHERE organization_id = :organizationId AND nist_ai_rmf_subcategory_id = :id;`,
    {
      replacements: { organizationId, id },
      transaction,
    }
  );

  // Insert new associations
  if (currentRisks.length > 0) {
    const placeholders = currentRisks
      .map((_, i) => `(:organizationId, :subcategory_id${i}, :projects_risks_id${i})`)
      .join(", ");
    const replacements: { [key: string]: any } = { organizationId };

    currentRisks.forEach((risk, i) => {
      replacements[`subcategory_id${i}`] = id;
      replacements[`projects_risks_id${i}`] = risk;
    });

    const subCategoryRisksInsertResult = (await sequelize.query(
      `INSERT INTO nist_ai_rmf_subcategories__risks (organization_id, nist_ai_rmf_subcategory_id, projects_risks_id) VALUES ${placeholders} RETURNING projects_risks_id;`,
      {
        replacements,
        transaction,
      }
    )) as [{ projects_risks_id: number }[], number];

    for (const risk of subCategoryRisksInsertResult[0]) {
      (subcategoryResult as any).risks.push(risk.projects_risks_id);
    }

    // Add NIST AI RMF framework (id=4) to applicable_frameworks for all linked risks
    // This runs within the same transaction, so it will roll back if the save fails
    const NIST_AI_RMF_FRAMEWORK_ID = 4;
    for (const riskId of currentRisks) {
      // Check if the framework association already exists
      const existingAssoc = await sequelize.query(
        `SELECT 1 FROM frameworks_risks WHERE organization_id = :organizationId AND risk_id = :riskId AND framework_id = :frameworkId`,
        {
          replacements: { organizationId, riskId, frameworkId: NIST_AI_RMF_FRAMEWORK_ID },
          transaction,
        }
      );

      // Only insert if association doesn't exist
      if ((existingAssoc[0] as any[]).length === 0) {
        await sequelize.query(
          `INSERT INTO frameworks_risks (organization_id, risk_id, framework_id) VALUES (:organizationId, :riskId, :frameworkId)`,
          {
            replacements: { organizationId, riskId, frameworkId: NIST_AI_RMF_FRAMEWORK_ID },
            transaction,
          }
        );
      }
    }
  }

  // Create file entity links for new uploaded files
  for (const file of uploadedFiles) {
    await sequelize.query(
      `INSERT INTO file_entity_links
        (organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_at)
       VALUES (:organizationId, :fileId, 'nist_ai_rmf', 'subcategory', :entityId, 'evidence', NOW())
       ON CONFLICT (file_id, framework_type, entity_type, entity_id) DO NOTHING`,
      {
        replacements: { organizationId, fileId: parseInt(file.id), entityId: id },
        transaction,
      }
    );
  }

  // Remove file entity links for deleted files
  for (const fileIdStr of deletedFiles) {
    const fileId = parseInt(fileIdStr);
    if (!isNaN(fileId)) {
      await sequelize.query(
        `DELETE FROM file_entity_links
         WHERE organization_id = :organizationId
           AND file_id = :fileId
           AND framework_type = 'nist_ai_rmf'
           AND entity_type = 'subcategory'
           AND entity_id = :entityId`,
        {
          replacements: { organizationId, fileId, entityId: id },
          transaction,
        }
      );
    }
  }

  // Fetch evidence_links from file_entity_links for backward compatibility with response
  const evidenceLinks = await getEvidenceFilesForEntity(
    organizationId,
    "nist_ai_rmf",
    "subcategory",
    id
  );
  (subcategoryResult as any).evidence_links = evidenceLinks;

  return subcategoryResult;
};

/**
 * Count total and completed subcategories for NIST AI RMF framework
 * A subcategory is considered "done" when its status is "Implemented"
 */
export const countNISTAIRMFSubcategoriesProgress = async (
  organizationId: number
): Promise<{
  totalSubcategories: number;
  doneSubcategories: number;
}> => {
  const result = (await sequelize.query(
    `SELECT
      COUNT(*) AS "totalSubcategories",
      SUM(CASE WHEN status = 'Implemented' THEN 1 ELSE 0 END) AS "doneSubcategories"
    FROM nist_ai_rmf_subcategories
    WHERE organization_id = :organizationId`,
    { replacements: { organizationId } }
  )) as [{ totalSubcategories: string; doneSubcategories: string }[], number];

  return {
    totalSubcategories: parseInt(result[0][0].totalSubcategories) || 0,
    doneSubcategories: parseInt(result[0][0].doneSubcategories) || 0,
  };
};

/**
 * Count total and assigned subcategories for NIST AI RMF framework
 * A subcategory is considered "assigned" when it has an owner
 */
export const countNISTAIRMFSubcategoriesAssignments = async (
  organizationId: number
): Promise<{
  totalSubcategories: number;
  assignedSubcategories: number;
}> => {
  const result = (await sequelize.query(
    `SELECT
      COUNT(*) AS "totalSubcategories",
      SUM(CASE WHEN owner IS NOT NULL THEN 1 ELSE 0 END) AS "assignedSubcategories"
    FROM nist_ai_rmf_subcategories
    WHERE organization_id = :organizationId`,
    { replacements: { organizationId } }
  )) as [{ totalSubcategories: string; assignedSubcategories: string }[], number];

  return {
    totalSubcategories: parseInt(result[0][0].totalSubcategories) || 0,
    assignedSubcategories: parseInt(result[0][0].assignedSubcategories) || 0,
  };
};

/**
 * Count total and assigned subcategories for NIST AI RMF framework grouped by function
 * A subcategory is considered "assigned" when it has an owner
 * Returns counts for Govern, Map, Measure, Manage functions
 */
export const countNISTAIRMFSubcategoriesAssignmentsByFunction = async (
  organizationId: number
): Promise<{
  govern: { total: number; assigned: number };
  map: { total: number; assigned: number };
  measure: { total: number; assigned: number };
  manage: { total: number; assigned: number };
}> => {
  const result = (await sequelize.query(
    `SELECT
      ss.function AS function_type,
      COUNT(s.id) AS total,
      SUM(CASE WHEN s.owner IS NOT NULL THEN 1 ELSE 0 END) AS assigned
    FROM nist_ai_rmf_subcategories s
    JOIN nist_ai_rmf_subcategories_struct ss ON s.subcategory_meta_id = ss.id
    WHERE s.organization_id = :organizationId
    GROUP BY ss.function
    ORDER BY
      CASE ss.function
        WHEN 'GOVERN' THEN 1
        WHEN 'MAP' THEN 2
        WHEN 'MEASURE' THEN 3
        WHEN 'MANAGE' THEN 4
        ELSE 5
      END`,
    { replacements: { organizationId } }
  )) as [{ function_type: string; total: string; assigned: string }[], number];

  const defaultValue = { total: 0, assigned: 0 };
  const functionMap: Record<string, { total: number; assigned: number }> = {
    GOVERN: { ...defaultValue },
    MAP: { ...defaultValue },
    MEASURE: { ...defaultValue },
    MANAGE: { ...defaultValue },
  };

  for (const row of result[0]) {
    const key = row.function_type.toUpperCase();
    if (key in functionMap) {
      functionMap[key] = {
        total: parseInt(row.total) || 0,
        assigned: parseInt(row.assigned) || 0,
      };
    }
  }

  return {
    govern: functionMap.GOVERN,
    map: functionMap.MAP,
    measure: functionMap.MEASURE,
    manage: functionMap.MANAGE,
  };
};

/**
 * Count total and done subcategories for NIST AI RMF framework grouped by function
 * A subcategory is considered "done" when its status is "Implemented"
 * Returns counts for Govern, Map, Measure, Manage functions
 */
export const countNISTAIRMFSubcategoriesProgressByFunction = async (
  organizationId: number
): Promise<{
  govern: { total: number; done: number };
  map: { total: number; done: number };
  measure: { total: number; done: number };
  manage: { total: number; done: number };
}> => {
  const result = (await sequelize.query(
    `SELECT
      ss.function AS function_type,
      COUNT(s.id) AS total,
      SUM(CASE WHEN s.status = 'Implemented' THEN 1 ELSE 0 END) AS done
    FROM nist_ai_rmf_subcategories s
    JOIN nist_ai_rmf_subcategories_struct ss ON s.subcategory_meta_id = ss.id
    WHERE s.organization_id = :organizationId
    GROUP BY ss.function
    ORDER BY
      CASE ss.function
        WHEN 'GOVERN' THEN 1
        WHEN 'MAP' THEN 2
        WHEN 'MEASURE' THEN 3
        WHEN 'MANAGE' THEN 4
        ELSE 5
      END`,
    { replacements: { organizationId } }
  )) as [{ function_type: string; total: string; done: string }[], number];

  const defaultValue = { total: 0, done: 0 };
  const functionMap: Record<string, { total: number; done: number }> = {
    GOVERN: { ...defaultValue },
    MAP: { ...defaultValue },
    MEASURE: { ...defaultValue },
    MANAGE: { ...defaultValue },
  };

  for (const row of result[0]) {
    const key = row.function_type.toUpperCase();
    if (key in functionMap) {
      functionMap[key] = {
        total: parseInt(row.total) || 0,
        done: parseInt(row.done) || 0,
      };
    }
  }

  return {
    govern: functionMap.GOVERN,
    map: functionMap.MAP,
    measure: functionMap.MEASURE,
    manage: functionMap.MANAGE,
  };
};

/**
 * Get status breakdown for NIST AI RMF subcategories
 */
export const getNISTAIRMFSubcategoriesStatusBreakdown = async (
  organizationId: number
): Promise<{
  notStarted: number;
  draft: number;
  inProgress: number;
  awaitingReview: number;
  awaitingApproval: number;
  implemented: number;
  needsRework: number;
}> => {
  const result = (await sequelize.query(
    `SELECT
      SUM(CASE WHEN status = 'Not started' OR status IS NULL THEN 1 ELSE 0 END) AS "notStarted",
      SUM(CASE WHEN status = 'Draft' THEN 1 ELSE 0 END) AS "draft",
      SUM(CASE WHEN status = 'In progress' THEN 1 ELSE 0 END) AS "inProgress",
      SUM(CASE WHEN status = 'Awaiting review' THEN 1 ELSE 0 END) AS "awaitingReview",
      SUM(CASE WHEN status = 'Awaiting approval' THEN 1 ELSE 0 END) AS "awaitingApproval",
      SUM(CASE WHEN status = 'Implemented' THEN 1 ELSE 0 END) AS "implemented",
      SUM(CASE WHEN status = 'Needs rework' THEN 1 ELSE 0 END) AS "needsRework"
    FROM nist_ai_rmf_subcategories
    WHERE organization_id = :organizationId`,
    { replacements: { organizationId } }
  )) as [
    {
      notStarted: string;
      draft: string;
      inProgress: string;
      awaitingReview: string;
      awaitingApproval: string;
      implemented: string;
      needsRework: string;
    }[],
    number
  ];

  return {
    notStarted: parseInt(result[0][0].notStarted) || 0,
    draft: parseInt(result[0][0].draft) || 0,
    inProgress: parseInt(result[0][0].inProgress) || 0,
    awaitingReview: parseInt(result[0][0].awaitingReview) || 0,
    awaitingApproval: parseInt(result[0][0].awaitingApproval) || 0,
    implemented: parseInt(result[0][0].implemented) || 0,
    needsRework: parseInt(result[0][0].needsRework) || 0,
  };
};

/**
 * Get all NIST AI RMF functions with their categories and subcategories for dashboard overview
 * Uses struct tables for hierarchy and joins with implementation data
 */
export const getNISTAIRMFDashboardOverview = async (
  organizationId: number
): Promise<{
  functions: {
    function: string;
    title: string;
    categories: {
      id: number;
      category_id: number;
      description: string;
      subcategories: {
        id: number;
        subcategory_id: number;
        description: string;
        status: string;
        owner: number | null;
      }[];
    }[];
  }[];
}> => {
  // Function metadata for display
  const FUNCTION_METADATA: Record<string, string> = {
    'GOVERN': 'Govern',
    'MAP': 'Map',
    'MEASURE': 'Measure',
    'MANAGE': 'Manage',
  };

  // Get all categories from struct (public schema)
  const categories = (await sequelize.query(
    `SELECT id, function, category_id, description, order_no
     FROM nist_ai_rmf_categories_struct
     ORDER BY
       CASE function
         WHEN 'GOVERN' THEN 1
         WHEN 'MAP' THEN 2
         WHEN 'MEASURE' THEN 3
         WHEN 'MANAGE' THEN 4
         ELSE 5
       END,
       order_no ASC, category_id ASC`,
    {}
  )) as [{ id: number; function: string; category_id: number; description: string; order_no: number }[], number];

  // Get all subcategories with implementation data
  const subcategories = (await sequelize.query(
    `SELECT
      s.id,
      s.status,
      s.owner,
      ss.id as struct_id,
      ss.function,
      ss.subcategory_id,
      ss.description,
      ss.category_struct_id
     FROM nist_ai_rmf_subcategories_struct ss
     LEFT JOIN nist_ai_rmf_subcategories s
       ON s.subcategory_meta_id = ss.id AND s.organization_id = :organizationId
     ORDER BY ss.order_no ASC, ss.subcategory_id ASC`,
    { replacements: { organizationId } }
  )) as [{
    id: number | null;
    status: string | null;
    owner: number | null;
    struct_id: number;
    function: string;
    subcategory_id: number;
    description: string;
    category_struct_id: number;
  }[], number];

  // Build the nested structure grouped by function
  const functionOrder = ['GOVERN', 'MAP', 'MEASURE', 'MANAGE'];
  const result = functionOrder.map((func) => ({
    function: func,
    title: FUNCTION_METADATA[func] || func,
    categories: categories[0]
      .filter((cat) => cat.function === func)
      .map((cat) => ({
        id: cat.id,
        category_id: cat.category_id,
        description: cat.description,
        subcategories: subcategories[0]
          .filter((sub) => sub.category_struct_id === cat.id)
          .map((sub) => ({
            id: sub.id || 0,  // 0 if no implementation record exists
            subcategory_id: sub.subcategory_id,
            description: sub.description,
            status: sub.status || 'Not started',
            owner: sub.owner,
          })),
      })),
  }));

  return { functions: result };
};

export const updateNISTAIRMFSubcategoryStatusByIdQuery = async (
  id: number,
  status: string,
  organizationId: number,
  transaction: Transaction
): Promise<NISTAIMRFSubcategoryModel> => {
  // Validate status against allowed values from the frontend StatusDropdown component
  const validStatuses = [
    "Not started",
    "Draft",
    "In progress",
    "Awaiting review",
    "Awaiting approval",
    "Implemented",
    "Needs rework",
  ];

  if (!validStatuses.includes(status)) {
    throw new Error(
      `Invalid status value: ${status}. Must be one of: ${validStatuses.join(", ")}`
    );
  }

  const query = `
    UPDATE nist_ai_rmf_subcategories
    SET status = :status, updated_at = NOW()
    WHERE organization_id = :organizationId AND id = :id
    RETURNING *
  `;

  const result = (await sequelize.query(query, {
    replacements: { organizationId, id, status },
    transaction,
    mapToModel: true,
    model: NISTAIMRFSubcategoryModel,
  })) as unknown as [NISTAIMRFSubcategoryModel[], number];

  return result[0][0] as NISTAIMRFSubcategoryModel;
};
