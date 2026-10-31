import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  highRiskRolesArraySql,
  legacyHighRiskRole,
  normalizeHighRiskRoles,
} from "./highRiskRoles.utils";
import {
  Answers,
  ClassificationRole,
  StoredClassificationResult,
} from "../services/euAiActClassification";

export interface ClassificationRun {
  id: number;
  organizationId: number;
  useCaseId: number | null;
  intakeSubmissionId: number | null;
  questionnaireVersion: number;
  role: ClassificationRole | null;
  roles: ClassificationRole[];
  answers: Answers;
  result: StoredClassificationResult;
  reviewerLevel: string | null;
  reviewerJustification: string | null;
  reviewedBy: number | null;
  source: "wizard" | "intake";
  createdBy: number | null;
  createdAt: Date;
}

/** The single role column is derived from roles on insert. */
export type NewClassificationRun = Omit<
  ClassificationRun,
  "id" | "organizationId" | "createdAt" | "role"
>;

const RUN_COLUMNS = `
  id, organization_id AS "organizationId", use_case_id AS "useCaseId",
  intake_submission_id AS "intakeSubmissionId",
  questionnaire_version AS "questionnaireVersion", role, roles, answers, result,
  reviewer_level AS "reviewerLevel", reviewer_justification AS "reviewerJustification",
  reviewed_by AS "reviewedBy", source, created_by AS "createdBy", created_at AS "createdAt"
`;

export const insertClassificationRunQuery = async (
  run: NewClassificationRun,
  organizationId: number,
  transaction?: Transaction,
): Promise<ClassificationRun> => {
  const roles = highRiskRolesArraySql(run.roles, "roles");
  const rows = (await sequelize.query(
    `INSERT INTO eu_ai_act_classifications
       (organization_id, use_case_id, intake_submission_id, questionnaire_version, role, roles,
        answers, result, reviewer_level, reviewer_justification, reviewed_by, source, created_by)
     VALUES
       (:organizationId, :useCaseId, :intakeSubmissionId, :questionnaireVersion, :role, ${roles.sql},
        :answers, :result, :reviewerLevel, :reviewerJustification, :reviewedBy, :source, :createdBy)
     RETURNING ${RUN_COLUMNS}`,
    {
      replacements: {
        organizationId,
        useCaseId: run.useCaseId,
        intakeSubmissionId: run.intakeSubmissionId,
        questionnaireVersion: run.questionnaireVersion,
        role: legacyHighRiskRole(run.roles),
        ...roles.replacements,
        answers: JSON.stringify(run.answers),
        result: JSON.stringify(run.result),
        reviewerLevel: run.reviewerLevel,
        reviewerJustification: run.reviewerJustification,
        reviewedBy: run.reviewedBy,
        source: run.source,
        createdBy: run.createdBy,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as ClassificationRun[];
  return rows[0];
};

const latestRun = async (
  ownerColumn: "use_case_id" | "intake_submission_id",
  ownerId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<ClassificationRun | null> => {
  const rows = (await sequelize.query(
    `SELECT ${RUN_COLUMNS} FROM eu_ai_act_classifications
     WHERE organization_id = :organizationId AND ${ownerColumn} = :ownerId
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    { replacements: { organizationId, ownerId }, type: QueryTypes.SELECT, transaction },
  )) as ClassificationRun[];
  return rows[0] ?? null;
};

export const getLatestRunForUseCaseQuery = (
  useCaseId: number,
  organizationId: number,
  transaction?: Transaction,
) => latestRun("use_case_id", useCaseId, organizationId, transaction);

export const getLatestRunForSubmissionQuery = (
  submissionId: number,
  organizationId: number,
  transaction?: Transaction,
) => latestRun("intake_submission_id", submissionId, organizationId, transaction);

/**
 * Set a use case's level, and its roles when the questionnaire named any,
 * without going through the general project update, which also rewrites
 * members and fires the project-updated automation. An empty role list leaves
 * the stored roles unchanged (an Out of scope result names no role).
 */
export const setUseCaseClassificationQuery = async (
  useCaseId: number,
  level: string,
  roles: readonly string[],
  userId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<boolean> => {
  const roleList = normalizeHighRiskRoles(roles);
  const rolesWrite = highRiskRolesArraySql(roleList, "roles");
  const rolesClause = roleList.length > 0 ? `high_risk_roles = ${rolesWrite.sql},` : "";
  const [rows] = (await sequelize.query(
    `UPDATE projects SET ai_risk_classification = :level, ${rolesClause}
       last_updated = NOW(), last_updated_by = :userId
     WHERE organization_id = :organizationId AND id = :useCaseId
     RETURNING id`,
    {
      replacements: { level, userId, organizationId, useCaseId, ...rolesWrite.replacements },
      transaction,
    },
  )) as [Array<{ id: number }>, number];
  return rows.length > 0;
};
