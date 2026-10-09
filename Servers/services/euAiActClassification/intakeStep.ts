// Servers/services/euAiActClassification/intakeStep.ts
import { CURRENT_QUESTIONNAIRE_VERSION, getQuestionnaire, scoreClassification } from "./registry";
import { validateAnswers } from "./validate";
import { Answers, ClassificationResult } from "./types";

export interface PreparedRun {
  questionnaireVersion: number;
  answers: Answers;
  result: ClassificationResult;
}

export type IntakeStepOutcome =
  { ok: true; prepared: PreparedRun | null } | { ok: false; message: string; errors: string[] };

/**
 * Validate and score a public submission's risk step. Returns null when the
 * form has no step. Anything the client sends besides answers is ignored or
 * rejected; the level always comes from the server.
 */
export const prepareIntakeRiskStep = (
  enabled: boolean,
  rawAnswers: unknown,
  now: Date = new Date(),
): IntakeStepOutcome => {
  if (!enabled) return { ok: true, prepared: null };
  if (rawAnswers === undefined || rawAnswers === null) {
    return { ok: false, message: "Complete the EU AI Act risk classification step", errors: [] };
  }
  const version = CURRENT_QUESTIONNAIRE_VERSION;
  const { errors, answers } = validateAnswers(getQuestionnaire(version)!, rawAnswers);
  if (errors.length > 0) {
    return { ok: false, message: "The EU AI Act risk classification answers are invalid", errors };
  }
  return {
    ok: true,
    prepared: {
      questionnaireVersion: version,
      answers,
      result: scoreClassification(version, answers, now),
    },
  };
};
