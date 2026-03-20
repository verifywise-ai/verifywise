import { sequelize } from "../database/db";
import { ProjectsMembersModel } from "../domain.layer/models/projectsMembers/projectsMembers.model";
import { FileModel } from "../domain.layer/models/file/file.model";
import { QueryTypes, Transaction } from "sequelize";
import {
  getAllTopicsQuery,
  getAllSubTopicsQuery,
  getAllQuestionsQuery,
  getComplianceEUByProjectIdQuery,
} from "./eu.utils";
import { TopicStructEUModel } from "../domain.layer/frameworks/EU-AI-Act/topicStructEU.model";
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
  organizationId: number
): Promise<IProjectsMembers[]> => {
  const members = await sequelize.query(
    `SELECT * FROM projects_members WHERE organization_id = :organizationId AND project_id = :project_id`,
    {
      replacements: { project_id: projectId, organizationId },
      mapToModel: true,
      model: ProjectsMembersModel,
    }
  );
  return members;
};

interface GetGeneratedReportsOptions {
  userId: number;
  role: string;
  transaction?: Transaction;
}

export const getGeneratedReportsQuery = async ({
  userId,
  role,
  transaction,
}: GetGeneratedReportsOptions, organizationId: number) => {
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

  const isAdmin = role === "Admin";

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

  const whereConditions = [`report.organization_id = :organizationId`, `report.source IN (:sources)`];
  const replacements: any = { sources: validSources, organizationId };

  if (!isAdmin) {
    baseQueryParts.push(
      `LEFT JOIN projects_members pm ON pm.project_id = p.id AND pm.organization_id = :organizationId`
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
  transaction: Transaction
) => {
  // Clean up any virtual folder mappings for this file
  await sequelize.query(
    `DELETE FROM file_folder_mappings WHERE organization_id = :organizationId AND file_id = :id`,
    {
      replacements: { id, organizationId },
      transaction,
    }
  );

  const result = await sequelize.query(
    `DELETE FROM files WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: { id, organizationId },
      mapToModel: true,
      model: FileModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );

  return result.length > 0;
};

export const getReportByIdQuery = async (id: number, organizationId: number) => {
  const result = await sequelize.query(`SELECT * FROM files WHERE organization_id = :organizationId AND id = :id`, {
    replacements: { id, organizationId },
    mapToModel: true,
    model: FileModel,
  });
  return result[0];
};

export const getAssessmentReportQuery = async (
  projectId: number,
  frameworkId: number,
  organizationId: number
) => {
  const projectFrameworkIdQuery = (await sequelize.query(
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = :framework_id`,
    {
      replacements: { project_id: projectId, framework_id: frameworkId, organizationId },
    }
  )) as [{ id: number }[], number];
  const projectFrameworkId = projectFrameworkIdQuery[0][0]?.id;
  if (!projectFrameworkId) {
    throw new Error("Project framework id not found");
  }
  const assessmentId = (await sequelize.query(
    `SELECT id FROM assessments WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id`,
    {
      replacements: { projects_frameworks_id: projectFrameworkId, organizationId },
    }
  )) as [{ id: number }[], number];

  const assessmentIdValue = assessmentId[0]?.[0]?.id;

  const allTopics: TopicStructEUModel[] = await getAllTopicsQuery(organizationId);
  await Promise.all(
    allTopics.map(async (topic) => {
      if (topic.id) {
        const subtopicStruct = await getAllSubTopicsQuery(topic.id, organizationId);
        await Promise.all(
          subtopicStruct.map(async (subtopic) => {
            if (subtopic.id && assessmentIdValue) {
              const questionAnswers = await getAllQuestionsQuery(
                subtopic.id!,
                assessmentIdValue,
                organizationId
              );
              (subtopic.dataValues as any).questions = questionAnswers.map(
                (q) => ({ ...q })
              );
            }
          })
        );
        (topic.dataValues as any).subtopics = subtopicStruct.map((s) =>
          s.get({ plain: true })
        );
      }
    })
  );
  const allAssessments = allTopics.map((topic) => topic.get({ plain: true }));
  return allAssessments;
};

export const getAnnexesReportQuery = async (
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

  for (const annex of annexes[0]) {
    const annexCategories = await annexCategoriesQuery(
      projectFrameworkId,
      annex.id,
      organizationId,
      transaction
    );
    (annex as any).annexCategories = annexCategories;
  }
  return annexes[0];
};

export const annexCategoriesQuery = async (
  projectFrameworkId: number,
  annexId: number,
  organizationId: number,
  transaction: Transaction | null = null
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
    }
  );

  return annexCategories;
};

export const getComplianceReportQuery = async (projectFrameworkId: number, organizationId: number) => {
  const compliances = await getComplianceEUByProjectIdQuery(projectFrameworkId, organizationId);
  return compliances;
};

export const getClausesReportQuery = async (
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

  for (const clause of clauses[0]) {
    const subClauses = await subClausesQuery(
      projectFrameworkId,
      clause.id,
      organizationId,
      transaction
    );
    (clause as any).subClauses = subClauses;
  }
  return clauses[0];
};

export const subClausesQuery = async (
  projectFrameworkId: number,
  clauseId: number,
  organizationId: number,
  transaction: Transaction | null = null
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
    }
  );
};
