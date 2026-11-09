import { Request, Response } from "express";
import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { CustomException } from "../domain.layer/exceptions/custom.exception";
import { AI_APP_NAME_CONSTRAINT } from "../utils/aiApp.utils";
import {
  answerAssessmentQuery,
  buildAssessmentWorksheet,
  bulkAssessQuery,
  cancelAssessmentsQuery,
  createQuestionnaireQuery,
  deleteQuestionnaireQuery,
  listAppAssessmentsQuery,
  listAssessmentsQuery,
  listQuestionnairesQuery,
  notifyAssessmentOwners,
  QUESTIONNAIRE_NAME_INDEX,
  submitWorksheetAnswersQuery,
  updateQuestionnaireQuery,
} from "../utils/aiAppAssessment.utils";
import {
  buildAiAppImportTemplate,
  commitAiAppImport,
  previewAiAppImport,
} from "../utils/aiAppImport.utils";
import { translateError } from "../utils/i18n.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { roleHasPermission } from "../utils/rolePermissions.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  AssessmentActor,
  MAX_BULK_ROWS,
  parseIdList,
  parseQuestionnaireBody,
  positiveId,
} from "../utils/validations/aiAppBulkValidation.utils";

const FILE_NAME = "aiAppBulk.ctrl.ts";
const DEFAULT_PAGE_SIZE = 20;
const SEARCH_MAX_LENGTH = 200;

type EventType = "Create" | "Read" | "Update" | "Delete";
const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function context(req: Request, functionName: string) {
  return {
    functionName,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  };
}

/** Runs a handler with the standard logging; exceptions become their status code. */
function handled(
  functionName: string,
  eventType: EventType,
  description: string,
  handler: (req: Request, res: Response) => Promise<unknown>,
) {
  return async (req: Request, res: Response): Promise<any> => {
    logProcessing({ ...context(req, functionName), description: `starting ${functionName}` });
    try {
      const result = await handler(req, res);
      // The event log records what happened: refused requests and previews changed nothing.
      if (res.statusCode < 400 && !res.locals.noChangeMade) {
        await logSuccess({ ...context(req, functionName), eventType, description });
      }
      return result;
    } catch (error) {
      const pg = (error as { parent?: { code?: string; constraint?: string } })?.parent;
      if (pg?.code === "23505" && pg.constraint === AI_APP_NAME_CONSTRAINT) {
        return res
          .status(409)
          .json(STATUS_CODE[409](req.t!("An AI app with this name already exists")));
      }
      if (pg?.code === "23505" && pg.constraint === QUESTIONNAIRE_NAME_INDEX) {
        return res
          .status(409)
          .json(STATUS_CODE[409](req.t!("A questionnaire with this name already exists")));
      }
      if (error instanceof CustomException && error.statusCode < 500) {
        return res
          .status(error.statusCode)
          .json({ message: translateError(req, error), data: null });
      }
      await logFailure({
        ...context(req, functionName),
        eventType,
        description: `Failed: ${description}`,
        error: error as Error,
      });
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
  };
}

async function inTransaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
  const transaction = await sequelize.transaction();
  try {
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function actorOf(req: Request): Promise<AssessmentActor> {
  return {
    userId: req.userId!,
    canEditAny: await roleHasPermission(req.organizationId!, req.role!, "aiApp.edit"),
  };
}

function isRowList(rows: unknown): rows is unknown[] {
  return Array.isArray(rows) && rows.length > 0 && rows.length <= MAX_BULK_ROWS;
}

function sendWorkbook(res: Response, file: { buffer: Buffer; filename: string }) {
  res.setHeader("Content-Type", XLSX_CONTENT_TYPE);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  return res.status(200).send(file.buffer);
}

// ─── Import ────────────────────────────────────────────────────────────────

export const downloadAiAppImportTemplate = handled(
  "downloadAiAppImportTemplate",
  "Read",
  "Downloaded the AI app import template",
  async (_req, res) => sendWorkbook(res, await buildAiAppImportTemplate()),
);

export const importAiApps = handled(
  "importAiApps",
  "Create",
  "Processed an AI app import",
  async (req, res) => {
    const { rows, dry_run: dryRun } = (req.body ?? {}) as { rows?: unknown; dry_run?: unknown };
    if (!isRowList(rows)) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("rows must be a list of 1 to 1000 rows")));
    }
    if (typeof dryRun !== "boolean") {
      return res.status(400).json(STATUS_CODE[400](req.t!("dry_run must be true or false")));
    }

    if (dryRun) {
      res.locals.noChangeMade = true;
      const preview = await previewAiAppImport(rows, req.organizationId!);
      return res.status(200).json(STATUS_CODE[200](preview));
    }

    const result = await inTransaction((transaction) =>
      commitAiAppImport(rows, req.organizationId!, req.userId!, transaction),
    );
    const status = result.errors.length > 0 ? 422 : 200;
    return res.status(status).json(STATUS_CODE[status](result));
  },
);

// ─── Questionnaires ────────────────────────────────────────────────────────

export const listAiAppQuestionnaires = handled(
  "listAiAppQuestionnaires",
  "Read",
  "Listed AI app questionnaires",
  async (req, res) => {
    const questionnaires = await listQuestionnairesQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200]({ questionnaires }));
  },
);

export const createAiAppQuestionnaire = handled(
  "createAiAppQuestionnaire",
  "Create",
  "Created an AI app questionnaire",
  async (req, res) => {
    const parsed = parseQuestionnaireBody(req.body, { partial: false });
    if (!parsed.ok) return res.status(400).json(STATUS_CODE[400](req.t!(parsed.message)));
    const questionnaire = await createQuestionnaireQuery(
      parsed.value,
      req.organizationId!,
      req.userId!,
    );
    return res.status(201).json(STATUS_CODE[201](questionnaire));
  },
);

export const updateAiAppQuestionnaire = handled(
  "updateAiAppQuestionnaire",
  "Update",
  "Updated an AI app questionnaire",
  async (req, res) => {
    const id = positiveId(req.params.id);
    if (id === null) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid questionnaire ID")));
    }
    const parsed = parseQuestionnaireBody(req.body, { partial: true });
    if (!parsed.ok) return res.status(400).json(STATUS_CODE[400](req.t!(parsed.message)));

    const questionnaire = await updateQuestionnaireQuery(id, parsed.value, req.organizationId!);
    if (!questionnaire) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Questionnaire not found")));
    }
    return res.status(200).json(STATUS_CODE[200](questionnaire));
  },
);

export const deleteAiAppQuestionnaire = handled(
  "deleteAiAppQuestionnaire",
  "Delete",
  "Deleted an AI app questionnaire",
  async (req, res) => {
    const id = positiveId(req.params.id);
    if (id === null) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid questionnaire ID")));
    }
    await inTransaction((transaction) =>
      deleteQuestionnaireQuery(id, req.organizationId!, transaction),
    );
    return res.status(200).json(STATUS_CODE[200]({ deleted: true }));
  },
);

// ─── Assessments ───────────────────────────────────────────────────────────

export const bulkAssessAiApps = handled(
  "bulkAssessAiApps",
  "Create",
  "Requested bulk AI app assessments",
  async (req, res) => {
    const body = (req.body ?? {}) as {
      app_ids?: unknown;
      questionnaire_id?: unknown;
      notify_owners?: unknown;
    };
    const appIds = parseIdList(body.app_ids);
    if (appIds === null) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("app_ids must be a list of 1 to 1000 valid IDs")));
    }
    const questionnaireId = positiveId(body.questionnaire_id);
    if (questionnaireId === null) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid questionnaire ID")));
    }
    if (body.notify_owners !== undefined && typeof body.notify_owners !== "boolean") {
      return res.status(400).json(STATUS_CODE[400](req.t!("notify_owners must be true or false")));
    }

    const outcome = await inTransaction((transaction) =>
      bulkAssessQuery(appIds, questionnaireId, req.organizationId!, req.userId!, transaction),
    );

    // After the commit: a delivery problem can't undo the assessments.
    const ownersNotified = body.notify_owners
      ? await notifyAssessmentOwners(outcome.createdOwnerIds, req.organizationId!, req.userId!)
      : 0;

    return res.status(200).json(
      STATUS_CODE[200]({
        created: outcome.created,
        already_open: outcome.already_open,
        not_found: outcome.not_found,
        unassigned: outcome.unassigned,
        owners_notified: ownersNotified,
      }),
    );
  },
);

export const listAiAppAssessments = handled(
  "listAiAppAssessments",
  "Read",
  "Listed AI app assessments",
  async (req, res) => {
    const { status, questionnaire_id: rawQuestionnaireId, search, page, limit } = req.query;

    if (status !== undefined && status !== "pending" && status !== "completed") {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid assessment status")));
    }
    let questionnaireId: number | undefined;
    if (rawQuestionnaireId !== undefined) {
      const parsed = positiveId(rawQuestionnaireId);
      if (parsed === null) {
        return res.status(400).json(STATUS_CODE[400](req.t!("Invalid questionnaire ID")));
      }
      questionnaireId = parsed;
    }

    const parsedLimit = positiveId(limit);
    const result = await listAssessmentsQuery(
      {
        status: status as string | undefined,
        questionnaireId,
        search: typeof search === "string" ? search.trim().slice(0, SEARCH_MAX_LENGTH) : undefined,
        assignedToMe: req.query.assigned_to_me === "true",
        page: positiveId(page) ?? 1,
        limit: parsedLimit === null ? DEFAULT_PAGE_SIZE : Math.min(parsedLimit, MAX_BULK_ROWS),
      },
      req.organizationId!,
      await actorOf(req),
    );
    return res.status(200).json(STATUS_CODE[200](result));
  },
);

export const listAiAppAssessmentsForApp = handled(
  "listAiAppAssessmentsForApp",
  "Read",
  "Listed one AI app's assessments",
  async (req, res) => {
    const aiAppId = positiveId(req.params.id);
    if (aiAppId === null) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid AI app ID")));
    }
    const assessments = await listAppAssessmentsQuery(
      aiAppId,
      req.organizationId!,
      await actorOf(req),
    );
    if (assessments === null) {
      return res.status(404).json(STATUS_CODE[404](req.t!("AI app not found")));
    }
    return res.status(200).json(STATUS_CODE[200]({ assessments }));
  },
);

export const answerAiAppAssessment = handled(
  "answerAiAppAssessment",
  "Update",
  "Answered an AI app assessment",
  async (req, res) => {
    const assessmentId = positiveId(req.params.assessmentId);
    if (assessmentId === null) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid assessment ID")));
    }
    const actor = await actorOf(req);
    const assessment = await inTransaction((transaction) =>
      answerAssessmentQuery(
        assessmentId,
        (req.body ?? {}).answers,
        req.organizationId!,
        actor,
        transaction,
      ),
    );
    return res.status(200).json(STATUS_CODE[200](assessment));
  },
);

export const cancelAiAppAssessments = handled(
  "cancelAiAppAssessments",
  "Delete",
  "Cancelled AI app assessments",
  async (req, res) => {
    const assessmentIds = parseIdList((req.body ?? {}).assessment_ids);
    if (assessmentIds === null) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("assessment_ids must be a list of 1 to 1000 valid IDs")));
    }
    const cancelled = await cancelAssessmentsQuery(assessmentIds, req.organizationId!);
    return res.status(200).json(STATUS_CODE[200]({ cancelled }));
  },
);

export const downloadAiAppAssessmentWorksheet = handled(
  "downloadAiAppAssessmentWorksheet",
  "Read",
  "Downloaded an AI app assessment worksheet",
  async (req, res) => {
    const questionnaireId = positiveId(req.query.questionnaire_id);
    if (questionnaireId === null) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid questionnaire ID")));
    }
    const file = await buildAssessmentWorksheet(
      questionnaireId,
      req.organizationId!,
      await actorOf(req),
      req.query.assigned_to_me === "true",
    );
    return sendWorkbook(res, file);
  },
);

export const submitAiAppAssessmentAnswers = handled(
  "submitAiAppAssessmentAnswers",
  "Update",
  "Submitted AI app assessment worksheet answers",
  async (req, res) => {
    const { questionnaire_id: rawQuestionnaireId, rows } = (req.body ?? {}) as {
      questionnaire_id?: unknown;
      rows?: unknown;
    };
    const questionnaireId = positiveId(rawQuestionnaireId);
    if (questionnaireId === null) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid questionnaire ID")));
    }
    if (!isRowList(rows)) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("rows must be a list of 1 to 1000 rows")));
    }

    const actor = await actorOf(req);
    const result = await inTransaction((transaction) =>
      submitWorksheetAnswersQuery(questionnaireId, rows, req.organizationId!, actor, transaction),
    );
    const status = result.errors.length > 0 ? 422 : 200;
    return res.status(status).json(STATUS_CODE[status](result));
  },
);
