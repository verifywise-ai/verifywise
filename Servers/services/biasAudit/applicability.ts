/**
 * Question applicability for the LL 144 intake.
 *
 * The predicate shape intentionally mirrors the visibility rules in
 * `Servers/services/intakeFormLogic/`, which is a pure module. If that
 * evaluator is later extracted as a shared library with no table dependency,
 * this file should call it instead of duplicating the logic; until then,
 * duplicating four predicate forms is cheaper than depending on another
 * module's service.
 */
import { LL144_QUESTIONS } from "../../structures/NYC-Local-Law-144/intake.questions";
import type {
  IntakeQuestion,
  Predicate,
  QuestionScope,
} from "../../structures/NYC-Local-Law-144/intake.types";

export type AnswerMap = Record<string, { value: string | null; dontKnow: boolean }>;

/** The wider shape the stance needs, since it quotes verbatim notes. */
export type AnswerWithNotes = Record<
  string,
  { value: string | null; notes: string | null; dontKnow: boolean }
>;

/** An undefined predicate always applies. A don't-know never counts as answered. */
export function evaluatePredicate(p: Predicate | undefined, answers: AnswerMap): boolean {
  if (p === undefined) return true;
  if (p.not !== undefined) return !evaluatePredicate(p.not, answers);
  if (p.all !== undefined) return p.all.every((x) => evaluatePredicate(x, answers));
  if (p.any !== undefined) return p.any.some((x) => evaluatePredicate(x, answers));
  if (p.answered !== undefined) {
    const a = answers[p.answered];
    return a !== undefined && !a.dontKnow && a.value !== null && a.value !== "";
  }
  if (p.equals !== undefined) {
    const a = answers[p.equals.key];
    return a !== undefined && !a.dontKnow && a.value === p.equals.value;
  }
  return true;
}

export function applicableQuestions(answers: AnswerMap, scope?: QuestionScope): IntakeQuestion[] {
  return LL144_QUESTIONS.filter(
    (q) => (scope === undefined || q.scope === scope) && evaluatePredicate(q.appliesWhen, answers),
  );
}

/** True when the key holds a usable answer: present, not a don't-know, not blank. */
export function hasValue(answers: AnswerMap, key: string): boolean {
  const a = answers[key];
  return a !== undefined && !a.dontKnow && a.value !== null && a.value !== "";
}
