import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { ProjectFrameworksModel } from "../domain.layer/models/projectFrameworks/projectFrameworks.model";
import { STATUSES } from "../types/status.type";
import { ISO27001Clause } from "../structures/ISO-27001/clauses/iso27001.clause.struct";
import { ISO27001Annex } from "../structures/ISO-27001/annexes/iso27001.annex.struct";
import { ISO27001ClauseStructModel } from "../domain.layer/frameworks/ISO-27001/ISO27001ClauseStruct.model";
import { ISO27001SubClauseStructModel } from "../domain.layer/frameworks/ISO-27001/ISO27001SubClauseStruct.model";
import { ISO27001SubClauseModel } from "../domain.layer/frameworks/ISO-27001/ISO27001SubClause.model";
import { ISO27001AnnexStructModel } from "../domain.layer/frameworks/ISO-27001/ISO27001AnnexStruct.model";
import { ISO27001AnnexControlStructModel } from "../domain.layer/frameworks/ISO-27001/ISO27001AnnexControlStruct.model";
import { ISO27001AnnexControlModel } from "../domain.layer/frameworks/ISO-27001/ISO27001AnnexControl.model";
import { IISO27001SubClause } from "../domain.layer/interfaces/i.ISO27001SubClause";
import { ISO27001SubClauseRisksModel } from "../domain.layer/frameworks/ISO-27001/ISO27001SubClauseRisks.model";
import { IISO27001AnnexControl } from "../domain.layer/interfaces/i.iso27001AnnexControl";
import { ISO27001AnnexControlRisksModel } from "../domain.layer/frameworks/ISO-27001/ISO27001AnnexControlRisks.model";
import { validateRiskArray } from "./utility.utils";
import { getEvidenceFilesForEntity, getEvidenceFilesForEntities, deleteAllFileEntityLinksForEntities } from "./files/evidenceFiles.utils";

const getDemoSubClauses = (): Object[] => {
  const subClauses = [];
  for (let clause of ISO27001Clause) {
    for (let subClause of clause.subclauses) {
      subClauses.push({
        implementation_description: subClause.implementation_description || "",
        auditor_feedback:
          "auditor_feedback" in subClause
            ? (subClause as any).auditor_feedback || ""
            : "",
      });
    }
  }
  return subClauses;
};

const getDemoAnnexControls = (): Object[] => {
  const annexControls = [];
  for (let annex of ISO27001Annex) {
    for (let annexControl of annex.controls) {
      annexControls.push({
        implementation_description:
          annexControl.implementation_description || "",
        auditor_feedback:
          "auditor_feedback" in annexControl
            ? (annexControl as any).auditor_feedback || ""
            : "",
      });
    }
  }
  return annexControls;
};

export const countSubClausesISOByProjectId = async (
  projectFrameworkId: number,
  organizationId: number
): Promise<{
  totalSubclauses: string;
  doneSubclauses: string;
}> => {
  const result = (await sequelize.query(
    `SELECT COUNT(*) AS "totalSubclauses", SUM(CASE WHEN status = 'Implemented' THEN 1 ELSE 0 END) AS "doneSubclauses" FROM subclauses_iso27001 WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [{ totalSubclauses: string; doneSubclauses: string }[], number];
  return result[0][0];
};

export const countAnnexControlsISOByProjectId = async (
  projectFrameworkId: number,
  organizationId: number
): Promise<{
  totalAnnexControls: string;
  doneAnnexControls: string;
}> => {
  const result = (await sequelize.query(
    `SELECT COUNT(*) AS "totalAnnexControls", SUM(CASE WHEN status = 'Implemented' THEN 1 ELSE 0 END) AS "doneAnnexControls" FROM annexcontrols_iso27001 WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [{ totalAnnexControls: string; doneAnnexControls: string }[], number];
  return result[0][0];
};

/**
 * Counts the total and assigned subclauses for an ISO 27001 project framework.
 * A subclause is considered "assigned" if it has an owner (owner IS NOT NULL).
 *
 * @param projectFrameworkId - The ID of the project framework to count assignments for
 * @param organizationId - The organization ID for tenant isolation
 * @returns Promise resolving to an object with total and assigned subclause counts as strings
 *
 * @example
 * const counts = await countSubClauseAssignmentsISOByProjectId(2, 123);
 * // Returns: { totalSubclauses: "23", assignedSubclauses: "1" }
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
     FROM subclauses_iso27001
     WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [{ totalSubclauses: string; assignedSubclauses: string }[], number];

  return result[0][0];
};

/**
 * Counts the total and assigned annex controls for an ISO 27001 project framework.
 * An annex control is considered "assigned" if it has an owner (owner IS NOT NULL).
 *
 * @param projectFrameworkId - The ID of the project framework to count assignments for
 * @param organizationId - The organization ID for tenant isolation
 * @returns Promise resolving to an object with total and assigned annex control counts as strings
 *
 * @example
 * const counts = await countAnnexControlAssignmentsISOByProjectId(2, 123);
 * // Returns: { totalAnnexControls: "93", assignedAnnexControls: "3" }
 */
export const countAnnexControlAssignmentsISOByProjectId = async (
  projectFrameworkId: number,
  organizationId: number
): Promise<{
  totalAnnexControls: string;
  assignedAnnexControls: string;
}> => {
  const result = (await sequelize.query(
    `SELECT
       COUNT(*) AS "totalAnnexControls",
       SUM(CASE WHEN owner IS NOT NULL THEN 1 ELSE 0 END) AS "assignedAnnexControls"
     FROM annexcontrols_iso27001
     WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [
    { totalAnnexControls: string; assignedAnnexControls: string }[],
    number,
  ];

  return result[0][0];
};

export const getAllClausesQuery = async (
  _organizationId: number,
  transaction: Transaction | null = null
) => {
  // Clauses are in public schema (shared framework structure)
  const clauses = await sequelize.query(
    `SELECT * FROM clauses_struct_iso27001 ORDER BY id;`,
    {
      mapToModel: true,
      model: ISO27001ClauseStructModel,
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
    `SELECT * FROM clauses_struct_iso27001 ORDER BY id;`,
    {
      mapToModel: true,
      ...(transaction ? { transaction } : {}),
    }
  )) as [ISO27001ClauseStructModel[], number];

  for (let clause of clauses[0]) {
    const subClauses = (await sequelize.query(
      `SELECT sc.id, scs.title, scs.order_no, sc.status, sc.owner FROM subclauses_struct_iso27001 scs JOIN subclauses_iso27001 sc ON scs.id = sc.subclause_meta_id WHERE sc.organization_id = :organizationId AND scs.clause_id = :id AND sc.projects_frameworks_id = :projects_frameworks_id ORDER BY scs.id;`,
      {
        replacements: {
          organizationId,
          id: clause.id,
          projects_frameworks_id: projectFrameworkId,
        },
        mapToModel: true,
        ...(transaction ? { transaction } : {}),
      }
    )) as [
      Partial<ISO27001SubClauseStructModel & ISO27001SubClauseModel>[],
      number,
    ];

    (
      clause as ISO27001ClauseStructModel & {
        subClauses: Partial<
          ISO27001SubClauseStructModel & ISO27001SubClauseModel
        >[];
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
    `SELECT * FROM annex_struct_iso27001 ORDER BY id;`,
    {
      mapToModel: true,
      ...(transaction ? { transaction } : {}),
    }
  )) as [ISO27001AnnexStructModel[], number];

  // Collect all annex control IDs for batch file fetch
  const allAnnexControlIds: number[] = [];

  for (let annex of annexes[0]) {
    const annexControls = (await sequelize.query(
      `SELECT acs.id, acs.title, acs.description, acs.guidance, acs.sub_id, acs.order_no, acs.annex_id,
              ac.id as instance_id, ac.implementation_description,
              ac.status, ac.owner, ac.reviewer, ac.approver, ac.due_date, ac.auditor_feedback,
              ac.projects_frameworks_id, ac.created_at, ac.is_demo
         FROM annexcontrols_struct_iso27001 acs
         LEFT JOIN annexcontrols_iso27001 ac
           ON ac.organization_id = :organizationId
          AND acs.id = ac.annexcontrol_meta_id
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

    (annex as any).annexcontrols = annexControls[0];

    // Collect IDs for batch fetch
    for (const ac of annexControls[0]) {
      if (ac.instance_id) {
        allAnnexControlIds.push(ac.instance_id);
      }
    }
  }

  // Batch fetch evidence files from file_entity_links
  if (allAnnexControlIds.length > 0) {
    const filesMap = await getEvidenceFilesForEntities(
      organizationId,
      "iso_27001",
      "annex_control",
      allAnnexControlIds,
      "evidence"
    );

    // Attach files to annex controls
    for (const annex of annexes[0]) {
      for (const ac of (annex as any).annexcontrols || []) {
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
    `SELECT * FROM clauses_struct_iso27001 WHERE id = :id;`,
    {
      replacements: { id: clauseId },
      mapToModel: true,
      model: ISO27001ClauseStructModel,
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
    `SELECT sc.id, scs.title, scs.order_no, scs.clause_id, scs.requirement_summary, scs.key_questions, scs.evidence_examples,
            sc.owner AS owner, sc.reviewer AS reviewer, sc.due_date, sc.status
    FROM subclauses_iso27001 sc JOIN subclauses_struct_iso27001 scs ON
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
      scs.requirement_summary AS requirement_summary,
      scs.key_questions AS key_questions,
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
    FROM subclauses_struct_iso27001 scs JOIN subclauses_iso27001 sc ON scs.id = sc.subclause_meta_id
    WHERE sc.organization_id = :organizationId AND sc.id = :id ORDER BY created_at DESC, id ASC;`,
    {
      replacements: { organizationId, id: subClauseId },
      ...(transaction ? { transaction } : {}),
    }
  )) as [
    Partial<ISO27001SubClauseStructModel & ISO27001SubClauseModel>[],
    number,
  ];
  const subClause = subClauses[0][0];
  if (!subClause) {
    return null;
  }
  (subClause as any).risks = [];
  const risks = (await sequelize.query(
    `SELECT projects_risks_id FROM subclauses_iso27001__risks WHERE organization_id = :organizationId AND subclause_id = :id`,
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
    "iso_27001",
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
    `SELECT id FROM subclauses_iso27001 WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id ORDER BY id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [{ id: number }[], number];
  const msc = await getMainClausesQuery(
    subClauseIds[0].map((subClause) => subClause.id),
    organizationId
  );
  return msc;
};

export const getMainClausesQuery = async (
  subClauseIds: number[],
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const clausesStruct = (await getAllClausesQuery(
    organizationId,
    transaction
  )) as (ISO27001ClauseStructModel &
    Partial<ISO27001SubClauseStructModel & ISO27001SubClauseModel>[])[]; // wrong type

  // Convert Sequelize models to plain objects to ensure subClauses survives JSON serialization
  const clausesPlain = clausesStruct.map((clause: any) => ({
    ...clause.dataValues,
    subClauses: [] as any[],
  }));

  let clausesStructMap = new Map();
  for (let [i, clause] of clausesPlain.entries()) {
    clausesStructMap.set(clause.id, i);
  }

  for (let subClauseId of subClauseIds) {
    const subClause = await getSubClauseByIdQuery(
      subClauseId,
      organizationId,
      transaction
    );
    if (subClause) {
      const clauseIndex = clausesStructMap.get(subClause.clause_id!);
      if (clauseIndex !== undefined) {
        clausesPlain[clauseIndex].subClauses.push(subClause);
      }
    }
  }

  return clausesPlain;
};

export const getAllAnnexesQuery = async (
  _organizationId: number,
  transaction: Transaction | null = null
) => {
  // Annexes are in public schema (shared framework structure)
  const annexes = await sequelize.query(
    `SELECT * FROM annex_struct_iso27001 ORDER BY id;`,
    {
      mapToModel: true,
      model: ISO27001AnnexStructModel,
      ...(transaction ? { transaction } : {}),
    }
  );
  return annexes;
};

export const getAllAnnexesWithControlsQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const annexes = (await sequelize.query(
    `SELECT * FROM annex_struct_iso27001 ORDER BY id;`,
    {
      mapToModel: true,
      ...(transaction ? { transaction } : {}),
    }
  )) as [ISO27001AnnexStructModel[], number];

  for (let annex of annexes[0]) {
    const annexControls = (await sequelize.query(
      `SELECT acs.id, acs.title, acs.requirement_summary, acs.order_no, ac.status, ac.owner, ac.reviewer, ac.due_date
      FROM annexcontrols_struct_iso27001 acs JOIN annexcontrols_iso27001 ac
      ON acs.id = ac.annexcontrol_meta_id WHERE ac.organization_id = :organizationId AND acs.annex_id = :id
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
      Partial<ISO27001AnnexControlStructModel & ISO27001AnnexControlModel>[],
      number,
    ];

    (
      annex as ISO27001AnnexStructModel & {
        annexControls: Partial<
          ISO27001AnnexControlStructModel & ISO27001AnnexControlModel
        >[];
      }
    ).annexControls = annexControls[0];
  }
  return annexes[0];
};

export const getAnnexByIdQuery = async (
  annexId: number,
  transaction: Transaction | null = null
) => {
  const annex = await sequelize.query(
    `SELECT * FROM annex_struct_iso27001 WHERE id = :id;`,
    {
      replacements: { id: annexId },
      mapToModel: true,
      model: ISO27001AnnexStructModel,
      ...(transaction ? { transaction } : {}),
    }
  );
  return annex[0];
};

export const getAnnexControlsByAnnexIdQuery = async (
  annexId: number,
  _organizationId: number,
  transaction: Transaction | null = null
) => {
  // Annex control structure is in public schema (shared framework structure)
  const annexControls = await sequelize.query(
    `SELECT * FROM annexcontrols_struct_iso27001 WHERE annex_id = :id ORDER BY id;`,
    {
      replacements: { id: annexId },
      mapToModel: true,
      model: ISO27001AnnexControlStructModel,
      ...(transaction ? { transaction } : {}),
    }
  );
  return annexControls;
};

export const getAnnexControlByIdForProjectQuery = async (
  annexControlId: number,
  projectFrameworkId: number,
  organizationId: number
) => {
  const _annexControlId = (await sequelize.query(
    `SELECT id FROM annexcontrols_iso27001 WHERE organization_id = :organizationId AND annexcontrol_meta_id = :id AND projects_frameworks_id = :projects_frameworks_id;`,
    {
      replacements: {
        organizationId,
        id: annexControlId,
        projects_frameworks_id: projectFrameworkId,
      },
    }
  )) as [{ id: number }[], number];
  const annexControls = await getAnnexControlsByIdQuery(
    _annexControlId[0][0].id,
    organizationId
  );
  return annexControls;
};

export const getAnnexControlsByIdQuery = async (
  annexControlId: number,
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const annexControls = (await sequelize.query(
    `SELECT
      acs.title AS title,
      acs.requirement_summary AS requirement_summary,
      acs.key_questions AS key_questions,
      acs.evidence_examples AS evidence_examples,
      acs.annex_id AS annex_id,
      acs.order_no AS order_no,
      ac.id AS id,
      ac.implementation_description AS implementation_description,
      ac.status AS status,
      ac.owner AS owner,
      ac.reviewer AS reviewer,
      ac.approver AS approver,
      ac.due_date AS due_date,
      ac.auditor_feedback AS auditor_feedback,
      ac.created_at AS created_at
    FROM annexcontrols_struct_iso27001 acs JOIN annexcontrols_iso27001 ac ON acs.id = ac.annexcontrol_meta_id
    WHERE ac.organization_id = :organizationId AND ac.id = :id ORDER BY created_at DESC, id ASC;`,
    {
      replacements: { organizationId, id: annexControlId },
      ...(transaction ? { transaction } : {}),
    }
  )) as [
    Partial<ISO27001AnnexControlStructModel & ISO27001AnnexControlModel>[],
    number,
  ];
  const annexControl = annexControls[0][0];
  if (!annexControl) {
    return null;
  }
  (annexControl as any).risks = [];
  const risks = (await sequelize.query(
    `SELECT projects_risks_id FROM annexcontrols_iso27001__risks WHERE organization_id = :organizationId AND annexcontrol_id = :id`,
    {
      replacements: { organizationId, id: annexControlId },
      transaction,
    }
  )) as [{ projects_risks_id: number }[], number];
  for (let risk of risks[0]) {
    (annexControl as any).risks.push(risk.projects_risks_id);
  }

  // Fetch evidence files from file_entity_links
  (annexControl as any).evidence_links = await getEvidenceFilesForEntity(
    organizationId,
    "iso_27001",
    "annex_control",
    annexControlId,
    "evidence"
  );

  return annexControl;
};

export const getAnnexesByProjectIdQuery = async (
  projectFrameworkId: number,
  organizationId: number
) => {
  const annexControlIds = (await sequelize.query(
    `SELECT id FROM annexcontrols_iso27001 WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id ORDER BY id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [{ id: number }[], number];
  const rc = await getAnnexControlsQuery(
    annexControlIds[0].map((annexControl) => annexControl.id),
    organizationId
  );
  return rc;
};

export const getAnnexControlsQuery = async (
  annexControlIds: number[],
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const annexesStruct = (await getAllAnnexesQuery(
    organizationId,
    transaction
  )) as (ISO27001AnnexStructModel &
    Partial<ISO27001AnnexControlModel & ISO27001AnnexControlStructModel>[])[]; // wrong type
  let annexStructMap = new Map();
  for (let [i, annexStruct] of annexesStruct.entries()) {
    (annexStruct.dataValues as any).subClauses = [];
    annexStructMap.set(annexStruct.id, i);
  }
  for (let annexControlId of annexControlIds) {
    const annex = await getAnnexControlsByIdQuery(
      annexControlId,
      organizationId,
      transaction
    );
    if (annex) {
      (annexesStruct as any)[
        annexStructMap.get(annex.annex_id!)
      ].dataValues.subClauses.push(annex);
    }
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
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 3`,
    {
      replacements: { organizationId, project_id: projectId },
      transaction,
    }
  )) as [{ id: number }[], number];
  const subClauses = (await sequelize.query(
    `SELECT id FROM subclauses_struct_iso27001 ORDER BY id;`,
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
  const clauses = await getMainClausesQuery(subClauseIds, organizationId, transaction);
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
      `INSERT INTO subclauses_iso27001 (
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
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 3`,
    {
      replacements: { organizationId, project_id: projectId },
      transaction,
    }
  )) as [{ id: number }[], number];
  const annexControls = (await sequelize.query(
    `SELECT id FROM annexcontrols_struct_iso27001 ORDER BY id;`,
    { transaction }
  )) as [{ id: number }[], number];
  const demoAnnexControls = getDemoAnnexControls() as {
    implementation_description: string;
    auditor_feedback: string;
  }[];
  const annexControlIds = await createNewAnnexControlsQuery(
    annexControls[0].map((annexControl) => annexControl.id),
    projectFrameworkId[0][0].id,
    demoAnnexControls,
    enable_ai_data_insertion,
    organizationId,
    transaction,
    is_mock_data
  );
  const annexes = await getAnnexControlsQuery(
    annexControlIds,
    organizationId,
    transaction
  );
  return annexes;
};

export const createNewAnnexControlsQuery = async (
  annexControls: number[],
  projectFrameworkId: number,
  demoAnnexControls: {
    implementation_description: string;
    auditor_feedback: string;
  }[],
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction,
  is_mock_data: boolean
) => {
  const annexControlIds = [];
  let ctr = 0;
  for (let _annexControlId of annexControls) {
    const annexControlId = (await sequelize.query(
      `INSERT INTO annexcontrols_iso27001 (
        organization_id, annexcontrol_meta_id, projects_frameworks_id, implementation_description, auditor_feedback, status
      ) VALUES (
        :organizationId, :annexcontrol_meta_id, :projects_frameworks_id, :implementation_description, :auditor_feedback, :status
      ) RETURNING id;`,
      {
        replacements: {
          organizationId,
          annexcontrol_meta_id: _annexControlId,
          projects_frameworks_id: projectFrameworkId,
          implementation_description: enable_ai_data_insertion
            ? demoAnnexControls[ctr].implementation_description
            : null,
          auditor_feedback: enable_ai_data_insertion
            ? demoAnnexControls[ctr].auditor_feedback
            : null,
          status: is_mock_data
            ? STATUSES[Math.floor(Math.random() * STATUSES.length)]
            : "Not started",
        },
        transaction,
      }
    )) as [{ id: number }[], number];
    annexControlIds.push(annexControlId[0][0].id);
    ctr++;
  }
  return annexControlIds;
};

export const createISO27001FrameworkQuery = async (
  projectId: number,
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction,
  is_mock_data: boolean = false
) => {
  const main_clauses = await createNewClausesQuery(
    projectId,
    enable_ai_data_insertion,
    organizationId,
    transaction,
    is_mock_data
  );
  const annex_controls = await createNewAnnexesQUery(
    projectId,
    enable_ai_data_insertion,
    organizationId,
    transaction,
    is_mock_data
  );
  return {
    main_clauses,
    annex_controls,
  };
};

export const updateSubClauseQuery = async (
  id: number,
  subClause: Partial<
    ISO27001SubClauseModel & { risksDelete: string; risksMitigated: string }
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
  const updateSubClause: Partial<Record<keyof IISO27001SubClause, any>> & { organizationId?: number } = {
    id,
    organizationId,
  };
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
      if (subClause[field as keyof IISO27001SubClause] != undefined) {
        let value = subClause[field as keyof IISO27001SubClause];

        // Handle empty strings for integer fields
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

        updateSubClause[field as keyof IISO27001SubClause] = value;
        acc.push(`${field} = :${field}`);
      }
      return acc;
    }, [])
    .join(", ");

  let subClauseResult: ISO27001SubClauseModel;

  if (setClause.length > 0) {
    const query = `UPDATE subclauses_iso27001 SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;

    const result = (await sequelize.query(query, {
      replacements: updateSubClause,
      transaction,
    })) as [ISO27001SubClauseModel[], number];
    subClauseResult = result[0][0];
  } else {
    // No fields to update, fetch current record
    const result = (await sequelize.query(
      `SELECT * FROM subclauses_iso27001 WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: { organizationId, id },
        transaction,
      }
    )) as [ISO27001SubClauseModel[], number];
    subClauseResult = result[0][0];
  }

  (subClauseResult as any).risks = [];

  // Create file entity links for new uploaded files
  for (const file of uploadedFiles) {
    await sequelize.query(
      `INSERT INTO file_entity_links
        (organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_at)
       VALUES (:organizationId, :fileId, 'iso_27001', 'subclause', :entityId, 'evidence', NOW())
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
         AND framework_type = 'iso_27001'
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
    `SELECT projects_risks_id FROM subclauses_iso27001__risks WHERE organization_id = :organizationId AND subclause_id = :id`,
    {
      replacements: { organizationId, id },
      transaction,
    }
  )) as [ISO27001SubClauseRisksModel[], number];
  let currentRisks = risks[0].map((r) => r.projects_risks_id!);
  currentRisks = currentRisks.filter((r) => !risksDeleted.includes(r));
  currentRisks = currentRisks.concat(risksMitigated);

  await sequelize.query(
    `DELETE FROM subclauses_iso27001__risks WHERE organization_id = :organizationId AND subclause_id = :id;`,
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
      `INSERT INTO subclauses_iso27001__risks (organization_id, subclause_id, projects_risks_id) VALUES ${placeholders} RETURNING projects_risks_id;`,
      {
        replacements,
        transaction,
      }
    )) as [{ projects_risks_id: number }[], number];
    for (let risk of subClauseRisksInsertResult[0]) {
      (subClauseResult as any).risks.push(risk.projects_risks_id);
    }
  }
  return subClauseResult as IISO27001SubClause;
};

export const updateAnnexControlQuery = async (
  id: number,
  annexControl: Partial<
    IISO27001AnnexControl & { risksDelete: string; risksMitigated: string }
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
  const updateAnnexControl: Partial<Record<keyof IISO27001AnnexControl, any>> & { organizationId?: number } =
    { organizationId };
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
      if (annexControl[field as keyof IISO27001AnnexControl] != undefined) {
        let value = annexControl[field as keyof IISO27001AnnexControl];

        // Handle empty strings for integer fields
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

        updateAnnexControl[field as keyof IISO27001AnnexControl] = value;
        acc.push(`${field} = :${field}`);
      }
      return acc;
    }, [])
    .join(", ");

  // update the risks
  const risksDeletedRaw = JSON.parse(annexControl.risksDelete || "[]");
  const risksMitigatedRaw = JSON.parse(annexControl.risksMitigated || "[]");

  // Validate that both arrays contain only valid integers
  const risksDeleted = validateRiskArray(risksDeletedRaw, "risksDelete");
  const risksMitigated = validateRiskArray(risksMitigatedRaw, "risksMitigated");

  let annexControlResult: ISO27001AnnexControlModel;

  if (setClause.length > 0) {
    const query = `UPDATE annexcontrols_iso27001 SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;
    updateAnnexControl.id = id;

    const result = (await sequelize.query(query, {
      replacements: updateAnnexControl,
      transaction,
    })) as [ISO27001AnnexControlModel[], number];
    annexControlResult = result[0][0];

    if (!annexControlResult) {
      throw new Error(`Annex control with ID ${id} not found`);
    }
  } else if (risksDeleted.length > 0 || risksMitigated.length > 0 || uploadedFiles.length > 0 || deletedFiles.length > 0) {
    // No fields to update but we have risk or file changes, fetch current record
    const result = (await sequelize.query(
      `SELECT * FROM annexcontrols_iso27001 WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: { organizationId, id },
        transaction,
      }
    )) as [ISO27001AnnexControlModel[], number];
    annexControlResult = result[0][0];

    if (!annexControlResult) {
      throw new Error(`Annex control with ID ${id} not found`);
    }
  } else {
    return annexControl as IISO27001AnnexControl;
  }

  (annexControlResult as any).risks = [];

  // Create file entity links for new uploaded files
  for (const file of uploadedFiles) {
    await sequelize.query(
      `INSERT INTO file_entity_links
        (organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_at)
       VALUES (:organizationId, :fileId, 'iso_27001', 'annex_control', :entityId, 'evidence', NOW())
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
         AND framework_type = 'iso_27001'
         AND entity_type = 'annex_control'
         AND entity_id = :entityId`,
      {
        replacements: { organizationId, fileId, entityId: id },
        transaction,
      }
    );
  }

  const risks = (await sequelize.query(
    `SELECT projects_risks_id FROM annexcontrols_iso27001__risks WHERE organization_id = :organizationId AND annexcontrol_id = :id`,
    {
      replacements: { organizationId, id },
      transaction,
    }
  )) as [ISO27001AnnexControlRisksModel[], number];
  let currentRisks = risks[0].map((r) => r.projects_risks_id!);
  currentRisks = currentRisks.filter((r) => !risksDeleted.includes(r));
  currentRisks = currentRisks.concat(risksMitigated);

  await sequelize.query(
    `DELETE FROM annexcontrols_iso27001__risks WHERE organization_id = :organizationId AND annexcontrol_id = :id;`,
    {
      replacements: { organizationId, id },
      transaction,
    }
  );
  if (currentRisks.length > 0) {
    // Create parameterized placeholders for safe insertion
    const placeholders = currentRisks
      .map((_, i) => `(:organizationId, :annexcontrol_id${i}, :projects_risks_id${i})`)
      .join(", ");
    const replacements: { [key: string]: any } = { organizationId };

    // Build replacement parameters safely
    currentRisks.forEach((risk, i) => {
      replacements[`annexcontrol_id${i}`] = id;
      replacements[`projects_risks_id${i}`] = risk;
    });

    const annexControlRisksInsertResult = (await sequelize.query(
      `INSERT INTO annexcontrols_iso27001__risks (organization_id, annexcontrol_id, projects_risks_id) VALUES ${placeholders} RETURNING projects_risks_id;`,
      {
        replacements,
        transaction,
      }
    )) as [{ projects_risks_id: number }[], number];
    for (let risk of annexControlRisksInsertResult[0]) {
      (annexControlResult as any).risks.push(risk.projects_risks_id);
    }
  }

  return annexControlResult;
};

export const deleteSubClausesISO27001ByProjectIdQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction: Transaction
) => {
  // Get all subclause IDs first to clean up file_entity_links
  const subclauseIds = (await sequelize.query(
    `SELECT id FROM subclauses_iso27001 WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id`,
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
      "iso_27001",
      "subclause",
      subclauseIds.map((s) => s.id),
      transaction
    );
  }

  const result = await sequelize.query(
    `DELETE FROM subclauses_iso27001 WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id RETURNING *`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      mapToModel: true,
      model: ISO27001SubClauseModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0;
};

export const deleteAnnexControlsISO27001ByProjectIdQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction: Transaction
) => {
  // Get all annexcontrol IDs first to clean up file_entity_links
  const annexControlIds = (await sequelize.query(
    `SELECT id FROM annexcontrols_iso27001 WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      type: QueryTypes.SELECT,
      transaction,
    }
  )) as { id: number }[];

  // Clean up file_entity_links for annexcontrols (evidence files)
  if (annexControlIds.length > 0) {
    await deleteAllFileEntityLinksForEntities(
      organizationId,
      "iso_27001",
      "annexcontrol",
      annexControlIds.map((a) => a.id),
      transaction
    );
  }

  // delete the risks first
  await sequelize.query(
    `DELETE FROM annexcontrols_iso27001__risks WHERE organization_id = :organizationId AND annexcontrol_id IN (SELECT id FROM annexcontrols_iso27001 WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id)`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      transaction,
    }
  );
  const result = await sequelize.query(
    `DELETE FROM annexcontrols_iso27001 WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id RETURNING *`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      mapToModel: true,
      model: ISO27001AnnexControlModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0;
};

export const deleteProjectFrameworkISO27001Query = async (
  projectId: number,
  organizationId: number,
  transaction: Transaction
) => {
  const projectFrameworkId = (await sequelize.query(
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 3`,
    {
      replacements: { organizationId, project_id: projectId },
      transaction,
    }
  )) as [{ id: number }[], number];
  const subClausesDeleted = await deleteSubClausesISO27001ByProjectIdQuery(
    projectFrameworkId[0][0].id,
    organizationId,
    transaction
  );
  const annexControlsDeleted =
    await deleteAnnexControlsISO27001ByProjectIdQuery(
      projectFrameworkId[0][0].id,
      organizationId,
      transaction
    );
  const result = await sequelize.query(
    `DELETE FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 3 RETURNING *`,
    {
      replacements: { organizationId, project_id: projectId },
      mapToModel: true,
      model: ProjectFrameworksModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0 && subClausesDeleted && annexControlsDeleted;
};
