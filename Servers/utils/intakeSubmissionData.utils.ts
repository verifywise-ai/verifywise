// Reading a stored intake submission: its mapped entity data and its stored
// EU AI Act run, re-scored. Shared by the intake controller and the
// background assessment job.
import { IIntakeFormSchema } from "../domain.layer/interfaces/i.intakeForm";
import {
  getQuestionnaire,
  scoreClassification,
  validateAnswers,
  type Answers,
  type ClassificationResult,
  type Questionnaire,
} from "../services/euAiActClassification";
import { HIGH_RISK_ROLE_MAPPING, resolveMappedHighRiskRoles } from "./highRiskRoles.utils";
import logger from "./logger/fileLogger";

/**
 * Scores a stored classification run again under its own questionnaire version.
 * Returns null when the version is unknown to this server or the stored answers
 * no longer validate against it (e.g. an option was removed), so callers treat
 * it as no run. The run is handed back with its questionnaire and result so a
 * caller branches on this one value; its answers are the validated ones, so
 * answers to questions now hidden are neither scored nor copied.
 */
export function rescoreStoredRun<
  R extends { id?: number; questionnaireVersion: number; answers: Answers },
>(run: R): { run: R; questionnaire: Questionnaire; result: ClassificationResult } | null {
  const questionnaire = getQuestionnaire(run.questionnaireVersion);
  if (!questionnaire) return null;
  const { errors, answers } = validateAnswers(questionnaire, run.answers);
  if (errors.length > 0) {
    logger.warn(
      `EU AI Act classification run ${run.id} no longer validates; treating it as no run: ${errors.join("; ")}`,
    );
    return null;
  }
  try {
    return {
      run: { ...run, answers },
      questionnaire,
      result: scoreClassification(run.questionnaireVersion, answers),
    };
  } catch (error) {
    logger.warn(
      `EU AI Act classification run ${run.id} could not be re-scored; treating it as no run: ${(error as Error).message}`,
    );
    return null;
  }
}

/**
 * Build entity data from submission using entityFieldMapping from schema fields.
 * This replaces the old mapSubmissionToProject / mapSubmissionToModelInventory
 * which used hardcoded keys like `data["project.project_title"]`.
 */
export function buildEntityDataFromSubmission(
  submissionData: Record<string, unknown>,
  formSchema: IIntakeFormSchema,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of formSchema.fields) {
    if (!field.entityFieldMapping || submissionData[field.id] === undefined) continue;
    if (field.entityFieldMapping === HIGH_RISK_ROLE_MAPPING) {
      // A select stores option values; match each option by label or value.
      // Options that name no role are kept by label for the review dialog.
      const { roles, unmatched } = resolveMappedHighRiskRoles(
        submissionData[field.id],
        field.options,
      );
      result.high_risk_roles = roles;
      result.high_risk_roles_unmatched = unmatched;
      continue;
    }
    result[field.entityFieldMapping] = submissionData[field.id];
  }
  return result;
}
