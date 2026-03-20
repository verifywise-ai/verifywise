import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { ClauseStructISOModel } from "../domain.layer/frameworks/ISO-42001/clauseStructISO.model";
import { SubClauseStructISOModel } from "../domain.layer/frameworks/ISO-42001/subClauseStructISO.model";
import {
  SubClauseISO,
  SubClauseISOModel,
} from "../domain.layer/frameworks/ISO-42001/subClauseISO.model";
import { AnnexStructISOModel } from "../domain.layer/frameworks/ISO-42001/annexStructISO.model";
import {
  AnnexCategoryISO,
  AnnexCategoryISOModel,
} from "../domain.layer/frameworks/ISO-42001/annexCategoryISO.model";
import { AnnexCategoryStructISOModel } from "../domain.layer/frameworks/ISO-42001/annexCategoryStructISO.model";
import { AnnexCategoryISORisksModel } from "../domain.layer/frameworks/ISO-42001/annexCategoryISORIsks.model";
import { ProjectFrameworksModel } from "../domain.layer/models/projectFrameworks/projectFrameworks.model";
import { Clauses } from "../structures/ISO-42001/clauses/clauses.struct";
import { Annex } from "../structures/ISO-42001/annex/annex.struct";
import { STATUSES } from "../types/status.type";
import { SubClauseISORisks } from "../domain.layer/frameworks/ISO-42001/subClauseISORisks.model";
import { validateRiskArray } from "./utility.utils";
import { getEvidenceFilesForEntity, getEvidenceFilesForEntities, deleteAllFileEntityLinksForEntities } from "./files/evidenceFiles.utils";

const getDemoSubClauses = (): Object[] => {
  const subClauses = [];
  for (let clause of Clauses) {
    for (let subClause of clause.subclauses) {
      subClauses.push({
        implementation_description: subClause.implementation_description || "",
        auditor_feedback: subClause.auditor_feedback || "",
      });
    }
  }
  return subClauses;
};

const getDemoAnnexCategories = (): Object[] => {
  const annexCategories = [];
  for (let annex of Annex) {
    for (let annexCategory of annex.annexcategories) {
      annexCategories.push({
        is_applicable: annexCategory.is_applicable,
        justification_for_exclusion:
          annexCategory.justification_for_exclusion || "",
        implementation_description:
          annexCategory.implementation_description || "",
        auditor_feedback: annexCategory.auditor_feedback || "",
      });
    }
  }
  return annexCategories;
};

export const countSubClausesISOByProjectId = async (
  projectFrameworkId: number,
  organizationId: number
): Promise<{
  totalSubclauses: string;
  doneSubclauses: string;
}> => {
  const result = (await sequelize.query(
    `SELECT COUNT(*) AS "totalSubclauses", SUM(CASE WHEN status = 'Implemented' THEN 1 ELSE 0 END) AS "doneSubclauses" FROM subclauses_iso WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [{ totalSubclauses: string; doneSubclauses: string }[], number];
  return result[0][0];
};

export const countAnnexCategoriesISOByProjectId = async (
  projectFrameworkId: number,
  organizationId: number
): Promise<{
  totalAnnexcategories: string;
  doneAnnexcategories: string;
}> => {
  const result = (await sequelize.query(
    `SELECT COUNT(*) AS "totalAnnexcategories", SUM(CASE WHEN status = 'Implemented' THEN 1 ELSE 0 END) AS "doneAnnexcategories" FROM annexcategories_iso WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [
    { totalAnnexcategories: string; doneAnnexcategories: string }[],
    number,
  ];
  return result[0][0];
};

/**
 * Counts the total and assigned subclauses for an ISO 42001 project framework.
 * A subclause is considered "assigned" if it has an owner (owner IS NOT NULL).
 *
 * @param projectFrameworkId - The ID of the project framework to count assignments for
 * @param tenant - The tenant schema identifier for multi-tenant database access
 * @returns Promise resolving to an object with total and assigned subclause counts as strings
 *
 * @example
 * const counts = await countSubClauseAssignmentsISOByProjectId(3, 'tenant_123');
 * // Returns: { totalSubclauses: "24", assignedSubclauses: "4" }
 */
export const countSubClauseAssignmentsISOByProjectId = async (
  projectFrameworkId: number,
  organizationId: number
): Promise<{
  totalSubclauses: string;
  assignedSubclauses: string;
}> => {
  const result = (await sequelize.query(
    `SELECT
       COUNT(*) AS "totalSubclauses",
       SUM(CASE WHEN owner IS NOT NULL THEN 1 ELSE 0 END) AS "assignedSubclauses"
     FROM subclauses_iso
     WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [{ totalSubclauses: string; assignedSubclauses: string }[], number];

  return result[0][0];
};

/**
 * Counts the total and assigned annex categories for an ISO 42001 project framework.
 * An annex category is considered "assigned" if it has an owner (owner IS NOT NULL).
 *
 * @param projectFrameworkId - The ID of the project framework to count assignments for
 * @param organizationId - The organization ID for multi-tenant database access
 * @returns Promise resolving to an object with total and assigned annex category counts as strings
 *
 * @example
 * const counts = await countAnnexCategoryAssignmentsISOByProjectId(3, 1);
 * // Returns: { totalAnnexcategories: "37", assignedAnnexcategories: "2" }
 */
export const countAnnexCategoryAssignmentsISOByProjectId = async (
  projectFrameworkId: number,
  organizationId: number
): Promise<{
  totalAnnexcategories: string;
  assignedAnnexcategories: string;
}> => {
  const result = (await sequelize.query(
    `SELECT
       COUNT(*) AS "totalAnnexcategories",
       SUM(CASE WHEN owner IS NOT NULL THEN 1 ELSE 0 END) AS "assignedAnnexcategories"
     FROM annexcategories_iso
     WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [
    { totalAnnexcategories: string; assignedAnnexcategories: string }[],
    number,
  ];

  return result[0][0];
};

export const getAllClausesQuery = async (
  _organizationId: number,
  transaction: Transaction | null = null
) => {
  const clauses = await sequelize.query(
    `SELECT * FROM clauses_struct_iso ORDER BY id;`,
    {
      mapToModel: true,
      model: ClauseStructISOModel,
      ...(transaction ? { transaction } : {}),
    }
  );
  return clauses;
};

export const getAllClausesWithSubClauseQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const clauses = (await sequelize.query(
    `SELECT * FROM clauses_struct_iso ORDER BY id;`,
    {
      mapToModel: true,
      ...(transaction ? { transaction } : {}),
    }
  )) as [ClauseStructISOModel[], number];

  for (let clause of clauses[0]) {
    const subClauses = (await sequelize.query(
      `SELECT sc.id, scs.title, scs.order_no, sc.status, sc.owner FROM subclauses_struct_iso scs JOIN subclauses_iso sc ON scs.id = sc.subclause_meta_id WHERE sc.organization_id = :organizationId AND scs.clause_id = :id AND sc.projects_frameworks_id = :projects_frameworks_id ORDER BY scs.id;`,
      {
        replacements: {
          organizationId,
          id: clause.id,
          projects_frameworks_id: projectFrameworkId,
        },
        mapToModel: true,
        ...(transaction ? { transaction } : {}),
      }
    )) as [Partial<SubClauseStructISOModel & SubClauseISOModel>[], number];
    (
      clause as ClauseStructISOModel & {
        subClauses: Partial<SubClauseStructISOModel & SubClauseISOModel>[];
      }
    ).subClauses = subClauses[0];
  }
  return clauses[0];
};

export const getAllAnnexesWithSubAnnexQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const annexes = (await sequelize.query(
    `SELECT * FROM annex_struct_iso ORDER BY id;`,
    {
      mapToModel: true,
      ...(transaction ? { transaction } : {}),
    }
  )) as [AnnexStructISOModel[], number];

  // Collect all annex category IDs for batch file fetch
  const allAnnexCategoryIds: number[] = [];

  for (let annex of annexes[0]) {
    const annexCategories = (await sequelize.query(
      `SELECT acs.id, acs.title, acs.description, acs.guidance, acs.sub_id, acs.order_no, acs.annex_id,
              ac.id as instance_id, ac.is_applicable, ac.justification_for_exclusion, ac.implementation_description,
              ac.status, ac.owner, ac.reviewer, ac.approver, ac.due_date, ac.auditor_feedback,
              ac.projects_frameworks_id, ac.created_at, ac.is_demo
         FROM annexcategories_struct_iso acs
         LEFT JOIN annexcategories_iso ac
           ON acs.id = ac.annexcategory_meta_id
          AND ac.organization_id = :organizationId
          AND ac.projects_frameworks_id = :projects_frameworks_id
        WHERE acs.annex_id = :annex_id
        ORDER BY acs.order_no, acs.id;`,
      {
        replacements: {
          organizationId,
          annex_id: annex.id,
          projects_frameworks_id: projectFrameworkId,
        },
        mapToModel: false, // This is a mixed result, not a single model
        ...(transaction ? { transaction } : {}),
      }
    )) as [any[], number];

    (annex as any).annexcategories = annexCategories[0];

    // Collect IDs for batch fetch
    for (const ac of annexCategories[0]) {
      if (ac.instance_id) {
        allAnnexCategoryIds.push(ac.instance_id);
      }
    }
  }

  // Batch fetch evidence files from file_entity_links
  if (allAnnexCategoryIds.length > 0) {
    const filesMap = await getEvidenceFilesForEntities(
      organizationId,
      "iso_42001",
      "annex_category",
      allAnnexCategoryIds,
      "evidence"
    );

    // Attach files to annex categories
    for (const annex of annexes[0]) {
      for (const ac of (annex as any).annexcategories || []) {
        if (ac.instance_id) {
          ac.evidence_links = filesMap.get(ac.instance_id) || [];
        }
      }
    }
  }

  return annexes[0];
};

export const getClauseById = async (
  clauseId: number,
  transaction: Transaction | null = null
) => {
  const clause = await sequelize.query(
    `SELECT * FROM clauses_struct_iso WHERE id = :id;`,
    {
      replacements: { id: clauseId },
      mapToModel: true,
      model: ClauseStructISOModel,
      ...(transaction ? { transaction } : {}),
    }
  );
  return clause[0];
};

export const getSubClausesByClauseIdQuery = async (
  clauseId: number,
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const subClauses = await sequelize.query(
    `SELECT sc.id, scs.title, scs.order_no, scs.clause_id, scs.summary, scs.questions, scs.evidence_examples,
            sc.owner AS owner, sc.reviewer AS reviewer, sc.due_date, sc.status
    FROM subclauses_iso sc JOIN subclauses_struct_iso scs ON
    sc.subclause_meta_id = scs.id WHERE sc.organization_id = :organizationId AND scs.clause_id = :id ORDER BY scs.id;`,
    {
      replacements: { organizationId, id: clauseId },
      mapToModel: true,
      ...(transaction ? { transaction } : {}),
    }
  );
  return subClauses[0];
};

export const getSubClauseByIdForProjectQuery = async (
  subClauseId: number,
  _projectFrameworkId: number,
  organizationId: number
) => {
  const subClause = await getSubClauseByIdQuery(subClauseId, organizationId);
  return subClause;
};

export const getSubClauseByIdQuery = async (
  subClauseId: number,
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const subClauses = (await sequelize.query(
    `SELECT
      scs.title AS title,
      scs.summary AS summary,
      scs.questions AS questions,
      scs.evidence_examples AS evidence_examples,
      scs.clause_id AS clause_id,
      scs.order_no AS order_no,
      sc.id AS id,
      sc.implementation_description AS implementation_description,
      sc.status AS status,
      sc.owner AS owner,
      sc.reviewer AS reviewer,
      sc.approver AS approver,
      sc.due_date AS due_date,
      sc.auditor_feedback AS auditor_feedback,
      sc.created_at AS created_at
    FROM subclauses_struct_iso scs JOIN subclauses_iso sc ON scs.id = sc.subclause_meta_id
    WHERE sc.organization_id = :organizationId AND sc.id = :id ORDER BY created_at DESC, id ASC;`,
    {
      replacements: { organizationId, id: subClauseId },
      ...(transaction ? { transaction } : {}),
    }
  )) as [Partial<SubClauseStructISOModel & SubClauseISOModel>[], number];
  const subClause = subClauses[0][0];
  if (!subClause) {
    return null;
  }
  (subClause as any).risks = [];
  const risks = (await sequelize.query(
    `SELECT projects_risks_id FROM subclauses_iso__risks WHERE organization_id = :organizationId AND subclause_id = :id`,
    {
      replacements: { organizationId, id: subClauseId },
      transaction,
    }
  )) as [{ projects_risks_id: number }[], number];
  for (let risk of risks[0]) {
    (subClause as any).risks.push(risk.projects_risks_id);
  }

  // Fetch evidence files from file_entity_links
  (subClause as any).evidence_links = await getEvidenceFilesForEntity(
    organizationId,
    "iso_42001",
    "subclause",
    subClauseId,
    "evidence"
  );

  return subClause;
};

export const getClausesByProjectIdQuery = async (
  projectFrameworkId: number,
  organizationId: number
) => {
  const subClauseIds = (await sequelize.query(
    `SELECT id FROM subclauses_iso WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id ORDER BY id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [{ id: number }[], number];
  const msc = await getManagementSystemClausesQuery(
    subClauseIds[0].map((subClause) => subClause.id),
    organizationId
  );
  return msc;
};

export const getManagementSystemClausesQuery = async (
  subClauseIds: number[],
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const clausesStruct = (await getAllClausesQuery(
    organizationId,
    transaction
  )) as (ClauseStructISOModel &
    Partial<SubClauseStructISOModel & SubClauseISOModel>[])[]; // wrong type
  let clausesStructMap = new Map();
  for (let [i, clauseStruct] of clausesStruct.entries()) {
    (clauseStruct.dataValues as any).subClauses = [];
    clausesStructMap.set(clauseStruct.id, i);
  }
  for (let subClauseId of subClauseIds) {
    const subClause = await getSubClauseByIdQuery(
      subClauseId,
      organizationId,
      transaction
    );
    if (subClause) {
      (clausesStruct as any)[
        clausesStructMap.get(subClause.clause_id!)
      ].dataValues.subClauses.push(subClause);
    }
  }
  return clausesStruct;
};

export const getAllAnnexesQuery = async (
  _organizationId: number,
  transaction: Transaction | null = null
) => {
  const annexes = await sequelize.query(
    `SELECT * FROM annex_struct_iso ORDER BY id;`,
    {
      mapToModel: true,
      model: AnnexStructISOModel,
      ...(transaction ? { transaction } : {}),
    }
  );
  return annexes;
};

export const getAllAnnexesWithCategoriesQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const annexes = (await sequelize.query(
    `SELECT * FROM annex_struct_iso ORDER BY id;`,
    {
      mapToModel: true,
      ...(transaction ? { transaction } : {}),
    }
  )) as [AnnexStructISOModel[], number];

  for (let annex of annexes[0]) {
    const annexCategories = (await sequelize.query(
      `SELECT acs.id, acs.title, acs.description, acs.order_no, ac.status, ac.owner, ac.is_applicable, ac.reviewer, ac.due_date
      FROM annexcategories_struct_iso acs JOIN annexcategories_iso ac
      ON acs.id = ac.annexcategory_meta_id WHERE ac.organization_id = :organizationId AND acs.annex_id = :id
      AND ac.projects_frameworks_id = :projects_frameworks_id ORDER BY id;`,
      {
        replacements: {
          organizationId,
          id: annex.id,
          projects_frameworks_id: projectFrameworkId,
        },
        mapToModel: true,
        ...(transaction ? { transaction } : {}),
      }
    )) as [
      Partial<AnnexCategoryStructISOModel & AnnexCategoryISOModel>[],
      number,
    ];

    (
      annex as AnnexStructISOModel & {
        annexCategories: Partial<
          AnnexCategoryStructISOModel & AnnexCategoryISOModel
        >[];
      }
    ).annexCategories = annexCategories[0];
  }
  return annexes[0];
};

export const getAnnexByIdQuery = async (
  annexId: number,
  transaction: Transaction | null = null
) => {
  const annex = await sequelize.query(
    `SELECT * FROM annex_struct_iso WHERE id = :id;`,
    {
      replacements: { id: annexId },
      mapToModel: true,
      model: AnnexStructISOModel,
      ...(transaction ? { transaction } : {}),
    }
  );
  return annex[0];
};

export const getAnnexCategoriesByAnnexIdQuery = async (
  annexId: number,
  _organizationId: number,
  transaction: Transaction | null = null
) => {
  const annexCategories = await sequelize.query(
    `SELECT * FROM annexcategories_struct_iso WHERE annex_id = :id ORDER BY id;`,
    {
      replacements: { id: annexId },
      mapToModel: true,
      model: AnnexCategoryStructISOModel,
      ...(transaction ? { transaction } : {}),
    }
  );
  return annexCategories;
};

export const getAnnexCategoryByIdForProjectQuery = async (
  annexCategoryId: number,
  projectFrameworkId: number,
  organizationId: number
) => {
  const _annexCategoryId = (await sequelize.query(
    `SELECT id FROM annexcategories_iso WHERE organization_id = :organizationId AND annexcategory_meta_id = :id AND projects_frameworks_id = :projects_frameworks_id;`,
    {
      replacements: {
        organizationId,
        id: annexCategoryId,
        projects_frameworks_id: projectFrameworkId,
      },
    }
  )) as [{ id: number }[], number];
  const annexCategories = await getAnnexCategoriesByIdQuery(
    _annexCategoryId[0][0].id,
    organizationId
  );
  return annexCategories;
};

export const getAnnexCategoriesByIdQuery = async (
  annexCategoryId: number,
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const annexCategories = (await sequelize.query(
    `SELECT
      acs.title AS title,
      acs.description AS description,
      acs.guidance AS guidance,
      acs.annex_id AS annex_id,
      acs.order_no AS order_no,
      ac.id AS id,
      ac.is_applicable AS is_applicable,
      ac.justification_for_exclusion AS justification_for_exclusion,
      ac.implementation_description AS implementation_description,
      ac.status AS status,
      ac.owner AS owner,
      ac.reviewer AS reviewer,
      ac.approver AS approver,
      ac.due_date AS due_date,
      ac.auditor_feedback AS auditor_feedback,
      ac.created_at AS created_at
    FROM annexcategories_struct_iso acs JOIN annexcategories_iso ac ON acs.id = ac.annexcategory_meta_id
    WHERE ac.organization_id = :organizationId AND ac.id = :id ORDER BY created_at DESC, id ASC;`,
    {
      replacements: { organizationId, id: annexCategoryId },
      ...(transaction ? { transaction } : {}),
    }
  )) as [
    Partial<AnnexCategoryStructISOModel & AnnexCategoryISOModel>[],
    number,
  ];
  const annexCategory = annexCategories[0][0];
  (annexCategory as any).risks = [];
  const risks = (await sequelize.query(
    `SELECT projects_risks_id FROM annexcategories_iso__risks WHERE organization_id = :organizationId AND annexcategory_id = :id`,
    {
      replacements: { organizationId, id: annexCategoryId },
      transaction,
    }
  )) as [{ projects_risks_id: number }[], number];
  for (let risk of risks[0]) {
    (annexCategory as any).risks.push(risk.projects_risks_id);
  }

  // Fetch evidence files from file_entity_links
  (annexCategory as any).evidence_links = await getEvidenceFilesForEntity(
    organizationId,
    "iso_42001",
    "annex_category",
    annexCategoryId,
    "evidence"
  );

  return annexCategory;
};

export const getAnnexesByProjectIdQuery = async (
  projectFrameworkId: number,
  organizationId: number
) => {
  const annexCategoryIds = (await sequelize.query(
    `SELECT id FROM annexcategories_iso WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id ORDER BY id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [{ id: number }[], number];
  const rc = await getReferenceControlsQuery(
    annexCategoryIds[0].map((annexCategory) => annexCategory.id),
    organizationId
  );
  return rc;
};

export const getReferenceControlsQuery = async (
  annexCategoryIds: number[],
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const annexesStruct = (await getAllAnnexesQuery(
    organizationId,
    transaction
  )) as (AnnexStructISOModel &
    Partial<AnnexCategoryISOModel & AnnexCategoryStructISOModel>[])[]; // wrong type
  let annexStructMap = new Map();
  for (let [i, annexStruct] of annexesStruct.entries()) {
    (annexStruct.dataValues as any).subClauses = [];
    annexStructMap.set(annexStruct.id, i);
  }
  for (let annexCategoryId of annexCategoryIds) {
    const annex = await getAnnexCategoriesByIdQuery(
      annexCategoryId,
      organizationId,
      transaction
    );
    (annexesStruct as any)[
      annexStructMap.get(annex.annex_id!)
    ].dataValues.subClauses.push(annex);
  }
  return annexesStruct;
};

export const createNewClausesQuery = async (
  projectId: number,
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction,
  is_mock_data: boolean
) => {
  const projectFrameworkId = (await sequelize.query(
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 2`,
    {
      replacements: { organizationId, project_id: projectId },
      transaction,
    }
  )) as [{ id: number }[], number];
  const subClauses = (await sequelize.query(
    `SELECT id FROM subclauses_struct_iso ORDER BY id;`,
    { transaction }
  )) as [{ id: number }[], number];
  const demoSubClauses = getDemoSubClauses() as {
    implementation_description: string;
    auditor_feedback: string;
  }[];
  const subClauseIds = await createNewSubClausesQuery(
    subClauses[0].map((subClause) => subClause.id),
    projectFrameworkId[0][0].id,
    enable_ai_data_insertion,
    demoSubClauses,
    organizationId,
    transaction,
    is_mock_data
  );
  const clauses = await getManagementSystemClausesQuery(
    subClauseIds,
    organizationId,
    transaction
  );
  return clauses;
};

export const createNewSubClausesQuery = async (
  subClauses: number[],
  projectFrameworkId: number,
  enable_ai_data_insertion: boolean,
  demoSubClauses: {
    implementation_description: string;
    auditor_feedback: string;
  }[],
  organizationId: number,
  transaction: Transaction,
  is_mock_data: boolean
) => {
  const subClauseIds = [];
  let ctr = 0;
  for (let _subClauseId of subClauses) {
    const subClauseId = (await sequelize.query(
      `INSERT INTO subclauses_iso (
        organization_id, subclause_meta_id, projects_frameworks_id, implementation_description, auditor_feedback, status
      ) VALUES (
        :organizationId, :subclause_meta_id, :projects_frameworks_id, :implementation_description, :auditor_feedback, :status
      ) RETURNING id;`,
      {
        replacements: {
          organizationId,
          subclause_meta_id: _subClauseId,
          projects_frameworks_id: projectFrameworkId,
          implementation_description: enable_ai_data_insertion
            ? demoSubClauses[ctr].implementation_description
            : null,
          auditor_feedback: enable_ai_data_insertion
            ? demoSubClauses[ctr].auditor_feedback
            : null,
          status: is_mock_data
            ? STATUSES[Math.floor(Math.random() * STATUSES.length)]
            : "Not started",
        },
        transaction,
      }
    )) as [{ id: number }[], number];
    subClauseIds.push(subClauseId[0][0].id);
    ctr++;
  }
  return subClauseIds;
};

export const createNewAnnexesQUery = async (
  projectId: number,
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction,
  is_mock_data: boolean
) => {
  const projectFrameworkId = (await sequelize.query(
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 2`,
    {
      replacements: { organizationId, project_id: projectId },
      transaction,
    }
  )) as [{ id: number }[], number];
  const annexCategories = (await sequelize.query(
    `SELECT id FROM annexcategories_struct_iso ORDER BY id;`,
    { transaction }
  )) as [{ id: number }[], number];
  const demoAnnexCategories = getDemoAnnexCategories() as {
    is_applicable: boolean;
    justification_for_exclusion: string;
    implementation_description: string;
    auditor_feedback: string;
  }[];
  const annexCategoryIds = await createNewAnnexeCategoriesQuery(
    annexCategories[0].map((annexCategory) => annexCategory.id),
    projectFrameworkId[0][0].id,
    demoAnnexCategories,
    enable_ai_data_insertion,
    organizationId,
    transaction,
    is_mock_data
  );
  const annexes = await getReferenceControlsQuery(
    annexCategoryIds,
    organizationId,
    transaction
  );
  return annexes;
};

export const createNewAnnexeCategoriesQuery = async (
  annexCategories: number[],
  projectFrameworkId: number,
  demoAnnexCategories: {
    is_applicable: boolean;
    justification_for_exclusion: string;
    implementation_description: string;
    auditor_feedback: string;
  }[],
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction,
  is_mock_data: boolean
) => {
  const annexCategoryIds = [];
  let ctr = 0;
  for (let _annexCategoryId of annexCategories) {
    const annexCategoryId = (await sequelize.query(
      `INSERT INTO annexcategories_iso (
        organization_id, annexcategory_meta_id, projects_frameworks_id, is_applicable, justification_for_exclusion, implementation_description, auditor_feedback, status
      ) VALUES (
        :organizationId, :annexcategory_meta_id, :projects_frameworks_id, :is_applicable, :justification_for_exclusion, :implementation_description, :auditor_feedback, :status
      ) RETURNING id;`,
      {
        replacements: {
          organizationId,
          annexcategory_meta_id: _annexCategoryId,
          projects_frameworks_id: projectFrameworkId,
          is_applicable: enable_ai_data_insertion
            ? demoAnnexCategories[ctr].is_applicable
            : null,
          justification_for_exclusion: enable_ai_data_insertion
            ? demoAnnexCategories[ctr].justification_for_exclusion
            : null,
          implementation_description: enable_ai_data_insertion
            ? demoAnnexCategories[ctr].implementation_description
            : null,
          auditor_feedback: enable_ai_data_insertion
            ? demoAnnexCategories[ctr].auditor_feedback
            : null,
          status: is_mock_data
            ? STATUSES[Math.floor(Math.random() * STATUSES.length)]
            : "Not started",
        },
        transaction,
      }
    )) as [{ id: number }[], number];
    annexCategoryIds.push(annexCategoryId[0][0].id);
    ctr++;
  }
  return annexCategoryIds;
};

export const createISOFrameworkQuery = async (
  projectId: number,
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction,
  is_mock_data: boolean = false
) => {
  const management_system_clauses = await createNewClausesQuery(
    projectId,
    enable_ai_data_insertion,
    organizationId,
    transaction,
    is_mock_data
  );
  const reference_controls = await createNewAnnexesQUery(
    projectId,
    enable_ai_data_insertion,
    organizationId,
    transaction,
    is_mock_data
  );
  return {
    management_system_clauses,
    reference_controls,
  };
};

export const updateSubClauseQuery = async (
  id: number,
  subClause: Partial<
    SubClauseISOModel & { risksDelete: string; risksMitigated: string }
  >,
  uploadedFiles: {
    id: string;
    fileName: string;
    project_id?: number;
    uploaded_by: number;
    uploaded_time: Date;
  }[] = [],
  deletedFiles: number[] = [],
  organizationId: number,
  transaction: Transaction
) => {
  const updateSubClause: Partial<Record<keyof SubClauseISO, any>> & { organizationId?: number } = { id, organizationId };
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
      if (subClause[field as keyof SubClauseISO] != undefined) {
        let value = subClause[field as keyof SubClauseISO];

        // Handle empty strings for integer fields - skip if empty
        if (["owner", "reviewer", "approver"].includes(field)) {
          if (value === "" || value === null || value === undefined) {
            return acc; // Skip this field if it's empty
          }
          const numValue = parseInt(value as string);
          if (isNaN(numValue)) {
            return acc; // Skip this field if it's not a valid number
          }
          value = numValue;
        }

        // Skip empty strings for other fields too
        if (value === "") {
          return acc;
        }

        updateSubClause[field as keyof SubClauseISO] = value;
        acc.push(`${field} = :${field}`);
      }
      return acc;
    }, [])
    .join(", ");

  let subClauseResult: SubClauseISOModel;

  if (setClause.length > 0) {
    const query = `UPDATE subclauses_iso SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;
    updateSubClause.id = id;

    const result = (await sequelize.query(query, {
      replacements: updateSubClause,
      transaction,
    })) as [SubClauseISOModel[], number];
    subClauseResult = result[0][0];
  } else {
    // No fields to update, fetch current record
    const result = (await sequelize.query(
      `SELECT * FROM subclauses_iso WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: { organizationId, id },
        transaction,
      }
    )) as [SubClauseISOModel[], number];
    subClauseResult = result[0][0];
  }

  (subClauseResult as any).risks = [];

  // Create file entity links for new uploaded files
  for (const file of uploadedFiles) {
    await sequelize.query(
      `INSERT INTO file_entity_links
        (organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_at)
       VALUES (:organizationId, :fileId, 'iso_42001', 'subclause', :entityId, 'evidence', NOW())
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
         AND framework_type = 'iso_42001'
         AND entity_type = 'subclause'
         AND entity_id = :entityId`,
      {
        replacements: { organizationId, fileId, entityId: id },
        transaction,
      }
    );
  }

  // update the risks
  const risksDeletedRaw = JSON.parse(subClause.risksDelete || "[]");
  const risksMitigatedRaw = JSON.parse(subClause.risksMitigated || "[]");

  // Validate that both arrays contain only valid integers
  const risksDeleted = validateRiskArray(risksDeletedRaw, "risksDelete");
  const risksMitigated = validateRiskArray(risksMitigatedRaw, "risksMitigated");
  const risks = (await sequelize.query(
    `SELECT projects_risks_id FROM subclauses_iso__risks WHERE organization_id = :organizationId AND subclause_id = :id`,
    {
      replacements: { organizationId, id },
      transaction,
    }
  )) as [SubClauseISORisks[], number];
  let currentRisks = risks[0].map((r) => r.projects_risks_id!);
  currentRisks = currentRisks.filter((r) => !risksDeleted.includes(r));
  currentRisks = currentRisks.concat(risksMitigated);

  await sequelize.query(
    `DELETE FROM subclauses_iso__risks WHERE organization_id = :organizationId AND subclause_id = :id;`,
    {
      replacements: { organizationId, id },
      transaction,
    }
  );
  if (currentRisks.length > 0) {
    // Create parameterized placeholders for safe insertion
    const placeholders = currentRisks
      .map((_, i) => `(:organizationId, :subclause_id${i}, :projects_risks_id${i})`)
      .join(", ");
    const replacements: { [key: string]: any } = { organizationId };

    // Build replacement parameters safely
    currentRisks.forEach((risk, i) => {
      replacements[`subclause_id${i}`] = id;
      replacements[`projects_risks_id${i}`] = risk;
    });

    const subClauseRisksInsertResult = (await sequelize.query(
      `INSERT INTO subclauses_iso__risks (organization_id, subclause_id, projects_risks_id) VALUES ${placeholders} RETURNING projects_risks_id;`,
      {
        replacements,
        transaction,
      }
    )) as [{ projects_risks_id: number }[], number];
    for (let risk of subClauseRisksInsertResult[0]) {
      (subClauseResult as any).risks.push(risk.projects_risks_id);
    }
  }
  return subClauseResult as SubClauseISO;
};

export const updateAnnexCategoryQuery = async (
  id: number,
  annexCategory: Partial<
    AnnexCategoryISO & { risksDelete: string; risksMitigated: string }
  >,
  uploadedFiles: {
    id: string;
    fileName: string;
    project_id?: number;
    uploaded_by: number;
    uploaded_time: Date;
  }[] = [],
  deletedFiles: number[] = [],
  organizationId: number,
  transaction: Transaction
) => {
  const updateAnnexCategory: Partial<Record<keyof AnnexCategoryISO, any>> & { organizationId?: number } = { organizationId };
  const setClause = [
    "is_applicable",
    "justification_for_exclusion",
    "implementation_description",
    "status",
    "owner",
    "reviewer",
    "approver",
    "due_date",
    "auditor_feedback",
  ]
    .reduce((acc: string[], field) => {
      if (annexCategory[field as keyof AnnexCategoryISO] != undefined) {
        let value = annexCategory[field as keyof AnnexCategoryISO];

        // Handle empty strings for integer fields - skip if empty
        if (["owner", "reviewer", "approver"].includes(field)) {
          if (value === "" || value === null || value === undefined) {
            return acc; // Skip this field if it's empty
          }
          const numValue = parseInt(value as string);
          if (isNaN(numValue)) {
            return acc; // Skip this field if it's not a valid number
          }
          value = numValue;
        }

        // Skip empty strings for other fields too
        if (value === "") {
          return acc;
        }

        updateAnnexCategory[field as keyof AnnexCategoryISO] = value;
        acc.push(`${field} = :${field}`);
      }
      return acc;
    }, [])
    .join(", ");

  let annexCategoryResult: AnnexCategoryISOModel;

  if (setClause.length > 0) {
    const query = `UPDATE annexcategories_iso SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;
    updateAnnexCategory.id = id;

    const result = (await sequelize.query(query, {
      replacements: updateAnnexCategory,
      transaction,
    })) as [AnnexCategoryISOModel[], number];
    annexCategoryResult = result[0][0];
  } else {
    // No fields to update, fetch current record
    const result = (await sequelize.query(
      `SELECT * FROM annexcategories_iso WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: { organizationId, id },
        transaction,
      }
    )) as [AnnexCategoryISOModel[], number];
    annexCategoryResult = result[0][0];
  }

  (annexCategoryResult as any).risks = [];

  // Create file entity links for new uploaded files
  for (const file of uploadedFiles) {
    await sequelize.query(
      `INSERT INTO file_entity_links
        (organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_at)
       VALUES (:organizationId, :fileId, 'iso_42001', 'annex_category', :entityId, 'evidence', NOW())
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
         AND framework_type = 'iso_42001'
         AND entity_type = 'annex_category'
         AND entity_id = :entityId`,
      {
        replacements: { organizationId, fileId, entityId: id },
        transaction,
      }
    );
  }

  // update the risks
  const risksDeletedRaw = JSON.parse(annexCategory.risksDelete || "[]");
  const risksMitigatedRaw = JSON.parse(annexCategory.risksMitigated || "[]");

  // Validate that both arrays contain only valid integers
  const risksDeleted = validateRiskArray(risksDeletedRaw, "risksDelete");
  const risksMitigated = validateRiskArray(risksMitigatedRaw, "risksMitigated");
  const risks = (await sequelize.query(
    `SELECT projects_risks_id FROM annexcategories_iso__risks WHERE organization_id = :organizationId AND annexcategory_id = :id`,
    {
      replacements: { organizationId, id },
      transaction,
    }
  )) as [AnnexCategoryISORisksModel[], number];
  let currentRisks = risks[0].map((r) => r.projects_risks_id!);
  currentRisks = currentRisks.filter((r) => !risksDeleted.includes(r));
  currentRisks = currentRisks.concat(risksMitigated);

  await sequelize.query(
    `DELETE FROM annexcategories_iso__risks WHERE organization_id = :organizationId AND annexcategory_id = :id;`,
    {
      replacements: { organizationId, id },
      transaction,
    }
  );
  if (currentRisks.length > 0) {
    // Create parameterized placeholders for safe insertion
    const placeholders = currentRisks
      .map((_, i) => `(:organizationId, :annexcategory_id${i}, :projects_risks_id${i})`)
      .join(", ");
    const replacements: { [key: string]: any } = { organizationId };

    // Build replacement parameters safely
    currentRisks.forEach((risk, i) => {
      replacements[`annexcategory_id${i}`] = id;
      replacements[`projects_risks_id${i}`] = risk;
    });

    const annexCategoryRisksInsertResult = (await sequelize.query(
      `INSERT INTO annexcategories_iso__risks (organization_id, annexcategory_id, projects_risks_id) VALUES ${placeholders} RETURNING projects_risks_id;`,
      {
        replacements,
        transaction,
      }
    )) as [{ projects_risks_id: number }[], number];
    for (let risk of annexCategoryRisksInsertResult[0]) {
      (annexCategoryResult as any).risks.push(risk.projects_risks_id);
    }
  }

  return annexCategoryResult;
};

export const deleteSubClausesISOByProjectIdQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction: Transaction
) => {
  // Get all subclause IDs first to clean up file_entity_links
  const subclauseIds = (await sequelize.query(
    `SELECT id FROM subclauses_iso WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      type: QueryTypes.SELECT,
      transaction,
    }
  )) as { id: number }[];

  // Clean up file_entity_links for subclauses (evidence files)
  if (subclauseIds.length > 0) {
    await deleteAllFileEntityLinksForEntities(
      organizationId,
      "iso_42001",
      "subclause",
      subclauseIds.map((s) => s.id),
      transaction
    );
  }

  const result = await sequelize.query(
    `DELETE FROM subclauses_iso WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id RETURNING *`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      mapToModel: true,
      model: SubClauseISOModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0;
};

export const deleteAnnexCategoriesISOByProjectIdQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction: Transaction
) => {
  // Get all annexcategory IDs first to clean up file_entity_links
  const annexCategoryIds = (await sequelize.query(
    `SELECT id FROM annexcategories_iso WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      type: QueryTypes.SELECT,
      transaction,
    }
  )) as { id: number }[];

  // Clean up file_entity_links for annexcategories (evidence files)
  if (annexCategoryIds.length > 0) {
    await deleteAllFileEntityLinksForEntities(
      organizationId,
      "iso_42001",
      "annexcategory",
      annexCategoryIds.map((a) => a.id),
      transaction
    );
  }

  // delete the risks first
  await sequelize.query(
    `DELETE FROM annexcategories_iso__risks WHERE organization_id = :organizationId AND annexcategory_id IN (SELECT id FROM annexcategories_iso WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id)`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      transaction,
    }
  );
  const result = await sequelize.query(
    `DELETE FROM annexcategories_iso WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id RETURNING *`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      mapToModel: true,
      model: AnnexCategoryISOModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0;
};

export const deleteProjectFrameworkISOQuery = async (
  projectId: number,
  organizationId: number,
  transaction: Transaction
) => {
  const projectFrameworkId = (await sequelize.query(
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 2`,
    {
      replacements: { organizationId, project_id: projectId },
      transaction,
    }
  )) as [{ id: number }[], number];
  const subClausesDeleted = await deleteSubClausesISOByProjectIdQuery(
    projectFrameworkId[0][0].id,
    organizationId,
    transaction
  );
  const annexeCategoriesDeleted =
    await deleteAnnexCategoriesISOByProjectIdQuery(
      projectFrameworkId[0][0].id,
      organizationId,
      transaction
    );
  const result = await sequelize.query(
    `DELETE FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 2 RETURNING *`,
    {
      replacements: { organizationId, project_id: projectId },
      mapToModel: true,
      model: ProjectFrameworksModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0 && subClausesDeleted && annexeCategoriesDeleted;
};

/**
 * Get all risks linked to a specific ISO 42001 subclause
 * @param subclauseId - The subclause ID
 * @param organizationId - The organization ID
 * @returns Array of risk objects
 */
export const getSubClauseRisksQuery = async (
  subclauseId: number,
  organizationId: number
): Promise<any[]> => {
  const risks = await sequelize.query(
    `SELECT pr.*
     FROM risks pr
     INNER JOIN subclauses_iso__risks sir
       ON pr.organization_id = sir.organization_id AND pr.id = sir.projects_risks_id
     WHERE sir.organization_id = :organizationId AND sir.subclause_id = :subclauseId
     ORDER BY pr.id ASC`,
    {
      replacements: { organizationId, subclauseId },
      type: QueryTypes.SELECT,
    }
  );
  return risks as any[];
};

/**
 * Get all risks linked to a specific ISO 42001 annex category
 * @param annexCategoryId - The annex category ID
 * @param organizationId - The organization ID
 * @returns Array of risk objects
 */
export const getAnnexCategoryRisksQuery = async (
  annexCategoryId: number,
  organizationId: number
): Promise<any[]> => {
  const risks = await sequelize.query(
    `SELECT pr.*
     FROM risks pr
     INNER JOIN annexcategories_iso__risks acr
       ON pr.organization_id = acr.organization_id AND pr.id = acr.projects_risks_id
     WHERE acr.organization_id = :organizationId AND acr.annexcategory_id = :annexCategoryId
     ORDER BY pr.id ASC`,
    {
      replacements: { organizationId, annexCategoryId },
      type: QueryTypes.SELECT,
    }
  );
  return risks as any[];
};
