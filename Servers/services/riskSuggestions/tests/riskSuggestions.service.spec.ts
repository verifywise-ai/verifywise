// The service's enum/threshold imports transitively reach the database and
// BullMQ; the mocks keep importing it from opening connections. Same trio as
// services/riskLinks/tests/directionFilter.spec.ts. The LLM call itself is
// faked through generateObjectWithSelfCorrection's generateImpl seam.
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

import {
  hydrateMatched,
  processSuggested,
  RiskSuggestionError,
  suggestRisksForUseCase,
} from "../riskSuggestions.service";
import { riskSuggestionOutputSchema } from "../schema";
import { MIT_RISK_CATALOG } from "../../../structures/risk-catalogs/mit";
import { IBM_RISK_CATALOG } from "../../../structures/risk-catalogs/ibm";
import logger from "../../../utils/logger/fileLogger";

const mockLogger = logger as unknown as { [k: string]: jest.Mock };

const FAKE_MODEL = { apiKey: "sk-fake-secret" } as any;

const USE_CASE = {
  name: "Customer support assistant",
  purpose: "Drafts answers to customer tickets with tool access to internal systems.",
  technology: "LLM with retrieval over the knowledge base and CRM tool integrations.",
};

const genReturning = (object: unknown) => jest.fn(async () => ({ object }) as any);

const validOutput = () => ({
  matched: [
    {
      source: "mit",
      id: 1,
      reason: "A public-facing assistant can cause societal-scale harm.",
      ai_lifecycle_phase: "Deployment & integration",
    },
    {
      source: "ibm",
      id: 3,
      reason: "Tool integrations can pass confidential context outward.",
      ai_lifecycle_phase: "Deployment & integration",
    },
  ],
  suggested: [
    {
      risk_name: "Hallucinated pricing in customer quotes",
      risk_description: "The assistant may invent prices or discounts in drafted answers.",
      risk_category: ["Operational risk", "Reputational risk"],
      ai_lifecycle_phase: "Deployment & integration",
      likelihood: 3,
      severity: 4,
      impact: "Customers hold the organization to quotes it never approved.",
      mitigation_plan: "Route pricing content through a validated lookup before sending.",
    },
  ],
});

describe("suggestRisksForUseCase", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("hydrates matched ids from catalog data, not from LLM text", async () => {
    const result = await suggestRisksForUseCase({
      model: FAKE_MODEL,
      useCase: USE_CASE,
      existingRiskNames: [],
      generateImpl: genReturning(validOutput()),
    });

    expect(result.matched).toHaveLength(2);

    const mitMatch = result.matched[0];
    const mitEntry = MIT_RISK_CATALOG.find((entry) => entry.id === 1)!;
    expect(mitMatch.source).toBe("mit");
    expect(mitMatch.summary).toBe(mitEntry.summary);
    expect(mitMatch.description).toBe(mitEntry.description);
    expect(mitMatch.severity).toBe(mitEntry.riskSeverity);
    expect(mitMatch.likelihood).toBe(mitEntry.likelihood);
    expect(mitMatch.reason).toBe("A public-facing assistant can cause societal-scale harm.");
    expect(mitMatch.ai_lifecycle_phase).toBe("Deployment & integration");
  });

  it("normalizes IBM catalog categories onto the project risk enum", async () => {
    const result = await suggestRisksForUseCase({
      model: FAKE_MODEL,
      useCase: USE_CASE,
      existingRiskNames: [],
      generateImpl: genReturning(validOutput()),
    });

    const ibmMatch = result.matched[1];
    const ibmEntry = IBM_RISK_CATALOG.find((entry) => entry.id === 3)!;
    expect(ibmEntry.riskCategories).toContain("Third-party or vendor risk"); // raw catalog
    expect(ibmMatch.risk_category).toContain("Third-party/vendor risk"); // normalized
    expect(ibmMatch.risk_category).not.toContain("Third-party or vendor risk");
    expect(ibmMatch.risk_category).toEqual(
      expect.arrayContaining(["Cybersecurity risk", "Data privacy risk", "Legal risk"]),
    );
  });

  it("passes through a well-formed suggested risk and reports zero suppressions", async () => {
    const result = await suggestRisksForUseCase({
      model: FAKE_MODEL,
      useCase: USE_CASE,
      existingRiskNames: [],
      generateImpl: genReturning(validOutput()),
    });

    expect(result.suggested).toHaveLength(1);
    expect(result.suggested[0]).toEqual(validOutput().suggested[0]);
    expect(result.suppressed_count).toBe(0);
  });

  it("sends ids, summaries and categories to the model, but not catalog descriptions", async () => {
    const generateImpl = genReturning(validOutput());
    await suggestRisksForUseCase({
      model: FAKE_MODEL,
      useCase: USE_CASE,
      existingRiskNames: [],
      generateImpl,
    });

    const prompt: string = generateImpl.mock.calls[0][0].prompt;
    // Every IBM entry is listed by id + summary...
    expect(prompt).toContain("id 1: Unexplainable and untraceable actions");
    // ...but its description stays server-side.
    expect(prompt).not.toContain(IBM_RISK_CATALOG[0].description);
    expect(prompt).toContain(USE_CASE.name);
  });

  it("drops hallucinated matched ids and repeated ids", async () => {
    const result = await suggestRisksForUseCase({
      model: FAKE_MODEL,
      useCase: USE_CASE,
      existingRiskNames: [],
      generateImpl: genReturning({
        matched: [
          { source: "mit", id: 999999, reason: "Not a real catalog entry, invented by the model." },
          { source: "ibm", id: 114, reason: "One past the end of the IBM catalog entirely." },
          { source: "mit", id: 1, reason: "A real match worth keeping in the result set." },
          { source: "mit", id: 1, reason: "The same match proposed a second time over." },
        ],
        suggested: [],
      }),
    });

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].id).toBe(1);
  });

  it("drops invalid lifecycle phases and filters suggested categories to the enum", async () => {
    const result = await suggestRisksForUseCase({
      model: FAKE_MODEL,
      useCase: USE_CASE,
      existingRiskNames: [],
      generateImpl: genReturning({
        matched: [
          { source: "mit", id: 1, reason: "Relevant match.", ai_lifecycle_phase: "Invented phase" },
        ],
        suggested: [
          {
            risk_name: "Prompt injection via ticket content",
            risk_description: "A customer ticket can carry instructions aimed at the assistant.",
            risk_category: ["Cybersecurity risk", "Made-up category"],
            ai_lifecycle_phase: "Chaos",
            likelihood: 4,
            severity: 4,
            impact: "The assistant acts on attacker instructions.",
            mitigation_plan: "Sanitize and delimit retrieved ticket content.",
          },
        ],
      }),
    });

    expect(result.matched[0].ai_lifecycle_phase).toBeUndefined();
    expect(result.suggested[0].risk_category).toEqual(["Cybersecurity risk"]);
    expect(result.suggested[0].ai_lifecycle_phase).toBeUndefined();
  });

  it("suppresses near-duplicates of existing risks and counts them", async () => {
    const result = await suggestRisksForUseCase({
      model: FAKE_MODEL,
      useCase: USE_CASE,
      existingRiskNames: [
        // Near-duplicate of MIT id 1's summary "Diffuse creation, accountability loss".
        "Diffuse creation and accountability loss",
        // Exact duplicate of the suggested risk's name.
        "Hallucinated pricing in customer quotes",
      ],
      generateImpl: genReturning(validOutput()),
    });

    expect(result.matched.map((match) => match.id)).toEqual([3]);
    expect(result.suggested).toHaveLength(0);
    expect(result.suppressed_count).toBe(2);
  });

  it("throws a typed RiskSuggestionError when the model call fails", async () => {
    const generateImpl = jest.fn(async () => {
      throw new Error("rate limited");
    });

    await expect(
      suggestRisksForUseCase({
        model: FAKE_MODEL,
        useCase: USE_CASE,
        existingRiskNames: [],
        generateImpl,
      }),
    ).rejects.toBeInstanceOf(RiskSuggestionError);

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const logged: string = mockLogger.warn.mock.calls[0][0];
    expect(logged).toContain("rate limited");
    // Nothing sensitive: not the key material, not the prompt.
    expect(logged).not.toContain("sk-fake-secret");
    expect(logged).not.toContain(USE_CASE.purpose);
  });
});

describe("processSuggested", () => {
  it("clamps out-of-range likelihood and severity to the 1-5 scale", () => {
    const [processed] = processSuggested([
      {
        risk_name: "Overconfident model output",
        risk_description: "d",
        risk_category: [],
        ai_lifecycle_phase: "Monitoring & maintenance",
        likelihood: 9,
        severity: 0,
        impact: "i",
        mitigation_plan: "m",
      } as any,
    ]);

    expect(processed.likelihood).toBe(5);
    expect(processed.severity).toBe(1);
  });

  it("strips control characters from model-authored text", () => {
    const [processed] = processSuggested([
      {
        risk_name: "Injected\nnew line\u0007 bell",
        risk_description: "d",
        risk_category: [],
        ai_lifecycle_phase: "Monitoring & maintenance",
        likelihood: 3,
        severity: 3,
        impact: "i",
        mitigation_plan: "m",
      },
    ]);

    expect(processed.risk_name).toBe("Injected new line bell");
  });

  it("drops suggested risks whose name sanitizes to empty", () => {
    expect(
      processSuggested([
        {
          risk_name: " \u0007 ",
          risk_description: "d",
          risk_category: [],
          ai_lifecycle_phase: "Monitoring & maintenance",
          likelihood: 3,
          severity: 3,
          impact: "i",
          mitigation_plan: "m",
        },
      ]),
    ).toEqual([]);
  });
});

describe("hydrateMatched", () => {
  it("truncates the reason and strips control characters", () => {
    const [match] = hydrateMatched([
      { source: "mit", id: 1, reason: `${"x".repeat(400)}\nmore`, ai_lifecycle_phase: undefined },
    ]);

    expect(match.reason.length).toBeLessThanOrEqual(300);
    expect(match.reason).not.toContain("\n");
  });
});

describe("riskSuggestionOutputSchema caps", () => {
  const match = { source: "mit", id: 1, reason: "r" };
  const suggestion = {
    risk_name: "n",
    risk_description: "d",
    risk_category: [],
    ai_lifecycle_phase: "Monitoring & maintenance",
    likelihood: 3,
    severity: 3,
    impact: "i",
    mitigation_plan: "m",
  };

  // Note: with an injected generateImpl the wrapper returns the object
  // unvalidated — in production the SDK's generateObject enforces this schema
  // and the self-correction loop repairs violations. These tests pin the
  // schema's own caps directly.
  it("rejects more than 10 matched entries", () => {
    expect(
      riskSuggestionOutputSchema.safeParse({ matched: Array(11).fill(match), suggested: [] })
        .success,
    ).toBe(false);
    expect(
      riskSuggestionOutputSchema.safeParse({ matched: Array(10).fill(match), suggested: [] })
        .success,
    ).toBe(true);
  });

  it("rejects more than 10 suggested risks and undeclared fields", () => {
    expect(
      riskSuggestionOutputSchema.safeParse({ matched: [], suggested: Array(11).fill(suggestion) })
        .success,
    ).toBe(false);
    expect(
      riskSuggestionOutputSchema.safeParse({ matched: [], suggested: [], extra: true }).success,
    ).toBe(false);
  });
});
