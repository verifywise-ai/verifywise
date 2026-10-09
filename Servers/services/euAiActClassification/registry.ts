// Servers/services/euAiActClassification/registry.ts
import { QUESTIONNAIRE_V2 } from "./questionnaire.v2";
import { scoreV2 } from "./score.v2";
import { Answers, ClassificationResult, Questionnaire } from "./types";

export const CURRENT_QUESTIONNAIRE_VERSION = 2;

const QUESTIONNAIRES: Record<number, Questionnaire> = { 2: QUESTIONNAIRE_V2 };
const SCORERS: Record<number, (answers: Answers, now?: Date) => ClassificationResult> = {
  2: scoreV2,
};

export const getQuestionnaire = (version: number): Questionnaire | null =>
  QUESTIONNAIRES[version] ?? null;

/** Score with the rules of the version the answers were given under. */
export const scoreClassification = (
  version: number,
  answers: Answers,
  now: Date = new Date(),
): ClassificationResult => {
  const scorer = SCORERS[version];
  if (!scorer) throw new Error(`Unknown EU AI Act questionnaire version ${version}`);
  return scorer(answers, now);
};
