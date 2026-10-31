import { describe, it, expect } from "@jest/globals";
import { QUESTIONNAIRE_V2 } from "../questionnaire.v2";
import { validateAnswers } from "../validate";
import { visibleQuestions } from "../visibility";

const MINIMAL = {
  scope: "in_scope",
  role: "deployer",
  art5_practices: ["none"],
  rbi_law_enforcement: "no",
  intimate_content: "no",
  safety_function: "no",
  annex_iii_areas: ["none"],
  transparency: ["none"],
};

describe("validateAnswers", () => {
  it("accepts a complete minimal-risk path", () => {
    const { errors, answers } = validateAnswers(QUESTIONNAIRE_V2, MINIMAL);
    expect(errors).toEqual([]);
    expect(answers).toEqual({ ...MINIMAL, role: ["deployer"] });
  });

  it("accepts a saved single-role answer and returns it as a one-item list", () => {
    const { errors, answers } = validateAnswers(QUESTIONNAIRE_V2, { ...MINIMAL, role: "deployer" });
    expect(errors).toEqual([]);
    expect(answers.role).toEqual(["deployer"]);
  });

  it("accepts both roles", () => {
    const { errors, answers } = validateAnswers(QUESTIONNAIRE_V2, {
      ...MINIMAL,
      role: ["provider", "deployer"],
    });
    expect(errors).toEqual([]);
    expect(answers.role).toEqual(["provider", "deployer"]);
  });

  it("rejects a role given twice and an unanswered role", () => {
    expect(
      validateAnswers(QUESTIONNAIRE_V2, { ...MINIMAL, role: ["provider", "provider"] }).errors,
    ).toEqual(['duplicate answer "provider" for question "role"']);
    expect(validateAnswers(QUESTIONNAIRE_V2, { ...MINIMAL, role: [] }).errors).toEqual([
      'question "role" is not answered',
    ]);
  });

  it("rejects a value given twice in a multi-select answer", () => {
    const { errors } = validateAnswers(QUESTIONNAIRE_V2, {
      ...MINIMAL,
      transparency: ["interacts", "interacts"],
    });
    expect(errors).toEqual(['duplicate answer "interacts" for question "transparency"']);
  });

  it("rejects a non-object", () => {
    expect(validateAnswers(QUESTIONNAIRE_V2, ["scope"]).errors).toEqual([
      "answers must be an object",
    ]);
  });

  it("rejects unknown questions and unknown values", () => {
    const { errors } = validateAnswers(QUESTIONNAIRE_V2, {
      ...MINIMAL,
      level: "Minimal risk",
      scope: "maybe",
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'unknown question "level"',
        'invalid answer "maybe" for question "scope"',
      ]),
    );
  });

  it("rejects an exclusive answer combined with others", () => {
    const { errors } = validateAnswers(QUESTIONNAIRE_V2, {
      ...MINIMAL,
      art5_practices: ["none", "manipulation"],
    });
    expect(errors[0]).toContain("cannot be combined");
  });

  it("rejects a list for a single-select question and a string for a multi-select one", () => {
    const { errors } = validateAnswers(QUESTIONNAIRE_V2, {
      ...MINIMAL,
      scope: ["in_scope"],
      transparency: "none",
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'question "scope" takes one answer',
        'question "transparency" takes a list of answers',
      ]),
    );
  });

  it("reports a visible question that is not answered", () => {
    const { transparency, ...rest } = MINIMAL;
    void transparency;
    expect(validateAnswers(QUESTIONNAIRE_V2, rest).errors).toEqual([
      'question "transparency" is not answered',
    ]);
  });

  it("drops answers to questions that are hidden by earlier answers", () => {
    const { errors, answers } = validateAnswers(QUESTIONNAIRE_V2, {
      ...MINIMAL,
      employment_use: ["recruitment"], // hidden: annex_iii_areas is "none"
    });
    expect(errors).toEqual([]);
    expect(answers.employment_use).toBeUndefined();
  });

  it("stops after a prohibited practice", () => {
    const ids = visibleQuestions(QUESTIONNAIRE_V2, {
      scope: "in_scope",
      role: "provider",
      art5_practices: ["social_scoring"],
    }).map((q) => q.id);
    expect(ids).toEqual(["scope", "role", "art5_practices"]);
  });

  it("asks only the scope question when the system is research-only", () => {
    const { errors, answers } = validateAnswers(QUESTIONNAIRE_V2, { scope: "research_only" });
    expect(errors).toEqual([]);
    expect(answers).toEqual({ scope: "research_only" });
  });

  it("accepts multiple uses in one Annex III area", () => {
    const { errors, answers } = validateAnswers(QUESTIONNAIRE_V2, {
      ...MINIMAL,
      annex_iii_areas: ["essential_services"],
      essential_services_use: ["fraud_detection", "creditworthiness"],
      profiling: "yes",
    });
    expect(errors).toEqual([]);
    expect(answers.essential_services_use).toEqual(["fraud_detection", "creditworthiness"]);
  });

  it("rejects a string for a multi-select Annex III follow-up", () => {
    const { errors } = validateAnswers(QUESTIONNAIRE_V2, {
      ...MINIMAL,
      annex_iii_areas: ["essential_services"],
      essential_services_use: "fraud_detection", // should be an array
      profiling: "yes",
    });
    expect(errors).toEqual(
      expect.arrayContaining(['question "essential_services_use" takes a list of answers']),
    );
  });
});
