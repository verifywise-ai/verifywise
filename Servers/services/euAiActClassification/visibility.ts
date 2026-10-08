import { Answers, Condition, Question, Questionnaire } from "./types";

const holds = (condition: Condition, answers: Answers): boolean => {
  const answer = answers[condition.questionId];
  const values = answer === undefined ? [] : Array.isArray(answer) ? answer : [answer];
  if (values.length === 0) return false;
  if (condition.anyOf && !values.some((v) => condition.anyOf!.includes(v))) return false;
  if (condition.noneOf && values.some((v) => condition.noneOf!.includes(v))) return false;
  return true;
};

/**
 * The questions to ask for these answers, in order. A hidden question's answer
 * is ignored, so a stale answer left after "Back" cannot reveal later questions.
 */
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
