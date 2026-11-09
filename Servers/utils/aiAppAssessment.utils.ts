import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import { notifyAiAppAssessmentsAssigned } from "../services/inAppNotification.service";
import { updateAiAppByIdQuery } from "./aiApp.utils";
import { createStyledWorkbook, workbookToBuffer } from "./aiAppImport.utils";
import logger from "./logger/fileLogger";
import {
  AiAppQuestion,
  AssessmentActor,
  BulkRowError,
  calculateAssessmentScore,
  canActOnApp,
  canAnswerAssessment,
  evaluateAnswers,
  evaluateWorksheetRows,
  groupOwnerSummaries,
  positiveId,
  questionKey,
  QuestionnaireInput,
  WORKSHEET_FIXED_COLUMNS,
  WorksheetAssessment,
} from "./validations/aiAppBulkValidation.utils";

const WORKSHEET_MAX_ROWS = 1000;
const ANSWER_CHOICES = '"1,2,3,4,5"';

/** Unique index on (organization_id, LOWER(name)). */
export const QUESTIONNAIRE_NAME_INDEX = "uq_ai_app_questionnaires_org_name";

const DEFAULT_QUESTIONNAIRE = {
  name: "AI app risk assessment",
  description: "The six criteria of the manual risk assessment.",
  questions: [
    ["Data sensitivity", "Sensitivity of data the app can access or process"],
    ["User exposure", "Number of employees, departments or external users with access"],
    ["Business criticality", "Impact on operations if the app becomes unavailable or wrong"],
    ["Vendor maturity", "Vendor security posture, review status and track record"],
    ["Regulatory scope", "Applicable regulations such as GDPR, HIPAA or sector rules"],
    ["Output impact", "Consequences of incorrect or biased outputs on customers or IP"],
  ].map(([label, description]): AiAppQuestion => {
    return { key: questionKey(label), label, description, weight: 1 };
  }),
};

// ─── Questionnaires ────────────────────────────────────────────────────────

/** Safe to repeat and to race: every unique conflict is ignored. */
async function ensureDefaultQuestionnaire(organizationId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO ai_app_questionnaires (organization_id, name, description, questions, is_default)
     SELECT :orgId, :name, :description, CAST(:questions AS JSONB), TRUE
     WHERE NOT EXISTS (
       SELECT 1 FROM ai_app_questionnaires WHERE organization_id = :orgId AND is_default
     )
     ON CONFLICT DO NOTHING`,
    {
      replacements: {
        orgId: organizationId,
        name: DEFAULT_QUESTIONNAIRE.name,
        description: DEFAULT_QUESTIONNAIRE.description,
        questions: JSON.stringify(DEFAULT_QUESTIONNAIRE.questions),
      },
    },
  );
}

export async function listQuestionnairesQuery(organizationId: number): Promise<unknown[]> {
  await ensureDefaultQuestionnaire(organizationId);
  const [rows] = await sequelize.query(
    `SELECT * FROM ai_app_questionnaires
     WHERE organization_id = :orgId
     ORDER BY is_default DESC, LOWER(name)`,
    { replacements: { orgId: organizationId } },
  );
  return rows;
}

export async function createQuestionnaireQuery(
  input: QuestionnaireInput,
  organizationId: number,
  userId: number,
): Promise<unknown> {
  // The default goes first so a custom questionnaire can't take its name.
  await ensureDefaultQuestionnaire(organizationId);
  const [rows] = await sequelize.query(
    `INSERT INTO ai_app_questionnaires (organization_id, name, description, questions, created_by)
     VALUES (:orgId, :name, :description, CAST(:questions AS JSONB), :userId)
     RETURNING *`,
    {
      replacements: {
        orgId: organizationId,
        name: input.name!,
        description: input.description ?? null,
        questions: JSON.stringify(input.questions),
        userId,
      },
    },
  );
  return (rows as unknown[])[0];
}

export async function updateQuestionnaireQuery(
  id: number,
  input: QuestionnaireInput,
  organizationId: number,
): Promise<unknown | null> {
  const setClauses = ["updated_at = NOW()"];
  const replacements: Record<string, unknown> = { id, orgId: organizationId };
  if (input.name !== undefined) {
    setClauses.push("name = :name");
    replacements.name = input.name;
  }
  if (input.description !== undefined) {
    setClauses.push("description = :description");
    replacements.description = input.description;
  }
  if (input.questions !== undefined) {
    setClauses.push("questions = CAST(:questions AS JSONB)");
    replacements.questions = JSON.stringify(input.questions);
  }
  const [rows] = await sequelize.query(
    `UPDATE ai_app_questionnaires SET ${setClauses.join(", ")}
     WHERE id = :id AND organization_id = :orgId
     RETURNING *`,
    { replacements },
  );
  return (rows as unknown[])[0] ?? null;
}

/**
 * The row lock and bulkAssessQuery's FOR SHARE exclude each other, so a run
 * can't open an assessment against a questionnaire this is deleting.
 */
export async function deleteQuestionnaireQuery(
  id: number,
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  const [rows] = await sequelize.query(
    `SELECT is_default FROM ai_app_questionnaires
     WHERE id = :id AND organization_id = :orgId
     FOR UPDATE`,
    { replacements: { id, orgId: organizationId }, transaction },
  );
  const questionnaire = (rows as { is_default: boolean }[])[0];
  if (!questionnaire) {
    throw new NotFoundException("Questionnaire not found", "AiAppQuestionnaire", id);
  }
  if (questionnaire.is_default) {
    throw new ConflictException("The default questionnaire cannot be deleted");
  }

  const [open] = await sequelize.query(
    `SELECT 1 FROM ai_app_assessments
     WHERE organization_id = :orgId AND questionnaire_id = :id AND status = 'pending'
     LIMIT 1`,
    { replacements: { id, orgId: organizationId }, transaction },
  );
  if ((open as unknown[]).length > 0) {
    throw new ConflictException("This questionnaire has pending assessments");
  }

  await sequelize.query(
    `DELETE FROM ai_app_questionnaires WHERE id = :id AND organization_id = :orgId`,
    { replacements: { id, orgId: organizationId }, transaction },
  );
}

async function requireQuestionnaire(
  id: number,
  organizationId: number,
  transaction?: Transaction,
  lock: "" | "FOR SHARE" = "",
): Promise<{ id: number; name: string; questions: AiAppQuestion[] }> {
  const [rows] = await sequelize.query(
    `SELECT id, name, questions FROM ai_app_questionnaires
     WHERE id = :id AND organization_id = :orgId ${lock}`,
    { replacements: { id, orgId: organizationId }, transaction },
  );
  const questionnaire = (rows as { id: number; name: string; questions: AiAppQuestion[] }[])[0];
  if (!questionnaire) {
    throw new NotFoundException("Questionnaire not found", "AiAppQuestionnaire", id);
  }
  return questionnaire;
}

// ─── Bulk assess ───────────────────────────────────────────────────────────

export interface BulkAssessOutcome {
  created: number;
  already_open: number;
  not_found: number;
  unassigned: number;
  /** Owner of each assessment this run created; null for an unowned app. */
  createdOwnerIds: (number | null)[];
}

export async function bulkAssessQuery(
  appIds: number[],
  questionnaireId: number,
  organizationId: number,
  userId: number,
  transaction: Transaction,
): Promise<BulkAssessOutcome> {
  await requireQuestionnaire(questionnaireId, organizationId, transaction, "FOR SHARE");

  // One statement: ids from another org are never selected, so they count as
  // not found, and only rows this INSERT returned count as created.
  const [rows] = await sequelize.query(
    `WITH owned AS (
       SELECT id, owner_id FROM ai_apps
       WHERE organization_id = :orgId AND id IN (:appIds)
     ),
     inserted AS (
       INSERT INTO ai_app_assessments
         (organization_id, ai_app_id, questionnaire_id, status, requested_by)
       SELECT :orgId, id, :questionnaireId, 'pending', :userId FROM owned
       ON CONFLICT (ai_app_id, questionnaire_id) WHERE status = 'pending' DO NOTHING
       RETURNING ai_app_id
     )
     SELECT
       (SELECT COUNT(*)::int FROM owned) AS owned_count,
       COALESCE(
         (SELECT json_agg(o.owner_id) FROM inserted i JOIN owned o ON o.id = i.ai_app_id),
         CAST('[]' AS json)
       ) AS created_owner_ids`,
    { replacements: { orgId: organizationId, appIds, questionnaireId, userId }, transaction },
  );

  const { owned_count: ownedCount, created_owner_ids: createdOwnerIds } = (
    rows as { owned_count: number; created_owner_ids: (number | null)[] }[]
  )[0];

  return {
    created: createdOwnerIds.length,
    already_open: ownedCount - createdOwnerIds.length,
    not_found: appIds.length - ownedCount,
    unassigned: groupOwnerSummaries(createdOwnerIds, userId).unassigned,
    createdOwnerIds,
  };
}

/**
 * Sends each owner one summary of what a run created. Runs after the commit
 * and never throws: a delivery failure is logged and just isn't counted.
 */
export async function notifyAssessmentOwners(
  createdOwnerIds: (number | null)[],
  organizationId: number,
  requesterId: number,
): Promise<number> {
  const { summaries } = groupOwnerSummaries(createdOwnerIds, requesterId);
  if (summaries.length === 0) return 0;

  let dispatched = 0;
  try {
    // Only current members: an owner_id can outlive its membership.
    const [recipients] = await sequelize.query(
      `SELECT u.id, u.name, u.email FROM users u
       JOIN organization_members om ON om.user_id = u.id AND om.organization_id = :orgId
       WHERE u.id IN (:ids)`,
      {
        replacements: {
          orgId: organizationId,
          ids: [...summaries.map((s) => s.ownerId), requesterId],
        },
      },
    );
    const byId = new Map(
      (recipients as { id: number; name: string; email: string }[]).map((u) => [u.id, u]),
    );
    const requesterName = byId.get(requesterId)?.name ?? "A colleague";

    for (const { ownerId, count } of summaries) {
      const owner = byId.get(ownerId);
      if (!owner) continue;
      try {
        await notifyAiAppAssessmentsAssigned(organizationId, owner, count, requesterName);
        dispatched += 1;
      } catch (error) {
        logger.error(
          `Failed to notify owner ${ownerId} about AI app assessments: ${(error as Error).message}`,
        );
      }
    }
  } catch (error) {
    logger.error(`Failed to notify AI app owners: ${(error as Error).message}`);
  }
  return dispatched;
}

// ─── Assessment reads ──────────────────────────────────────────────────────

/** Every join stays inside the org; names come only from current members. */
const ASSESSMENT_COLUMNS = `
  a.id, a.ai_app_id, app.name AS ai_app_name, a.questionnaire_id,
  COALESCE(a.questionnaire_name, q.name) AS questionnaire_name,
  a.status, a.questions, a.answers, a.risk_score, a.requested_by, a.assessed_by,
  a.assessed_at, a.created_at, a.updated_at, app.owner_id,
  NULLIF(TRIM(CONCAT(owner_user.name, ' ', owner_user.surname)), '') AS owner_name,
  NULLIF(TRIM(CONCAT(assessor.name, ' ', assessor.surname)), '') AS assessed_by_name`;

const ASSESSMENT_JOINS = `
  JOIN ai_apps app ON app.id = a.ai_app_id AND app.organization_id = a.organization_id
  LEFT JOIN ai_app_questionnaires q
    ON q.id = a.questionnaire_id AND q.organization_id = a.organization_id
  LEFT JOIN organization_members owner_member
    ON owner_member.user_id = app.owner_id AND owner_member.organization_id = a.organization_id
  LEFT JOIN users owner_user ON owner_user.id = owner_member.user_id
  LEFT JOIN organization_members assessor_member
    ON assessor_member.user_id = a.assessed_by
    AND assessor_member.organization_id = a.organization_id
  LEFT JOIN users assessor ON assessor.id = assessor_member.user_id`;

type AssessmentRow = Record<string, unknown> & { status: string; owner_id: number | null };

function withCanAnswer(rows: AssessmentRow[], actor: AssessmentActor) {
  return rows.map((row) => ({
    ...row,
    can_answer: canAnswerAssessment(row.status, row.owner_id, actor),
  }));
}

export interface AssessmentListFilters {
  status?: string;
  questionnaireId?: number;
  search?: string;
  assignedToMe?: boolean;
  page: number;
  limit: number;
}

export async function listAssessmentsQuery(
  filters: AssessmentListFilters,
  organizationId: number,
  actor: AssessmentActor,
): Promise<{ assessments: unknown[]; total: number }> {
  const conditions = ["a.organization_id = :orgId"];
  const replacements: Record<string, unknown> = {
    orgId: organizationId,
    limit: filters.limit,
    offset: (filters.page - 1) * filters.limit,
  };

  if (filters.status) {
    conditions.push("a.status = :status");
    replacements.status = filters.status;
  }
  if (filters.questionnaireId !== undefined) {
    conditions.push("a.questionnaire_id = :questionnaireId");
    replacements.questionnaireId = filters.questionnaireId;
  }
  if (filters.search) {
    conditions.push("app.name ILIKE :search ESCAPE '\\'");
    replacements.search = `%${filters.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }
  if (filters.assignedToMe) {
    conditions.push("app.owner_id = :userId");
    replacements.userId = actor.userId;
  }
  const where = `WHERE ${conditions.join(" AND ")}`;

  const [rows] = await sequelize.query(
    `SELECT ${ASSESSMENT_COLUMNS} FROM ai_app_assessments a ${ASSESSMENT_JOINS}
     ${where}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT :limit OFFSET :offset`,
    { replacements },
  );
  const [count] = await sequelize.query(
    `SELECT COUNT(*)::int AS total FROM ai_app_assessments a
     JOIN ai_apps app ON app.id = a.ai_app_id AND app.organization_id = a.organization_id
     ${where}`,
    { replacements },
  );

  return {
    assessments: withCanAnswer(rows as AssessmentRow[], actor),
    total: (count as { total: number }[])[0].total,
  };
}

/** One app's assessments, newest first; null when the app isn't in this org. */
export async function listAppAssessmentsQuery(
  aiAppId: number,
  organizationId: number,
  actor: AssessmentActor,
): Promise<unknown[] | null> {
  const [apps] = await sequelize.query(
    `SELECT 1 FROM ai_apps WHERE id = :aiAppId AND organization_id = :orgId`,
    { replacements: { aiAppId, orgId: organizationId } },
  );
  if ((apps as unknown[]).length === 0) return null;

  const [rows] = await sequelize.query(
    `SELECT ${ASSESSMENT_COLUMNS} FROM ai_app_assessments a ${ASSESSMENT_JOINS}
     WHERE a.organization_id = :orgId AND a.ai_app_id = :aiAppId
     ORDER BY a.created_at DESC, a.id DESC`,
    { replacements: { aiAppId, orgId: organizationId } },
  );
  return withCanAnswer(rows as AssessmentRow[], actor);
}

// ─── Completing assessments ────────────────────────────────────────────────

/**
 * Moves one assessment to completed and sets the app's score. The
 * `status = 'pending'` guard means a concurrent completion updates nothing and
 * reports false instead of scoring twice.
 */
async function completeAssessment(
  assessment: { id: number; aiAppId: number },
  questionnaire: { name: string; questions: AiAppQuestion[] },
  answers: Record<string, number>,
  score: number,
  organizationId: number,
  userId: number,
  transaction: Transaction,
): Promise<boolean> {
  const [updated] = await sequelize.query(
    `UPDATE ai_app_assessments
     SET status = 'completed', questionnaire_name = :questionnaireName,
         questions = CAST(:questions AS JSONB), answers = CAST(:answers AS JSONB),
         risk_score = :score, assessed_by = :userId, assessed_at = NOW(), updated_at = NOW()
     WHERE id = :id AND organization_id = :orgId AND status = 'pending'
     RETURNING id`,
    {
      replacements: {
        id: assessment.id,
        orgId: organizationId,
        questionnaireName: questionnaire.name,
        questions: JSON.stringify(questionnaire.questions),
        answers: JSON.stringify(answers),
        score,
        userId,
      },
      transaction,
    },
  );
  if ((updated as unknown[]).length === 0) return false;

  await updateAiAppByIdQuery(
    assessment.aiAppId,
    { risk_score: score },
    organizationId,
    transaction,
    userId,
  );
  return true;
}

/** PUT /assessments/:assessmentId/answers. */
export async function answerAssessmentQuery(
  assessmentId: number,
  rawAnswers: unknown,
  organizationId: number,
  actor: AssessmentActor,
  transaction: Transaction,
): Promise<unknown> {
  const [rows] = await sequelize.query(
    `SELECT a.id, a.ai_app_id, a.status, app.owner_id, q.name AS q_name, q.questions AS q_questions
     FROM ai_app_assessments a
     JOIN ai_apps app ON app.id = a.ai_app_id AND app.organization_id = a.organization_id
     LEFT JOIN ai_app_questionnaires q
       ON q.id = a.questionnaire_id AND q.organization_id = a.organization_id
     WHERE a.id = :id AND a.organization_id = :orgId
     FOR UPDATE OF a`,
    { replacements: { id: assessmentId, orgId: organizationId }, transaction },
  );
  const assessment = (
    rows as {
      id: number;
      ai_app_id: number;
      status: string;
      owner_id: number | null;
      q_name: string | null;
      q_questions: AiAppQuestion[] | null;
    }[]
  )[0];

  if (!assessment) {
    throw new NotFoundException("Assessment not found", "AiAppAssessment", assessmentId);
  }
  if (!canActOnApp(assessment.owner_id, actor)) {
    throw new ForbiddenException("Only the app's owner or an editor can answer this assessment");
  }
  if (assessment.status === "completed") {
    throw new ConflictException("This assessment is already completed");
  }
  if (!assessment.q_questions || assessment.q_name === null) {
    throw new ConflictException("This assessment's questionnaire no longer exists");
  }

  const questions = assessment.q_questions;
  const evaluation = evaluateAnswers(questions, rawAnswers);
  if (evaluation.kind !== "answered") {
    throw new ValidationException(
      "Answer every question with a whole number from 1 to 5",
      "answers",
      rawAnswers,
    );
  }

  const score = calculateAssessmentScore(questions, evaluation.answers);
  const completed = await completeAssessment(
    { id: assessment.id, aiAppId: assessment.ai_app_id },
    { name: assessment.q_name, questions },
    evaluation.answers,
    score,
    organizationId,
    actor.userId,
    transaction,
  );
  if (!completed) throw new ConflictException("This assessment is already completed");

  const [saved] = await sequelize.query(
    `SELECT ${ASSESSMENT_COLUMNS} FROM ai_app_assessments a ${ASSESSMENT_JOINS}
     WHERE a.id = :id AND a.organization_id = :orgId`,
    { replacements: { id: assessmentId, orgId: organizationId }, transaction },
  );
  return withCanAnswer(saved as AssessmentRow[], actor)[0];
}

export interface WorksheetAnswersResult {
  completed: number;
  left_blank: number;
  already_completed: number;
  errors: BulkRowError[];
}

/**
 * POST /assessments/answers. Returns with `errors` set and nothing applied when
 * any row is invalid. Rows are locked in id order and apps updated in id order
 * so two uploads can't deadlock or both complete the same assessment. Without
 * aiApp.edit the lookup is limited to the caller's apps, so another owner's
 * row is reported exactly like an unknown assessment.
 */
export async function submitWorksheetAnswersQuery(
  questionnaireId: number,
  rows: unknown[],
  organizationId: number,
  actor: AssessmentActor,
  transaction: Transaction,
): Promise<WorksheetAnswersResult> {
  const questionnaire = await requireQuestionnaire(
    questionnaireId,
    organizationId,
    transaction,
    "FOR SHARE",
  );

  // Only the file's own rows are locked, so answers elsewhere don't wait on it.
  const submittedIds = rows
    .map((row) => positiveId((row as { assessment_id?: unknown } | null)?.assessment_id))
    .filter((id): id is number => id !== null);
  const ownerFilter = actor.canEditAny ? "" : "AND app.owner_id = :userId";
  const [found] =
    submittedIds.length === 0
      ? [[]]
      : await sequelize.query(
          `SELECT a.id, a.ai_app_id, a.status
           FROM ai_app_assessments a
           JOIN ai_apps app ON app.id = a.ai_app_id AND app.organization_id = a.organization_id
           WHERE a.organization_id = :orgId AND a.questionnaire_id = :questionnaireId
             AND a.id IN (:submittedIds) ${ownerFilter}
           ORDER BY a.id
           FOR UPDATE OF a`,
          {
            replacements: {
              orgId: organizationId,
              questionnaireId,
              submittedIds,
              userId: actor.userId,
            },
            transaction,
          },
        );
  const assessments = new Map(
    (found as WorksheetAssessment[]).map((assessment) => [assessment.id, assessment]),
  );

  const evaluation = evaluateWorksheetRows(rows, questionnaire.questions, assessments);
  const result: WorksheetAnswersResult = {
    completed: 0,
    left_blank: evaluation.leftBlank,
    already_completed: evaluation.alreadyCompleted,
    errors: evaluation.errors,
  };
  if (evaluation.errors.length > 0) return result;

  const ordered = [...evaluation.completions].sort((a, b) => a.aiAppId - b.aiAppId);
  for (const completion of ordered) {
    const completed = await completeAssessment(
      { id: completion.assessmentId, aiAppId: completion.aiAppId },
      questionnaire,
      completion.answers,
      completion.score,
      organizationId,
      actor.userId,
      transaction,
    );
    if (completed) result.completed += 1;
    else result.already_completed += 1;
  }
  return result;
}

export async function cancelAssessmentsQuery(
  assessmentIds: number[],
  organizationId: number,
): Promise<number> {
  const [rows] = await sequelize.query(
    `DELETE FROM ai_app_assessments
     WHERE organization_id = :orgId AND status = 'pending' AND id IN (:assessmentIds)
     RETURNING id`,
    { replacements: { orgId: organizationId, assessmentIds } },
  );
  return (rows as unknown[]).length;
}

// ─── Worksheet download ────────────────────────────────────────────────────

/** The pending assessments for one questionnaire, at most what an upload accepts. */
export async function buildAssessmentWorksheet(
  questionnaireId: number,
  organizationId: number,
  actor: AssessmentActor,
  assignedToMe: boolean,
): Promise<{ buffer: Buffer; filename: string }> {
  const questionnaire = await requireQuestionnaire(questionnaireId, organizationId);

  const ownerFilter = actor.canEditAny && !assignedToMe ? "" : "AND app.owner_id = :userId";
  const [rows] = await sequelize.query(
    `SELECT a.id, app.name AS app_name, v.vendor_name
     FROM ai_app_assessments a
     JOIN ai_apps app ON app.id = a.ai_app_id AND app.organization_id = a.organization_id
     LEFT JOIN vendors v ON v.id = app.vendor_id AND v.organization_id = a.organization_id
     WHERE a.organization_id = :orgId AND a.questionnaire_id = :questionnaireId
       AND a.status = 'pending' ${ownerFilter}
     ORDER BY LOWER(app.name), a.id
     LIMIT :limit`,
    {
      replacements: {
        orgId: organizationId,
        questionnaireId,
        userId: actor.userId,
        limit: WORKSHEET_MAX_ROWS,
      },
    },
  );

  const [idColumn, appColumn, vendorColumn] = WORKSHEET_FIXED_COLUMNS;
  const { workbook, worksheet } = createStyledWorkbook("Assessments", [
    { header: idColumn, key: "assessment_id", width: 16 },
    { header: appColumn, key: "app", width: 32 },
    { header: vendorColumn, key: "vendor", width: 24 },
    ...questionnaire.questions.map((question) => ({
      header: question.label,
      key: question.key,
      width: 22,
    })),
  ]);

  const firstAnswerColumn = WORKSHEET_FIXED_COLUMNS.length + 1;
  (rows as { id: number; app_name: string; vendor_name: string | null }[]).forEach((row, index) => {
    worksheet.addRow({ assessment_id: row.id, app: row.app_name, vendor: row.vendor_name ?? "" });
    questionnaire.questions.forEach((_question, questionIndex) => {
      worksheet.getCell(index + 2, firstAnswerColumn + questionIndex).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [ANSWER_CHOICES],
        showErrorMessage: true,
        errorStyle: "error",
        errorTitle: "Invalid answer",
        error: "Please choose a number from 1 to 5",
      };
    });
  });

  return {
    buffer: await workbookToBuffer(workbook),
    filename: `ai_app_assessments_${questionnaireId}.xlsx`,
  };
}
