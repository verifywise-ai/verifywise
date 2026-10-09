import { describe, it, expect } from "vitest";
import { isAnswered, pruneHiddenAnswers, visibleQuestions } from "../euAiActQuestionnaire";
import type { Questionnaire } from "../../../domain/types/euAiActClassification";

const Q: Questionnaire = {
  version: 2,
  questions: [
    {
      id: "a",
      text: "A",
      articleRef: "",
      inputType: "single_select",
      options: [
        { value: "x", label: "X" },
        { value: "y", label: "Y" },
      ],
    },
    {
      id: "b",
      text: "B",
      articleRef: "",
      inputType: "multi_select",
      options: [{ value: "p", label: "P" }],
      showWhen: [[{ questionId: "a", anyOf: ["x"] }]],
    },
    {
      id: "c",
      text: "C",
      articleRef: "",
      inputType: "single_select",
      options: [{ value: "z", label: "Z" }],
      showWhen: [[{ questionId: "b", anyOf: ["p"] }]],
    },
  ],
};

describe("euAiActQuestionnaire helper", () => {
  it("hides questions whose conditions do not hold", () => {
    expect(visibleQuestions(Q, { a: "y" }).map((q) => q.id)).toEqual(["a"]);
  });

  it("ignores a stale answer to a question that is now hidden", () => {
    expect(visibleQuestions(Q, { a: "y", b: ["p"] }).map((q) => q.id)).toEqual(["a"]);
  });

  it("shows a chain of follow-ups when each condition holds", () => {
    expect(visibleQuestions(Q, { a: "x", b: ["p"] }).map((q) => q.id)).toEqual(["a", "b", "c"]);
  });

  it("prunes answers to hidden questions", () => {
    expect(pruneHiddenAnswers(Q, { a: "y", b: ["p"], c: "z" })).toEqual({ a: "y" });
  });

  it("treats an empty list as unanswered", () => {
    expect(isAnswered(Q.questions[1], { b: [] })).toBe(false);
  });

  it("treats a selected value as answered", () => {
    expect(isAnswered(Q.questions[0], { a: "x" })).toBe(true);
  });
});
