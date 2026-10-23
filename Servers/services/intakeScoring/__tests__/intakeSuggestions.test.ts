jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));
jest.mock("../../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { generateIntakeSuggestions, MAX_SUGGESTIONS } from "../intakeSuggestions";
import { likelihoodFromCatalog, severityFromCatalog, weightedRiskScore } from "../riskMappers";
import { IntakeEntityType } from "../../../domain.layer/enums/intake-entity-type.enum";
import { MIT_RISK_CATALOG } from "../../../structures/risk-catalogs/mit";
import { IBM_RISK_CATALOG } from "../../../structures/risk-catalogs/ibm";
import type { ScoringAnswer } from "../scoringInput";

const MODEL = { apiKey: "sk-fake" } as any;
const USE_CASE = { name: "CV screening", purpose: "Rank job applicants", technology: "LLM" };
const ANSWERS: ScoringAnswer[] = [
  { questionId: "q1", label: "Purpose", text: "Screening job applicants" },
  { questionId: "q2", label: "Data", text: "CVs and cover letters" },
];

const drafts = {
  impact: "Qualified applicants are rejected.",
  mitigation_plan: "Audit rankings for bias each quarter.",
  implementation_strategy: "HR analytics runs the audit and reports to the DPO.",
};
const matched = [
  ...MIT_RISK_CATALOG.slice(0, 3).map((e) => ({
    source: "mit",
    id: e.id,
    reason: "relevant",
    ...drafts,
  })),
  ...IBM_RISK_CATALOG.slice(0, 3).map((e) => ({
    source: "ibm",
    id: e.id,
    reason: "relevant",
    ...drafts,
  })),
];
const suggested = Array.from({ length: 8 }, (_, i) => ({
  risk_name: `Risk ${i}`,
  risk_description: "d",
  risk_category: ["Data privacy risk"],
  ai_lifecycle_phase: "Deployment & integration",
  likelihood: (i % 5) + 1,
  severity: ((i + 2) % 5) + 1,
  impact: "impact",
  mitigation_plan: "plan",
  implementation_strategy: "strategy",
}));
const gen = () => jest.fn(async () => ({ object: { matched, suggested } }) as any);

describe("generateIntakeSuggestions", () => {
  it("caps at 10, sorts by weighted score then severity, reports dropped", async () => {
    const generateImpl = gen();
    const { items, droppedCount } = await generateIntakeSuggestions({
      model: MODEL,
      entityType: IntakeEntityType.USE_CASE,
      useCase: USE_CASE,
      answers: ANSWERS,
      classification: null,
      generateImpl,
    });
    expect(items).toHaveLength(MAX_SUGGESTIONS);
    expect(droppedCount).toBe(4);
    const scores = items.map((i) => weightedRiskScore(i.likelihood, i.severity));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(items.map((i) => i.id)).size).toBe(10);
    for (const i of items) {
      expect(i.state).toBe("suggested");
      expect(i.deadline).toBeNull();
      expect(i.modelRiskCategory).toBeUndefined();
      expect(["mit", "ibm", "ai"]).toContain(i.source);
    }
  });

  it("breaks score ties by severity", async () => {
    const { items } = await generateIntakeSuggestions({
      model: MODEL,
      entityType: IntakeEntityType.USE_CASE,
      useCase: USE_CASE,
      answers: ANSWERS,
      classification: null,
      generateImpl: jest.fn(async () => ({
        object: {
          matched: [],
          suggested: [
            // 5 + 3*2 = 11 and 2 + 3*3 = 11
            { ...suggested[0], risk_name: "high likelihood", likelihood: 5, severity: 2 },
            { ...suggested[0], risk_name: "high severity", likelihood: 2, severity: 3 },
          ],
        },
      })) as any,
    });
    expect(items.map((i) => i.name)).toEqual(["high severity", "high likelihood"]);
  });

  it("maps catalog and AI items onto register enums", async () => {
    const entry = MIT_RISK_CATALOG[0];
    const { items } = await generateIntakeSuggestions({
      model: MODEL,
      entityType: IntakeEntityType.USE_CASE,
      useCase: USE_CASE,
      answers: ANSWERS,
      classification: null,
      generateImpl: jest.fn(async () => ({
        object: {
          matched: [{ source: "mit", id: entry.id, reason: "relevant", ...drafts }],
          suggested: suggested.slice(0, 2),
        },
      })) as any,
    });
    const mit = items.find((i) => i.source === "mit");
    expect(mit).toBeDefined();
    expect(mit!.name).toBe(entry.summary);
    expect(mit!.likelihood).toBe(likelihoodFromCatalog("mit", entry.likelihood));
    expect(mit!.severity).toBe(severityFromCatalog("mit", entry.riskSeverity));
    const ai = items.filter((i) => i.source === "ai");
    expect(ai.length).toBeGreaterThan(0);
    for (const i of ai) {
      expect(["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"]).toContain(i.likelihood);
      expect(["Negligible", "Minor", "Moderate", "Major", "Catastrophic"]).toContain(i.severity);
    }
  });

  it("carries drafted impact, mitigation and implementation strategy on every item", async () => {
    const { items } = await generateIntakeSuggestions({
      model: MODEL,
      entityType: IntakeEntityType.USE_CASE,
      useCase: USE_CASE,
      answers: ANSWERS,
      classification: null,
      generateImpl: gen(),
    });
    for (const i of items) {
      expect(i.mitigationPlan).not.toBe("");
      expect(i.implementationStrategy).not.toBe("");
    }
    const catalog = items.filter((i) => i.source !== "ai");
    expect(catalog.length).toBeGreaterThan(0);
    for (const i of catalog) {
      expect(i.impact).toBe(drafts.impact);
      expect(i.mitigationPlan).toBe(drafts.mitigation_plan);
      expect(i.implementationStrategy).toBe(drafts.implementation_strategy);
    }
  });

  it("falls back without failing when the model omits the drafts", async () => {
    const { items } = await generateIntakeSuggestions({
      model: MODEL,
      entityType: IntakeEntityType.USE_CASE,
      useCase: USE_CASE,
      answers: ANSWERS,
      classification: null,
      generateImpl: jest.fn(async () => ({
        object: {
          matched: [{ source: "mit", id: MIT_RISK_CATALOG[0].id, reason: "relevant" }],
          suggested: [{ ...suggested[0], implementation_strategy: undefined }],
        },
      })) as any,
    });
    const mit = items.find((i) => i.source === "mit")!;
    expect(mit.impact).toBe("relevant");
    expect(mit.mitigationPlan).toBe("");
    expect(mit.implementationStrategy).toBe("");
    expect(items.find((i) => i.source === "ai")!.implementationStrategy).toBe("");
  });

  it("sets model risk category and level for MODEL submissions", async () => {
    const { items } = await generateIntakeSuggestions({
      model: MODEL,
      entityType: IntakeEntityType.MODEL,
      useCase: USE_CASE,
      answers: ANSWERS,
      classification: null,
      generateImpl: gen(),
    });
    for (const i of items) {
      expect(i.modelRiskCategory).toBeDefined();
      expect(i.modelRiskLevel).toBeDefined();
    }
  });

  it("passes answers and classification in a delimited block", async () => {
    const generateImpl = gen();
    await generateIntakeSuggestions({
      model: MODEL,
      entityType: IntakeEntityType.USE_CASE,
      useCase: USE_CASE,
      answers: ANSWERS,
      classification: {
        level: "High risk",
        reasons: [{ article: "Annex III", text: "employment" }],
      },
      generateImpl,
    });
    const prompt: string = (generateImpl.mock.calls[0] as any[])[0].prompt;
    const open = prompt.match(/<(intake-context-[0-9a-f]{32})>/);
    expect(open).not.toBeNull();
    const block = prompt.split(`<${open![1]}>\n`)[1].split(`\n</${open![1]}>`)[0];
    expect(block).toContain("Purpose: Screening job applicants");
    expect(block).toContain("Data: CVs and cover letters");
    expect(block).toContain("Rules classification: High risk");
    expect(block).toContain("Annex III: employment");
  });
});
