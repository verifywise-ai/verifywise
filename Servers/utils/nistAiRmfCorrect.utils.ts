import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { NISTAIMRFSubcategoryModel } from "../domain.layer/frameworks/NIST-AI-RMF/nist_ai_rmf_subcategory.model";
import { STATUSES } from "../types/status.type";
import { deleteAllFileEntityLinksForEntities, getEvidenceFilesForEntities, getEvidenceFilesForEntity } from "./files/evidenceFiles.utils";

/**
 * Pre-check function to ensure NIST AI RMF infrastructure exists before starting main transaction
 * In shared-schema architecture, tables already exist in public schema - this is now a no-op
 */
export const ensureNISTAI_RMFDInfrastructure = async (
  _organizationId: number
): Promise<void> => {
  // In shared-schema architecture, the nist_ai_rmf_subcategories table exists in the shared schema
  // with organization_id column for tenant isolation. No per-tenant setup needed.
  console.log(
    `[NIST AI RMF Utils] Infrastructure check completed for organization ${_organizationId} (shared-schema mode)`
  );
};

/**
 * Count total and completed subcategories for a project
 */
export const countSubcategoriesNISTByProjectId = async (
  projectFrameworkId: number,
  organizationId: number
): Promise<{
  totalSubcategories: string;
  doneSubcategories: string;
}> => {
  const result = (await sequelize.query(
    `SELECT COUNT(*) AS "totalSubcategories", SUM(CASE WHEN status = 'Implemented' THEN 1 ELSE 0 END) AS "doneSubcategories"
     FROM nist_ai_rmf_subcategories
     WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [{ totalSubcategories: string; doneSubcategories: string }[], number];
  return result[0][0];
};

/**
 * Count assigned subcategories for a project
 */
export const countSubcategoryAssignmentsNISTByProjectId = async (
  projectFrameworkId: number,
  organizationId: number
): Promise<{
  totalSubcategories: string;
  assignedSubcategories: string;
}> => {
  const result = (await sequelize.query(
    `SELECT
       COUNT(*) AS "totalSubcategories",
       SUM(CASE WHEN owner IS NOT NULL THEN 1 ELSE 0 END) AS "assignedSubcategories"
     FROM nist_ai_rmf_subcategories
     WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [
    { totalSubcategories: string; assignedSubcategories: string }[],
    number,
  ];

  return result[0][0];
};

/**
 * Get all functions with their categories from struct tables
 */
export const getAllFunctionsWithCategoriesQuery = async (
  _projectFrameworkId: number,
  _organizationId: number,
  transaction: Transaction | null = null
) => {
  // Function metadata
  const FUNCTION_METADATA: Record<string, { title: string; description: string; order_no: number }> = {
    'GOVERN': { title: 'Govern', description: 'Policies, processes, procedures, and practices across the organization related to the mapping, measuring, and managing of AI risks are in place, transparent, and implemented effectively.', order_no: 1 },
    'MAP': { title: 'Map', description: 'Context is established and understood. Categorization of the AI system is performed.', order_no: 2 },
    'MEASURE': { title: 'Measure', description: 'Appropriate methods and metrics are identified and applied.', order_no: 3 },
    'MANAGE': { title: 'Manage', description: 'AI risks based on assessments and other analytical output from the MAP and MEASURE functions are prioritized, responded to, and managed.', order_no: 4 },
  };

  // Get distinct functions from categories_struct
  const functionsRaw = (await sequelize.query(
    `SELECT DISTINCT function FROM nist_ai_rmf_categories_struct ORDER BY function`,
    { ...(transaction ? { transaction } : {}) }
  )) as [{ function: string }[], number];

  const functions = functionsRaw[0].map((f) => {
    const meta = FUNCTION_METADATA[f.function] || { title: f.function, description: '', order_no: 99 };
    return {
      type: f.function,
      title: meta.title,
      description: meta.description,
      order_no: meta.order_no,
      categories: [] as any[],
    };
  }).sort((a, b) => a.order_no - b.order_no);

  // Get categories for each function
  for (let func of functions) {
    const categories = (await sequelize.query(
      `SELECT cs.id, cs.category_id, cs.description, cs.order_no
       FROM nist_ai_rmf_categories_struct cs
       WHERE cs.function = :function
       ORDER BY cs.order_no ASC, cs.category_id ASC`,
      {
        replacements: { function: func.type },
        ...(transaction ? { transaction } : {}),
      }
    )) as [any[], number];

    func.categories = categories[0];
  }
  return functions;
};

/**
 * Get all categories with subcategories for a project
 */
export const getAllCategoriesWithSubcategoriesQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const subcategories = (await sequelize.query(
    `SELECT
      ns.id,
      ss.description as title,
      ss.description,
      ns.implementation_description,
      ss.subcategory_id as index,
      ss.category_struct_id as category_id,
      cs.description as category_title,
      cs.description as category_description,
      ns.status,
      ns.owner,
      ns.reviewer,
      ns.approver,
      ns.due_date,
      ns.auditor_feedback,
      ns.projects_frameworks_id,
      ns.created_at,
      ns.is_demo,
      ss.function
     FROM nist_ai_rmf_subcategories ns
     JOIN nist_ai_rmf_subcategories_struct ss ON ns.subcategory_meta_id = ss.id
     JOIN nist_ai_rmf_categories_struct cs ON ss.category_struct_id = cs.id
     WHERE ns.organization_id = :organizationId AND ns.projects_frameworks_id = :projects_frameworks_id
     ORDER BY
       CASE ss.function
         WHEN 'GOVERN' THEN 1
         WHEN 'MAP' THEN 2
         WHEN 'MEASURE' THEN 3
         WHEN 'MANAGE' THEN 4
         ELSE 5
       END,
       cs.order_no, ss.order_no`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      ...(transaction ? { transaction } : {}),
    }
  )) as [any[], number];

  // Batch fetch evidence files from file_entity_links
  const subcategoryIds = subcategories[0].map((s) => s.id);
  let filesMap = new Map<number, any[]>();
  if (subcategoryIds.length > 0) {
    filesMap = await getEvidenceFilesForEntities(
      organizationId,
      "nist_ai_rmf",
      "subcategory",
      subcategoryIds
    );
  }

  // Attach evidence_links to each subcategory for backward compatibility
  for (const subcategory of subcategories[0]) {
    subcategory.evidence_links = filesMap.get(subcategory.id) || [];
  }

  return subcategories[0];
};

/**
 * Get a specific subcategory by ID
 */
export const getSubcategoryByIdQuery = async (
  subcategoryId: number,
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const subcategory = (await sequelize.query(
    `SELECT
      ss.description AS title,
      ss.description AS description,
      ns.implementation_description,
      ss.subcategory_id AS index,
      ns.id,
      ns.status,
      ns.owner,
      ns.reviewer,
      ns.approver,
      ns.due_date,
      ns.auditor_feedback,
      ns.created_at,
      ns.updated_at
    FROM nist_ai_rmf_subcategories ns
    JOIN nist_ai_rmf_subcategories_struct ss ON ns.subcategory_meta_id = ss.id
    WHERE ns.organization_id = :organizationId AND ns.id = :id;`,
    {
      replacements: { organizationId, id: subcategoryId },
      ...(transaction ? { transaction } : {}),
    }
  )) as [any[], number];

  const result = subcategory[0][0];
  if (result) {
    // Fetch evidence_links from file_entity_links for backward compatibility
    result.evidence_links = await getEvidenceFilesForEntity(
      organizationId,
      "nist_ai_rmf",
      "subcategory",
      subcategoryId
    );
  }
  return result;
};

/**
 * Create NIST AI RMF framework for a project
 */
export const createNISTAI_RMFFrameworkQuery = async (
  projectId: number,
  _enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction,
  is_mock_data: boolean = false
) => {
  const projectFrameworkId = (await sequelize.query(
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 4`,
    {
      replacements: { organizationId, project_id: projectId },
      transaction,
    }
  )) as [{ id: number }[], number];

  const subcategoryIds = await createNewSubcategoriesQuery(
    projectFrameworkId[0][0].id,
    organizationId,
    transaction,
    is_mock_data
  );

  return {
    subcategoryIds,
  };
};

/**
 * Create new subcategories for a project using struct tables
 * Creates one implementation record for each subcategory in the struct table
 */
export const createNewSubcategoriesQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction: Transaction,
  is_mock_data: boolean
) => {
  // Get all subcategories from struct table
  const structSubcategories = (await sequelize.query(
    `SELECT id, function, subcategory_id, description, order_no
     FROM nist_ai_rmf_subcategories_struct
     ORDER BY
       CASE function
         WHEN 'GOVERN' THEN 1
         WHEN 'MAP' THEN 2
         WHEN 'MEASURE' THEN 3
         WHEN 'MANAGE' THEN 4
         ELSE 5
       END,
       order_no ASC, subcategory_id ASC`,
    { transaction, type: QueryTypes.SELECT }
  )) as Array<{ id: number; function: string; subcategory_id: number; description: string; order_no: number }>;

  const subcategoryIds = [];

  // Create implementation record for each struct subcategory
  for (const structSubcat of structSubcategories) {
    const result = (await sequelize.query(
      `INSERT INTO nist_ai_rmf_subcategories (
        organization_id, subcategory_meta_id, projects_frameworks_id, status, is_demo, created_at
      ) VALUES (
        :organizationId, :subcategory_meta_id, :projects_frameworks_id, :status, :is_demo, NOW()
      ) RETURNING id;`,
      {
        replacements: {
          organizationId,
          subcategory_meta_id: structSubcat.id,
          projects_frameworks_id: projectFrameworkId,
          status: is_mock_data
            ? STATUSES[Math.floor(Math.random() * STATUSES.length)]
            : "Not started",
          is_demo: is_mock_data,
        },
        transaction,
      }
    )) as [{ id: number }[], number];

    subcategoryIds.push(result[0][0].id);
  }

  return subcategoryIds;
};

/**
 * Update a subcategory implementation
 * NOTE: evidence_links are now managed via file_entity_links table, not JSONB column
 */
export const updateSubcategoryQuery = async (
  id: number,
  subcategory: Partial<NISTAIMRFSubcategoryModel>,
  uploadedFiles: {
    id: string;
    fileName: string;
    project_id: number;
    uploaded_by: number;
    uploaded_time: Date;
  }[] = [],
  deletedFiles: number[] = [],
  organizationId: number,
  transaction: Transaction
) => {
  // Build update for non-file fields only (files are managed via file_entity_links)
  const updateSubcategory: Partial<
    Record<keyof NISTAIMRFSubcategoryModel, any>
  > & { organizationId?: number } = { id, organizationId };
  const setClause = [
    "implementation_description",
    "status",
    "owner",
    "reviewer",
    "approver",
    "due_date",
    "auditor_feedback",
  ]
    .reduce((acc: string[], field) => {
      if (
        subcategory[field as keyof NISTAIMRFSubcategoryModel] != undefined
      ) {
        let value = subcategory[field as keyof NISTAIMRFSubcategoryModel];

        // Handle empty strings for integer fields
        if (["owner", "reviewer", "approver"].includes(field)) {
          if (value === "" || value === null || value === undefined) {
            return acc;
          }
          const numValue = parseInt(value as string);
          if (isNaN(numValue)) {
            return acc;
          }
          value = numValue;
        }

        updateSubcategory[field as keyof NISTAIMRFSubcategoryModel] = value;
        acc.push(`${field} = :${field}`);
      }
      return acc;
    }, [])
    .join(", ");

  let result: [NISTAIMRFSubcategoryModel[], number];
  if (setClause.length === 0) {
    // No fields to update, just get the current record
    result = (await sequelize.query(
      `SELECT * FROM nist_ai_rmf_subcategories WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: { organizationId, id },
        transaction,
      }
    )) as [NISTAIMRFSubcategoryModel[], number];
  } else {
    const query = `UPDATE nist_ai_rmf_subcategories SET ${setClause}, updated_at = NOW() WHERE organization_id = :organizationId AND id = :id RETURNING *;`;
    result = (await sequelize.query(query, {
      replacements: updateSubcategory,
      transaction,
    })) as [NISTAIMRFSubcategoryModel[], number];
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
  for (const fileId of deletedFiles) {
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

  // Fetch evidence_links from file_entity_links for backward compatibility with response
  const evidenceLinks = await getEvidenceFilesForEntity(
    organizationId,
    "nist_ai_rmf",
    "subcategory",
    id
  );
  const returnResult = result[0][0] as any;
  if (returnResult) {
    returnResult.evidence_links = evidenceLinks;
  }

  return returnResult;
};

/**
 * Delete subcategories for a project
 */
export const deleteSubcategoriesNISTByProjectIdQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction: Transaction
) => {
  // Get all subcategory IDs first to clean up file_entity_links
  const subcategoryIds = (await sequelize.query(
    `SELECT id FROM nist_ai_rmf_subcategories WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      type: QueryTypes.SELECT,
      transaction,
    }
  )) as { id: number }[];

  // Clean up file_entity_links for subcategories (evidence files)
  if (subcategoryIds.length > 0) {
    await deleteAllFileEntityLinksForEntities(
      organizationId,
      "nist_ai_rmf",
      "subcategory",
      subcategoryIds.map((s) => s.id),
      transaction
    );
  }

  const result = await sequelize.query(
    `DELETE FROM nist_ai_rmf_subcategories WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id RETURNING *`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      mapToModel: true,
      model: NISTAIMRFSubcategoryModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0;
};

/**
 * Delete NIST AI RMF project framework
 */
export const deleteProjectFrameworkNISTQuery = async (
  projectId: number,
  organizationId: number,
  transaction: Transaction
) => {
  const projectFrameworkId = (await sequelize.query(
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 4`,
    {
      replacements: { organizationId, project_id: projectId },
      transaction,
      type: QueryTypes.SELECT,
    }
  )) as Array<{ id: number }>;

  // Check if the project has a NIST AI RMF framework before trying to delete subcategories
  if (projectFrameworkId && projectFrameworkId.length > 0) {
    await deleteSubcategoriesNISTByProjectIdQuery(
      projectFrameworkId[0].id,
      organizationId,
      transaction
    );
  }

  const result = await sequelize.query(
    `DELETE FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 4 RETURNING *`,
    {
      replacements: { organizationId, project_id: projectId },
      transaction,
    }
  );
  return result.length > 0;
};
