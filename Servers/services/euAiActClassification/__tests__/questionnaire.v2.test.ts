import { describe, it, expect } from "@jest/globals";
import { ANNEX_III_HIGH_RISK_USES, QUESTIONNAIRE_V2 } from "../questionnaire.v2";

const QUESTIONS = QUESTIONNAIRE_V2.questions;
const indexOf = (id: string) => QUESTIONS.findIndex((q) => q.id === id);
const optionValues = (id: string) => QUESTIONS[indexOf(id)]?.options.map((o) => o.value) ?? [];

describe("QUESTIONNAIRE_V2 integrity", () => {
  it("has unique question ids", () => {
    const ids = QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique option values within each question", () => {
    for (const question of QUESTIONS) {
      const values = question.options.map((o) => o.value);
      expect({ id: question.id, unique: new Set(values).size === values.length }).toEqual({
        id: question.id,
        unique: true,
      });
    }
  });

  it("only shows a question after the questions its conditions refer to", () => {
    const problems: string[] = [];
    QUESTIONS.forEach((question, index) => {
      for (const condition of (question.showWhen ?? []).flat()) {
        const target = indexOf(condition.questionId);
        if (target < 0 || target >= index) {
          problems.push(`${question.id} -> ${condition.questionId}`);
        }
      }
    });
    expect(problems).toEqual([]);
  });

  it("only uses existing option values in its conditions", () => {
    const problems: string[] = [];
    for (const question of QUESTIONS) {
      for (const condition of (question.showWhen ?? []).flat()) {
        const allowed = optionValues(condition.questionId);
        for (const value of [...(condition.anyOf ?? []), ...(condition.noneOf ?? [])]) {
          if (!allowed.includes(value)) {
            problems.push(`${question.id}: ${condition.questionId}=${value}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("maps every Annex III high-risk use to an existing question and option", () => {
    const problems: string[] = [];
    for (const [questionId, values] of Object.entries(ANNEX_III_HIGH_RISK_USES)) {
      if (indexOf(questionId) < 0) problems.push(`missing question ${questionId}`);
      for (const value of values) {
        if (!optionValues(questionId).includes(value)) problems.push(`${questionId}=${value}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
