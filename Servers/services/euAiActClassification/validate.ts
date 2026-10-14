import { Answers, Questionnaire } from "./types";
import { visibleQuestions } from "./visibility";

/**
 * Check raw answers against a questionnaire. On success `answers` holds only
 * the answers to visible questions, which is what gets scored and stored.
 */
export const validateAnswers = (
  questionnaire: Questionnaire,
  raw: unknown,
): { errors: string[]; answers: Answers } => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { errors: ["answers must be an object"], answers: {} };
  }
  const input = raw as Record<string, unknown>;
  const byId = new Map(questionnaire.questions.map((q) => [q.id, q]));
  const errors: string[] = [];

  for (const [id, value] of Object.entries(input)) {
    const question = byId.get(id);
    if (!question) {
      errors.push(`unknown question "${id}"`);
      continue;
    }
    if (question.inputType === "single_select" && Array.isArray(value)) {
      errors.push(`question "${id}" takes one answer`);
      continue;
    }
    if (question.inputType === "multi_select" && !Array.isArray(value)) {
      errors.push(`question "${id}" takes a list of answers`);
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
    const allowed = new Set(question.options.map((o) => o.value));
    for (const v of values) {
      if (typeof v !== "string" || !allowed.has(v)) {
        errors.push(`invalid answer "${String(v)}" for question "${id}"`);
      }
    }
    const seen = new Set<unknown>();
    for (const v of values) {
      if (seen.has(v)) errors.push(`duplicate answer "${String(v)}" for question "${id}"`);
      seen.add(v);
    }
    const exclusive = question.options.filter((o) => o.exclusive).map((o) => o.value);
    if (values.length > 1 && values.some((v) => exclusive.includes(v as string))) {
      errors.push(
        `"${exclusive.join('", "')}" cannot be combined with other answers for question "${id}"`,
      );
    }
  }
  if (errors.length > 0) return { errors, answers: {} };

  const typed = input as Answers;
  const answers: Answers = {};
  for (const question of visibleQuestions(questionnaire, typed)) {
    const answer = typed[question.id];
    if (answer === undefined || (Array.isArray(answer) && answer.length === 0)) {
      errors.push(`question "${question.id}" is not answered`);
    } else {
      answers[question.id] = answer;
    }
  }
  return errors.length > 0 ? { errors, answers: {} } : { errors, answers };
};
