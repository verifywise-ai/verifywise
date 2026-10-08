import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { translateError } from "../utils/i18n.utils";
import { getProjectByIdQuery } from "../utils/project.utils";
import { recordMultipleFieldChanges } from "../utils/useCaseChangeHistory.utils";
import {
  aiRiskClassificationIneligibility,
  extractFrameworkIds,
} from "../utils/validations/projectValidation.utils";
import {
  getLatestRunForUseCaseQuery,
  insertClassificationRunQuery,
  setUseCaseClassificationQuery,
} from "../utils/euAiActClassification.utils";
import {
  CURRENT_QUESTIONNAIRE_VERSION,
  getQuestionnaire as getQuestionnaireDefinition,
  scoreClassification,
  validateAnswers,
} from "../services/euAiActClassification";

const parseId = (value: unknown) => parseInt(Array.isArray(value) ? value[0] : String(value), 10);

/**
 * Uses the project validation rule for ai_risk_classification: organizational
 * projects never carry one, and it only applies when the EU AI Act framework
 * is selected.
 */
const classificationIneligibility = (project: any): { message: string; code: string } | null => {
  const code = aiRiskClassificationIneligibility(
    project.is_organizational,
    extractFrameworkIds(project.dataValues?.framework ?? project.framework ?? []),
  );
  if (code === "ORGANIZATIONAL_PROJECT_AI_RISK_NOT_NULL") {
    return {
      message: "The EU AI Act risk classification does not apply to organizational projects",
      code,
    };
  }
  if (code === "AI_RISK_WITHOUT_EU_AI_ACT") {
    return {
      message:
        "The EU AI Act risk classification requires the EU AI Act framework on this use case",
      code,
    };
  }
  return null;
};

const validate = (raw: unknown) =>
  validateAnswers(getQuestionnaireDefinition(CURRENT_QUESTIONNAIRE_VERSION)!, raw);

export async function getQuestionnaire(_req: Request, res: Response) {
  return res
    .status(200)
    .json(STATUS_CODE[200](getQuestionnaireDefinition(CURRENT_QUESTIONNAIRE_VERSION)));
}

export async function scoreAnswers(req: Request, res: Response) {
  const { errors, answers } = validate(req.body?.answers);
  if (errors.length > 0) {
    return res.status(400).json(
      STATUS_CODE[400]({
        message: req.t!("The EU AI Act risk classification answers are invalid"),
        errors,
      }),
    );
  }
  return res
    .status(200)
    .json(STATUS_CODE[200](scoreClassification(CURRENT_QUESTIONNAIRE_VERSION, answers)));
}

export async function getUseCaseClassification(req: Request, res: Response) {
  const useCaseId = parseId(req.params.id);
  try {
    const project = await getProjectByIdQuery(useCaseId, req.organizationId!);
    if (!project) return res.status(404).json(STATUS_CODE[404]({}));
    const run = await getLatestRunForUseCaseQuery(useCaseId, req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](run));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function classifyUseCase(req: Request, res: Response) {
  const useCaseId = parseId(req.params.id);
  logProcessing({
    description: `classifying use case ${useCaseId} with the EU AI Act questionnaire`,
    functionName: "classifyUseCase",
    fileName: "euAiActClassification.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const { errors, answers } = validate(req.body?.answers);
  if (errors.length > 0) {
    return res.status(400).json(
      STATUS_CODE[400]({
        message: req.t!("The EU AI Act risk classification answers are invalid"),
        errors,
      }),
    );
  }

  const transaction = await sequelize.transaction();
  try {
    const project = await getProjectByIdQuery(useCaseId, req.organizationId!);
    if (!project) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    const ineligible = classificationIneligibility(project);
    if (ineligible) {
      await transaction.rollback();
      return res
        .status(400)
        .json(STATUS_CODE[400]({ message: req.t!(ineligible.message), code: ineligible.code }));
    }

    const result = scoreClassification(CURRENT_QUESTIONNAIRE_VERSION, answers);
    const run = await insertClassificationRunQuery(
      {
        useCaseId,
        intakeSubmissionId: null,
        questionnaireVersion: CURRENT_QUESTIONNAIRE_VERSION,
        role: result.role,
        answers,
        result,
        reviewerLevel: null,
        reviewerJustification: null,
        reviewedBy: null,
        source: "wizard",
        createdBy: req.userId!,
      },
      req.organizationId!,
      transaction,
    );

    const updated = await setUseCaseClassificationQuery(
      useCaseId,
      result.level,
      result.role,
      req.userId!,
      req.organizationId!,
      transaction,
    );
    if (!updated) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    const changes: Array<{ fieldName: string; oldValue: string; newValue: string }> = [];
    if ((project.ai_risk_classification ?? "-") !== result.level) {
      changes.push({
        fieldName: "AI risk classification",
        oldValue: String(project.ai_risk_classification ?? "-"),
        newValue: result.level,
      });
    }
    if (result.role && (project.type_of_high_risk_role ?? "-") !== result.role) {
      changes.push({
        fieldName: "Type of high-risk role",
        oldValue: String(project.type_of_high_risk_role ?? "-"),
        newValue: result.role,
      });
    }
    if (changes.length > 0) {
      await recordMultipleFieldChanges(
        useCaseId,
        req.userId!,
        req.organizationId!,
        changes,
        transaction,
      );
    }

    await transaction.commit();
    await logSuccess({
      eventType: "Update",
      description: `use case ${useCaseId} classified as ${result.level}`,
      functionName: "classifyUseCase",
      fileName: "euAiActClassification.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ run, result }));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `failed to classify use case ${useCaseId}`,
      functionName: "classifyUseCase",
      fileName: "euAiActClassification.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
