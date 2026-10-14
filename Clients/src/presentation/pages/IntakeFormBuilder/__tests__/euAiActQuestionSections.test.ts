import { describe, it, expect } from "vitest";
import type { Question } from "../../../../domain/types/euAiActClassification";
import { followUpTriggerLabels, groupEuAiActQuestions } from "../euAiActQuestionSections";

const question = (id: string, extra: Partial<Question> = {}): Question => ({
  id,
  text: id,
  articleRef: "",
  inputType: "single_select",
  options: [],
  ...extra,
});

const V2_IDS = [
  "scope",
  "role",
  "art5_practices",
  "rbi_law_enforcement",
  "rbi_objective",
  "intimate_content",
  "intimate_content_safeguards",
  "safety_function",
  "annex_iii_areas",
  "biometrics_use",
  "critical_infrastructure_use",
  "education_use",
  "employment_use",
  "essential_services_use",
  "law_enforcement_use",
  "migration_use",
  "justice_democracy_use",
  "profiling",
  "derogation",
  "transparency",
];

describe("groupEuAiActQuestions", () => {
  it("puts every current question in its section, in questionnaire order", () => {
    const sections = groupEuAiActQuestions(V2_IDS.map((id) => question(id)));
    expect(sections.map((s) => [s.title, s.questions.map((q) => q.id)])).toEqual([
      ["Scope and role", ["scope", "role"]],
      [
        "Article 5 · Prohibited practices",
        [
          "art5_practices",
          "rbi_law_enforcement",
          "rbi_objective",
          "intimate_content",
          "intimate_content_safeguards",
        ],
      ],
      ["Annex I · Product safety", ["safety_function"]],
      [
        "Annex III · High-risk uses",
        [
          "annex_iii_areas",
          "biometrics_use",
          "critical_infrastructure_use",
          "education_use",
          "employment_use",
          "essential_services_use",
          "law_enforcement_use",
          "migration_use",
          "justice_democracy_use",
          "profiling",
          "derogation",
        ],
      ],
      ["Article 50 · Transparency", ["transparency"]],
    ]);
  });

  it("puts unknown question ids in a final other group and skips empty sections", () => {
    const sections = groupEuAiActQuestions([
      question("brand_new"),
      question("scope"),
      question("health_use"),
    ]);
    expect(sections.map((s) => [s.title, s.questions.map((q) => q.id)])).toEqual([
      ["Scope and role", ["scope"]],
      ["Annex III · High-risk uses", ["health_use"]],
      ["Other questions", ["brand_new"]],
    ]);
  });
});

describe("followUpTriggerLabels", () => {
  const areas = question("annex_iii_areas", {
    options: [
      { value: "biometrics", label: "Biometrics" },
      { value: "education", label: "Education" },
    ],
  });
  const byId = new Map([[areas.id, areas]]);

  it("returns the option labels of a single anyOf condition", () => {
    const followUp = question("x", {
      showWhen: [[{ questionId: "annex_iii_areas", anyOf: ["biometrics", "education"] }]],
    });
    expect(followUpTriggerLabels(followUp, byId)).toEqual(["Biometrics", "Education"]);
  });

  it("returns null for other rule shapes or unknown references", () => {
    const cases: Question["showWhen"][] = [
      undefined,
      [[{ questionId: "annex_iii_areas", noneOf: ["biometrics"] }]],
      [
        [{ questionId: "annex_iii_areas", anyOf: ["biometrics"] }],
        [{ questionId: "scope", anyOf: ["yes"] }],
      ],
      [
        [
          { questionId: "annex_iii_areas", anyOf: ["biometrics"] },
          { questionId: "scope", anyOf: ["yes"] },
        ],
      ],
      [[{ questionId: "missing", anyOf: ["biometrics"] }]],
      [[{ questionId: "annex_iii_areas", anyOf: ["unknown"] }]],
    ];
    for (const showWhen of cases) {
      expect(followUpTriggerLabels(question("x", { showWhen }), byId)).toBeNull();
    }
  });
});
