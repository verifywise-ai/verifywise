const mockGenerate = jest.fn();
const mockSectionSummaries = jest.fn();

jest.mock("../../../../advisor/llmSelfCorrect", () => ({
  generateObjectWithSelfCorrection: (...a: any[]) => mockGenerate(...a),
}));
jest.mock("../../../../advisor/llmModelFactory", () => {
  const actual = jest.requireActual("../../../../advisor/llmModelFactory");
  return {
    ...actual,
    createModelFromKey: jest.fn(() => "model"),
  };
});
jest.mock("../sectionSummaries", () => ({
  runSectionSummaries: (...a: any[]) => mockSectionSummaries(...a),
}));

import { runAnalyzers, type AiBlocks } from "../runAnalyzers";

const reportData: any = {
  metadata: { frameworkName: "EU AI Act", projectTitle: "Acme", organizationId: 5 },
  sections: {
    projectRisks: { totalRisks: 1, risks: [{ name: "R1" }] },
    vendorRisks: { risks: [{ riskName: "VR1" }] },
    vendors: { vendors: [{ name: "Acme Corp" }] },
    compliance: { controls: [{ id: 1 }] },
  },
};
const llmKey: any = { id: 9, name: "openai", key: "sk", url: null, model: "gpt-4o-mini" };

const NONE: AiBlocks = {
  sectionSummaries: false,
  executiveSummary: false,
  keyFindings: false,
  recommendedActions: false,
  riskAnalysis: false,
  complianceGap: false,
  vendorRisk: false,
};
const only = (...on: (keyof AiBlocks)[]): AiBlocks =>
  on.reduce((acc, k) => ({ ...acc, [k]: true }), { ...NONE });

describe("runAnalyzers", () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockGenerate.mockResolvedValue({ object: { summary: "ok", abstain_reason: null }, attempts: 1, selfCorrected: false });
    mockSectionSummaries.mockReset();
    mockSectionSummaries.mockResolvedValue({ projectRisks: "Risks look thin." });
  });

  it("runs only the blocks the config enables", async () => {
    const out = await runAnalyzers({ reportData, llmKey, blocks: only("riskAnalysis") });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(Object.keys(out)).toEqual(["riskAnalysis"]);
    expect(mockSectionSummaries).not.toHaveBeenCalled();
  });

  it("one analyzer failing does not lose the others", async () => {
    mockGenerate
      .mockRejectedValueOnce(new Error("llm exploded"))
      .mockResolvedValue({ object: { narrative: "ok", abstain_reason: null }, attempts: 1, selfCorrected: false });

    const out = await runAnalyzers({ reportData, llmKey, blocks: only("riskAnalysis", "vendorRisk") });

    expect(out.riskAnalysis!.abstained).toBe(true);
    expect(out.riskAnalysis!.abstain_reason).toBe(
      "this analysis could not be produced because the AI service call failed",
    );
    expect(out.vendorRisk!.abstained).toBe(false);
    expect(out.vendorRisk!.payload.narrative).toBe("ok");
  });

  it("keeps the failure and the survivor on their own keys when the SECOND analyzer rejects", async () => {
    // Mutation guard: collect()'s rejected branch must index results by the
    // rejected promise's own key, not by keys[0]. The first test always has
    // the FIRST analyzer reject, which a `results[keys[0]]` mutant would
    // still satisfy by coincidence — this test rejects the second one so the
    // mutant clobbers the first (already-successful) result instead.
    mockGenerate
      .mockResolvedValueOnce({ object: { narrative: "ok", abstain_reason: null }, attempts: 1, selfCorrected: false })
      .mockRejectedValueOnce(new Error("llm exploded"));

    const out = await runAnalyzers({ reportData, llmKey, blocks: only("riskAnalysis", "vendorRisk") });

    expect(out.riskAnalysis!.abstained).toBe(false);
    expect(out.riskAnalysis!.payload.narrative).toBe("ok");
    expect(out.vendorRisk!.abstained).toBe(true);
    expect(out.vendorRisk!.abstain_reason).toBe(
      "this analysis could not be produced because the AI service call failed",
    );
  });

  it("carries through an explicit abstain_reason from a fulfilled (non-error) analysis", async () => {
    // Mutation guard: a hardcoded `abstained: false` in runOne would pass
    // every other test in this file, since none of them ever return a
    // non-null abstain_reason from the mocked LLM.
    mockGenerate.mockResolvedValue({
      object: { narrative: "...", abstain_reason: "data too thin" },
      attempts: 1,
      selfCorrected: false,
    });

    const out = await runAnalyzers({ reportData, llmKey, blocks: only("riskAnalysis") });

    expect(out.riskAnalysis!.abstained).toBe(true);
    expect(out.riskAnalysis!.abstain_reason).toBe("data too thin");
  });

  it("propagates the resolved model id and attempt count through to the result", async () => {
    mockGenerate.mockResolvedValue({
      object: { narrative: "ok", abstain_reason: null },
      attempts: 2,
      selfCorrected: true,
    });

    const out = await runAnalyzers({ reportData, llmKey, blocks: only("riskAnalysis") });

    expect(out.riskAnalysis!.model).toBe("gpt-4o-mini");
    expect(out.riskAnalysis!.attempts).toBe(2);
  });

  it("bounds each call with a timeout and a single self-correction retry", async () => {
    await runAnalyzers({ reportData, llmKey, blocks: only("riskAnalysis") });

    const params = mockGenerate.mock.calls[0][0];
    expect(params.maxSelfCorrectionAttempts).toBe(1);
    expect(params.extra?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("abstains without calling the LLM when a block has no input data", async () => {
    const empty: any = { metadata: reportData.metadata, sections: {} };
    const out = await runAnalyzers({ reportData: empty, llmKey, blocks: only("riskAnalysis") });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(out.riskAnalysis!.abstained).toBe(true);
    expect(out.riskAnalysis!.abstain_reason).toBe("insufficient data for this section");
  });

  it("abstains every enabled block when there is no LLM key", async () => {
    const out = await runAnalyzers({
      reportData,
      llmKey: null,
      blocks: only("executiveSummary", "keyFindings", "sectionSummaries"),
    });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockSectionSummaries).not.toHaveBeenCalled();
    expect(out.executiveSummary!.abstain_reason).toContain("no LLM key");
    expect(out.keyFindings!.abstain_reason).toContain("no LLM key");
    expect(out.sectionSummaries!.abstain_reason).toContain("no LLM key");
  });

  // ---- the two-stage contract ------------------------------------------
  // These three are the reason runAnalyzers is staged at all: the summary
  // consumers read Stage 1's output, never raw sections.

  it("feeds Stage 1 summaries to the Stage 2 consumers", async () => {
    mockSectionSummaries.mockResolvedValue({ projectRisks: "Risk coverage is thin.", compliance: "Half the controls lack evidence." });

    const out = await runAnalyzers({ reportData, llmKey, blocks: only("sectionSummaries", "executiveSummary") });

    expect(mockSectionSummaries).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    const prompt = mockGenerate.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("Risk coverage is thin.");
    expect(prompt).toContain("Half the controls lack evidence.");
    expect(out.executiveSummary!.abstained).toBe(false);
    expect(out.sectionSummaries!.payload.summaries.projectRisks).toBe("Risk coverage is thin.");
  });

  it("produces section summaries as a Stage 2 dependency even when the sectionSummaries block itself is off", async () => {
    // Every stored AiBlocksConfig today has no `sectionSummaries` key at all,
    // so blocks.sectionSummaries is undefined for every real template. If
    // production were gated on that flag, executiveSummary would always
    // abstain — summaries must be produced because Stage 2 needs them, not
    // because the block flag says so.
    const out = await runAnalyzers({ reportData, llmKey, blocks: only("executiveSummary") });

    expect(mockSectionSummaries).toHaveBeenCalledTimes(1);
    expect(out.executiveSummary!.abstained).toBe(false);
    expect(out.sectionSummaries).toBeUndefined();
  });

  it("summary consumers abstain without spending a call when there are no summaries", async () => {
    // sectionSummaries produces nothing -> Stage 2 gets {} -> buildUserPrompt
    // returns "". This mirrors aiSummarizer.ts:227, which returned "" for the
    // same reason.
    mockSectionSummaries.mockResolvedValue({});
    const out = await runAnalyzers({ reportData, llmKey, blocks: only("executiveSummary", "keyFindings") });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(out.executiveSummary!.abstained).toBe(true);
    expect(out.executiveSummary!.abstain_reason).toBe("no section summaries were available to summarise");
    expect(out.keyFindings!.abstained).toBe(true);
    expect(out.keyFindings!.abstain_reason).toBe("no section summaries were available to summarise");
    expect(out.sectionSummaries).toBeUndefined();
  });

  it("records sectionSummaries as abstained when it produces nothing", async () => {
    mockSectionSummaries.mockResolvedValue({});
    const out = await runAnalyzers({ reportData, llmKey, blocks: only("sectionSummaries") });
    expect(out.sectionSummaries!.abstained).toBe(true);
    expect(out.sectionSummaries!.payload).toBeNull();
  });

  it("nulls a suggestedOwner that is not an allowed org member", async () => {
    mockGenerate.mockResolvedValue({
      object: {
        actions: [
          { action: "Assign the unevidenced controls.", suggestedOwner: "ghost@nowhere.com", priority: "high", rationale: "Unevidenced." },
          { action: "Review the risk register.", suggestedOwner: "alice@acme.com", priority: "medium", rationale: "Stale entries." },
        ],
        abstain_reason: null,
      },
      attempts: 1,
      selfCorrected: false,
    });

    // recommendedActions is a Stage 2 consumer, so sectionSummaries must be on
    // or it abstains before the owner sanitizer is ever reached.
    const out = await runAnalyzers({
      reportData,
      llmKey,
      blocks: only("sectionSummaries", "recommendedActions"),
      allowedOwners: ["alice@acme.com"],
    });

    expect(out.recommendedActions!.payload.actions[0].suggestedOwner).toBeNull();
    expect(out.recommendedActions!.payload.actions[1].suggestedOwner).toBe("alice@acme.com");
  });

  it("matches an allowed owner case-insensitively", async () => {
    // Mutation guard: deleting sanitizeOwners' .toLowerCase() calls passes
    // every other test here because they all compare identical casing. Real
    // data doesn't: the DB stores "alice@acme.com" while the model may echo
    // back "Alice@Acme.com".
    mockGenerate.mockResolvedValue({
      object: {
        actions: [
          { action: "Notify the owner.", suggestedOwner: "Alice@Acme.com", priority: "high", rationale: "Casing differs from the DB record." },
        ],
        abstain_reason: null,
      },
      attempts: 1,
      selfCorrected: false,
    });

    const out = await runAnalyzers({
      reportData,
      llmKey,
      blocks: only("sectionSummaries", "recommendedActions"),
      allowedOwners: ["alice@acme.com"],
    });

    expect(out.recommendedActions!.payload.actions[0].suggestedOwner).toBe("Alice@Acme.com");
  });
});
