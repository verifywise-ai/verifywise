// Rendering-only mirror of Servers/services/euAiActClassification/visibility.ts.
// The server validates and scores; this only decides which question to show.
import type {
  Answers,
  Condition,
  Question,
  Questionnaire,
} from "../../domain/types/euAiActClassification";

const holds = (condition: Condition, answers: Answers): boolean => {
  const answer = answers[condition.questionId];
  const values = answer === undefined ? [] : Array.isArray(answer) ? answer : [answer];
  if (values.length === 0) return false;
  if (condition.anyOf && !values.some((v) => condition.anyOf!.includes(v))) return false;
  if (condition.noneOf && values.some((v) => condition.noneOf!.includes(v))) return false;
  return true;
};

export const visibleQuestions = (questionnaire: Questionnaire, answers: Answers): Question[] => {
  const effective: Answers = {};
  const visible: Question[] = [];
  for (const question of questionnaire.questions) {
    const shown =
      !question.showWhen ||
      question.showWhen.some((group) => group.every((c) => holds(c, effective)));
    if (!shown) continue;
    visible.push(question);
    if (answers[question.id] !== undefined) effective[question.id] = answers[question.id];
  }
  return visible;
};

export const isAnswered = (question: Question, answers: Answers): boolean => {
  const answer = answers[question.id];
  return Array.isArray(answer) ? answer.length > 0 : Boolean(answer);
};

export const pruneHiddenAnswers = (questionnaire: Questionnaire, answers: Answers): Answers =>
  Object.fromEntries(
    visibleQuestions(questionnaire, answers)
      .filter((q) => answers[q.id] !== undefined)
      .map((q) => [q.id, answers[q.id]]),
  );
