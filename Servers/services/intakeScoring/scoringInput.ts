// Servers/services/intakeScoring/scoringInput.ts
// Turns a submission into the answers the AI scorer may see. Contact data
// (email-type fields) never leaves the server; select answers are rendered as
// their option labels; every answer and the total are length-capped.
import { answerTextOf, FormSchema } from "../intakeRiskScoring.service";
import { isEmptyAnswer } from "../intakeFormLogic";

export interface ScoringAnswer {
  questionId: string;
  label: string;
  text: string;
  dimension?: string;
}

export const MAX_ANSWER_CHARS = 2000;
export const MAX_TOTAL_ANSWER_CHARS = 24000;

export function buildScoringAnswers(
  data: Record<string, unknown>,
  schema: FormSchema,
): ScoringAnswer[] {
  const answers: ScoringAnswer[] = [];
  let remaining = MAX_TOTAL_ANSWER_CHARS;
  for (const field of schema.fields) {
    if (remaining <= 0) break;
    if (field.type === "email") continue;
    const value = data[field.id];
    if (isEmptyAnswer(value)) continue;
    const raw = answerTextOf(field, value).trim();
    if (!raw) continue;
    const text = raw.slice(0, Math.min(MAX_ANSWER_CHARS, remaining));
    remaining -= text.length;
    answers.push({
      questionId: field.id,
      label: field.label,
      text,
      ...(field.riskDimension ? { dimension: field.riskDimension } : {}),
    });
  }
  return answers;
}
