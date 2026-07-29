import { sequelize } from "../database/db";
import { ProjectsMembersModel } from "../domain.layer/models/projectsMembers/projectsMembers.model";
import { FileModel } from "../domain.layer/models/file/file.model";
import { QueryTypes, Transaction } from "sequelize";
import {
  getVisibleEuCategoryIdsForProject,
} from "./eu.utils";
import { AnnexStructISOModel } from "../domain.layer/frameworks/ISO-42001/annexStructISO.model";
import { ClauseStructISOModel } from "../domain.layer/frameworks/ISO-42001/clauseStructISO.model";
import { IProjectsMembers } from "../domain.layer/interfaces/i.projectMember";

/**
 * Retrieves all project risk data from the `projectrisks` table,
 * including the risk owner's name and surname from the `users` table.
 *
 * @param projectId - The ID of the project
 * @returns projectRisks[] with risk_owner's name and surname
 */
export const getProjectRisksReportQuery = async (projectId: number, organizationId: number) => {
  const query = `
    SELECT
      risk.*,
      pr.project_id AS project_id,
      u.name AS risk_owner_name,
      u.surname AS risk_owner_surname
    FROM risks risk
    JOIN projects_risks pr ON risk.id = pr.risk_id AND pr.organization_id = :organizationId
    LEFT JOIN users u ON risk.risk_owner = u.id
    WHERE risk.organization_id = :organizationId AND pr.project_id = :project_id
    ORDER BY risk.created_at DESC, risk.id ASC
  `;
  const projectRisks = await sequelize.query(query, {
    replacements: { project_id: projectId, organizationId },
    type: QueryTypes.SELECT,
  });
  return projectRisks;
};

export const getMembersByProjectIdQuery = async (
  projectId: number,
  organizationId: number,
): Promise<IProjectsMembers[]> => {
  const members = await sequelize.query(
    `SELECT * FROM projects_members WHERE organization_id = :organizationId AND project_id = :project_id`,
    {
      replacements: { project_id: projectId, organizationId },
      mapToModel: true,
      model: ProjectsMembersModel,
    },
  );
  return members;
};

interface GetGeneratedReportsOptions {
  userId: number;
  role: string;
  transaction?: Transaction;
}

export const getGeneratedReportsQuery = async (
  { userId, role, transaction }: GetGeneratedReportsOptions,
  organizationId: number,
) => {
  const validSources = [
    "Project risks report",
    "Compliance tracker report",
    "Assessment tracker report",
    "Reference controls group",
    "Clauses and annexes report",
    "Vendors and risks report",
    "Models and risks report",
    "Training registry report",
    "Policy manager report",
    "All reports",
  ];

  const isAdmin = role === "Admin" || role === "SuperAdmin";

  const baseQueryParts = [
    `SELECT
      report.id,
      report.filename,
      report.project_id,
      report.uploaded_time,
      report.source,
      p.project_title AS project_title,
      u.name AS uploader_name,
      u.surname AS uploader_surname
    FROM files report
    JOIN projects p ON report.project_id = p.id AND p.organization_id = :organizationId
    JOIN users u ON report.uploaded_by = u.id`,
  ];

  const whereConditions = [
    `report.organization_id = :organizationId`,
    `report.source IN (:sources)`,
  ];
  const replacements: any = { sources: validSources, organizationId };

  if (!isAdmin) {
    baseQueryParts.push(
      `LEFT JOIN projects_members pm ON pm.project_id = p.id AND pm.organization_id = :organizationId`,
    );
    whereConditions.push(`(p.owner = :userId OR pm.user_id = :userId)`);
    replacements.userId = userId;
  }

  const finalQuery = `
    ${baseQueryParts.join("\n")}
    WHERE ${whereConditions.join(" AND ")}
    ORDER BY report.uploaded_time DESC, report.id ASC
  `;

  return await sequelize.query(finalQuery, {
    replacements,
    type: QueryTypes.SELECT,
    transaction,
  });
};

export const deleteReportByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction,
) => {
  // Clean up any virtual folder mappings for this file
  await sequelize.query(
    `DELETE FROM file_folder_mappings WHERE organization_id = :organizationId AND file_id = :id`,
    {
      replacements: { id, organizationId },
      transaction,
    },
  );

  const result = await sequelize.query(
    `DELETE FROM files WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: { id, organizationId },
      mapToModel: true,
      model: FileModel,
      type: QueryTypes.DELETE,
      transaction,
    },
  );

  return result.length > 0;
};

export const getReportByIdQuery = async (id: number, organizationId: number) => {
  const result = await sequelize.query(
    `SELECT * FROM files WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { id, organizationId },
      mapToModel: true,
      model: FileModel,
    },
  );
  return result[0];
};

export const getAssessmentReportQuery = async (
  projectId: number,
  frameworkId: number,
  organizationId: number,
) => {
  const projectFrameworkIdQuery = (await sequelize.query(
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = :framework_id`,
    {
      replacements: { project_id: projectId, framework_id: frameworkId, organizationId },
    },
  )) as [{ id: number }[], number];
  const projectFrameworkId = projectFrameworkIdQuery[0][0]?.id;
  if (!projectFrameworkId) {
    throw new Error("Project framework id not found");
  }
  const assessmentId = (await sequelize.query(
    `SELECT id FROM assessments WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id`,
    {
      replacements: { projects_frameworks_id: projectFrameworkId, organizationId },
    },
  )) as [{ id: number }[], number];

  const assessmentIdValue = assessmentId[0]?.[0]?.id;

  // One flat read of the topic -> subtopic -> question tree.
  //
  // Deliberately NOT getAllTopicsQuery + getAllSubTopicsQuery +
  // getAllQuestionsQuery, which is the Assessment screen's loader: it issues a
  // query per subtopic and, inside each, pulls every answer's evidence files
  // and linked risks. Measured on 2026-07-29 that cost 129 queries for one
  // project, and the report reads none of the evidence or risk data — the
  // section renders question, answer and status. A report covers every pairing
  // in its scope, so the cost multiplies by the organization's project count.
  //
  // LEFT JOINs, because the shape must not change: the old loader listed every
  // topic and subtopic in the framework whether or not the project had answered
  // anything, and an assessment row that does not exist yet leaves the tree
  // present but its question lists empty.
  const rows = (await sequelize.query(
    `SELECT t.id AS topic_id, t.title AS topic_title, t.order_no AS topic_order,
            st.id AS subtopic_id, st.title AS subtopic_title, st.order_no AS subtopic_order,
            q.id AS question_id, q.question AS question, q.order_no AS question_order,
            a.answer AS answer, a.status AS status
       FROM topics_struct_eu t
       LEFT JOIN subtopics_struct_eu st ON st.topic_id = t.id
       LEFT JOIN questions_struct_eu q ON q.subtopic_id = st.id
       LEFT JOIN answers_eu a ON a.question_id = q.id
                             AND a.organization_id = :organizationId
                             AND a.assessment_id = :assessment_id
      ORDER BY t.order_no, t.id, st.order_no, st.id, q.order_no, q.id`,
    {
      replacements: { organizationId, assessment_id: assessmentIdValue ?? null },
      type: QueryTypes.SELECT,
    },
  )) as any[];

  const topics = new Map<number, any>();
  const subtopics = new Map<number, any>();
  for (const row of rows) {
    let topic = topics.get(row.topic_id);
    if (!topic) {
      topic = { id: row.topic_id, title: row.topic_title, subtopics: [] };
      topics.set(row.topic_id, topic);
    }
    if (row.subtopic_id == null) continue;

    let subtopic = subtopics.get(row.subtopic_id);
    if (!subtopic) {
      subtopic = { id: row.subtopic_id, title: row.subtopic_title, questions: [] };
      subtopics.set(row.subtopic_id, subtopic);
      topic.subtopics.push(subtopic);
    }
    // A question with no answer row is not part of this project's assessment;
    // counting it would inflate the section's denominator.
    if (row.question_id == null || row.answer === undefined || row.status === null) continue;

    subtopic.questions.push({
      id: row.question_id,
      question: row.question,
      answer: row.answer,
      status: row.status,
    });
  }
  return Array.from(topics.values());
};

export const getAnnexesReportQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction: Transaction | null = null,
) => {
  const annexes = (await sequelize.query(`SELECT * FROM annex_struct_iso ORDER BY id;`, {
    mapToModel: true,
    ...(transaction ? { transaction } : {}),
  })) as [AnnexStructISOModel[], number];

  for (const annex of annexes[0]) {
    const annexCategories = await annexCategoriesQuery(
      projectFrameworkId,
      annex.id,
      organizationId,
      transaction,
    );
    (annex as any).annexCategories = annexCategories;
  }
  return annexes[0];
};

export const annexCategoriesQuery = async (
  projectFrameworkId: number,
  annexId: number,
  organizationId: number,
  transaction: Transaction | null = null,
) => {
  const annexCategories = await sequelize.query(
    `SELECT acs.id, acs.title, acs.description, acs.order_no, ac.status, ac.is_applicable, ac.justification_for_exclusion, ac.implementation_description
       FROM annexcategories_struct_iso acs
       JOIN annexcategories_iso ac ON acs.id = ac.annexcategory_meta_id AND ac.organization_id = :organizationId
       WHERE acs.annex_id = :id AND ac.projects_frameworks_id = :projects_frameworks_id
       ORDER BY acs.id;`,
    {
      replacements: {
        id: annexId,
        projects_frameworks_id: projectFrameworkId,
        organizationId,
      },
      type: QueryTypes.SELECT,
      ...(transaction ? { transaction } : {}),
    },
  );

  return annexCategories;
};

/**
 * Control categories with their controls, for the report's compliance section.
 *
 * Deliberately NOT getComplianceEUByProjectIdQuery, which is the Requirements
 * screen's loader: that one walks control-by-control and pulls each control's
 * subcontrols, evidence files and linked risks. Measured on 2026-07-29 it cost
 * 604 queries for one project — none of which the report reads, since the
 * section renders id, title, status, owner, due date and family. A report
 * covers every pairing in its scope, so that cost is multiplied by the number
 * of projects in the organization.
 *
 * The visible-category filter is the same rule the Requirements screen applies:
 * a project's EU AI Act risk tier decides which control families are
 * applicable, and the report must show the same set the screen does.
 */
export const getComplianceReportQuery = async (
  projectFrameworkId: number,
  organizationId: number,
) => {
  const visibleCategoryIds = await getVisibleEuCategoryIdsForProject(
    projectFrameworkId,
    organizationId,
  );
  if (visibleCategoryIds.length === 0) return [];

  const rows = (await sequelize.query(
    `SELECT ccs.id AS category_id,
            ccs.title AS category_title,
            ccs.order_no AS category_order,
            c.id AS id,
            c.status AS status,
            c.owner AS owner,
            c.due_date AS due_date,
            cs.title AS title,
            cs.description AS description,
            cs.order_no AS order_no
       FROM controls_eu c
       JOIN controls_struct_eu cs ON cs.id = c.control_meta_id
       JOIN controlcategories_struct_eu ccs ON ccs.id = cs.control_category_id
      WHERE c.organization_id = :organizationId
        AND c.projects_frameworks_id = :projects_frameworks_id
        AND cs.control_category_id IN (:visibleCategoryIds)
      ORDER BY ccs.order_no, cs.order_no, c.id`,
    {
      replacements: {
        organizationId,
        projects_frameworks_id: projectFrameworkId,
        visibleCategoryIds,
      },
      type: QueryTypes.SELECT,
    },
  )) as any[];

  // Regrouped into the { title, controls[] } shape the collector reads. Only
  // categories that actually hold a control appear, matching the old loader:
  // it started from the project's control ids, so an empty family produced an
  // empty controls array that the collector then contributed nothing from.
  const byCategory = new Map<number, { id: number; title: string; controls: any[] }>();
  for (const row of rows) {
    let category = byCategory.get(row.category_id);
    if (!category) {
      category = { id: row.category_id, title: row.category_title, controls: [] };
      byCategory.set(row.category_id, category);
    }
    category.controls.push({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      owner: row.owner,
      due_date: row.due_date,
      order_no: row.order_no,
    });
  }
  return Array.from(byCategory.values());
};

export const getClausesReportQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction: Transaction | null = null,
) => {
  const clauses = (await sequelize.query(`SELECT * FROM clauses_struct_iso ORDER BY id;`, {
    mapToModel: true,
    ...(transaction ? { transaction } : {}),
  })) as [ClauseStructISOModel[], number];

  for (const clause of clauses[0]) {
    const subClauses = await subClausesQuery(
      projectFrameworkId,
      clause.id,
      organizationId,
      transaction,
    );
    (clause as any).subClauses = subClauses;
  }
  return clauses[0];
};

export const subClausesQuery = async (
  projectFrameworkId: number,
  clauseId: number,
  organizationId: number,
  transaction: Transaction | null = null,
) => {
  return await sequelize.query(
    `SELECT scs.id, scs.title, scs.order_no, scs.summary, sc.status, sc.implementation_description
     FROM subclauses_struct_iso scs
     JOIN subclauses_iso sc ON scs.id = sc.subclause_meta_id AND sc.organization_id = :organizationId
     WHERE scs.clause_id = :clause_id AND sc.projects_frameworks_id = :projects_frameworks_id
     ORDER BY scs.id;`,
    {
      replacements: {
        clause_id: clauseId,
        projects_frameworks_id: projectFrameworkId,
        organizationId,
      },
      type: QueryTypes.SELECT,
      ...(transaction ? { transaction } : {}),
    },
  );
};
