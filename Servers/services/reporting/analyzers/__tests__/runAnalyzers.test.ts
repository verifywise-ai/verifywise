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
import { complianceGapSchema } from "../schemas";

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

  it("bounds each ATTEMPT with its own 60s timeout, allows two corrections, and states an output budget", async () => {
    await runAnalyzers({ reportData, llmKey, blocks: only("riskAnalysis") });

    const params = mockGenerate.mock.calls[0][0];
    // timeoutMs, not extra.abortSignal: one pre-built signal is shared by the
    // first call and its retries, so a deeper (slower) analysis aborts and
    // degrades into a generic abstention.
    expect(params.timeoutMs).toBe(60_000);
    // Two, not one. basis and what_would_close_this are new required keys on
    // four analyzers; one correction turns a second omission into
    // "this analysis could not be produced because the AI service call
    // failed". Each attempt now has its own 60s budget, so a second is safe.
    expect(params.maxSelfCorrectionAttempts).toBe(2);
    // Nothing was passed before, so the output ceiling was whatever the
    // provider happened to default to — the same silence that truncated a
    // section summary mid-sentence and went unnoticed for two runs. runOne is
    // shared by both stages, so this one pin covers all six analyzers.
    // 2000 sized the JSON alone, and a reasoning model bills its reasoning
    // against the same ceiling: run 4 lost all five large-schema analyzers to
    // NoObjectGeneratedError before a character of JSON was emitted.
    expect(params.extra).toEqual({ maxOutputTokens: 6000 });
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
    // summaries are an input dependency of Stage 2, so they must be produced
    // whenever a consumer needs them, regardless of the sectionSummaries
    // block flag. That flag only governs whether summaries are recorded as
    // their own result — gating production on it would make executiveSummary
    // always abstain whenever sectionSummaries itself is off.
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

  // ---- provenance guard -------------------------------------------------
  // zod validates shape, not origin: a fabricated control id / vendor name /
  // risk name passes .strict() cleanly. These check that such a row is dropped
  // post-parse while everything genuine survives.

  const gapRow = (control: string) => ({
    control,
    gap: "No evidence attached to this control.",
    priority: "high",
  });

  it("drops a complianceGap gap whose control is absent from the input, keeping the rest", async () => {
    mockGenerate.mockResolvedValue({
      object: {
        narrative: "Readiness is uneven across the control set.",
        gaps: [gapRow("AC-12 Access Review"), gapRow("SC-99 Invented Control")],
        scores_caveat: null,
        abstain_reason: null,
      },
      attempts: 1,
      selfCorrected: false,
    });

    const withControls: any = {
      ...reportData,
      sections: { compliance: { controls: [{ id: 1, title: "AC-12 Access Review" }] } },
    };

    const out = await runAnalyzers({
      reportData: withControls,
      llmKey,
      blocks: only("complianceGap"),
    });

    expect(out.complianceGap!.payload.gaps).toHaveLength(1);
    expect(out.complianceGap!.payload.gaps[0].control).toBe("AC-12 Access Review");
    // The rest of the payload must survive the strip untouched.
    expect(out.complianceGap!.payload.narrative).toBe("Readiness is uneven across the control set.");
    expect(out.complianceGap!.abstained).toBe(false);
  });

  it("passes a control through untouched when it differs from the input only by case and whitespace", async () => {
    // Mutation guard: dropping the normalisation makes this fail while the
    // exact-match test above still passes.
    mockGenerate.mockResolvedValue({
      object: {
        narrative: "Readiness is uneven across the control set.",
        gaps: [gapRow("  ac-12   ACCESS   review ")],
        scores_caveat: null,
        abstain_reason: null,
      },
      attempts: 1,
      selfCorrected: false,
    });

    const withControls: any = {
      ...reportData,
      sections: { compliance: { controls: [{ id: 1, title: "AC-12 Access Review" }] } },
    };

    const out = await runAnalyzers({
      reportData: withControls,
      llmKey,
      blocks: only("complianceGap"),
    });

    expect(out.complianceGap!.payload.gaps).toHaveLength(1);
    expect(out.complianceGap!.payload.gaps[0].control).toBe("  ac-12   ACCESS   review ");
  });

  it("still drops an invented control when the model labels the claim basis 'inferred'", async () => {
    // The CRITICAL Phase 3 invariant. `basis` labels the CLAIM; it does not
    // relax the requirement that the row's SUBJECT appear verbatim in the
    // analyzer's own prompt. Built through the real schema so the fixture
    // cannot drift from what the model is actually allowed to emit.
    const object = complianceGapSchema.parse({
      narrative: "Readiness is uneven across the control set and two families lag the rest.",
      gaps: [
        {
          control: "AC-12 Access Review",
          gap: "No evidence is attached to this control.",
          priority: "high",
          basis: "observed",
          what_would_close_this: "An approved access-review record is attached to AC-12.",
        },
        {
          control: "SC-99 Invented Control",
          gap: "The control family appears to lack a documented owner.",
          priority: "critical",
          basis: "inferred",
          what_would_close_this: "A named owner is recorded against the control family.",
        },
      ],
      scores_caveat: null,
      abstain_reason: null,
    });
    mockGenerate.mockResolvedValue({ object, attempts: 1, selfCorrected: false });

    const withControls: any = {
      ...reportData,
      sections: { compliance: { controls: [{ id: 1, title: "AC-12 Access Review" }] } },
    };

    const out = await runAnalyzers({
      reportData: withControls,
      llmKey,
      blocks: only("complianceGap"),
    });

    expect(out.complianceGap!.payload.gaps).toHaveLength(1);
    expect(out.complianceGap!.payload.gaps[0].control).toBe("AC-12 Access Review");
    expect(out.complianceGap!.payload.gaps[0].basis).toBe("observed");
    expect(out.complianceGap!.payload.gaps[0].what_would_close_this).toBe(
      "An approved access-review record is attached to AC-12.",
    );
  });

  it("drops a vendorRisk concern naming a vendor that is not in the input", async () => {
    mockGenerate.mockResolvedValue({
      object: {
        narrative: "Third-party exposure is concentrated in one supplier.",
        concerns: [
          { vendor: "acme corp", concern: "No DPA on file for this vendor.", severity: "high" },
          { vendor: "Globex Ltd", concern: "No security review on record.", severity: "critical" },
        ],
        abstain_reason: null,
      },
      attempts: 1,
      selfCorrected: false,
    });

    const out = await runAnalyzers({ reportData, llmKey, blocks: only("vendorRisk") });

    // "Acme Corp" is in reportData.sections.vendors; "Globex Ltd" is invented.
    expect(out.vendorRisk!.payload.concerns).toHaveLength(1);
    expect(out.vendorRisk!.payload.concerns[0].vendor).toBe("acme corp");
    expect(out.vendorRisk!.payload.narrative).toBe(
      "Third-party exposure is concentrated in one supplier.",
    );
  });

  it("drops a riskAnalysis top risk whose name is not in the input", async () => {
    mockGenerate.mockResolvedValue({
      object: {
        narrative: "Risk coverage is thin across the register.",
        top_risks: [
          { name: "R1", level: "High", why: "It is the only scored use-case risk." },
          { name: "Uncontrolled model drift", level: "Critical", why: "Invented by the model." },
        ],
        abstain_reason: null,
      },
      attempts: 1,
      selfCorrected: false,
    });

    const out = await runAnalyzers({ reportData, llmKey, blocks: only("riskAnalysis") });

    expect(out.riskAnalysis!.payload.top_risks).toHaveLength(1);
    expect(out.riskAnalysis!.payload.top_risks[0].name).toBe("R1");
  });

  it("still produces a result when every item is stripped, rather than throwing", async () => {
    // The Phase 2 rule: a fabricated row costs that row, never the report.
    mockGenerate.mockResolvedValue({
      object: {
        narrative: "Third-party exposure could not be tied to a named supplier.",
        concerns: [
          { vendor: "Globex Ltd", concern: "No security review on record.", severity: "high" },
          { vendor: "Initech", concern: "No DPA on file.", severity: "medium" },
        ],
        abstain_reason: null,
      },
      attempts: 1,
      selfCorrected: false,
    });

    const out = await runAnalyzers({ reportData, llmKey, blocks: only("vendorRisk") });

    expect(out.vendorRisk!.payload.concerns).toEqual([]);
    expect(out.vendorRisk!.abstained).toBe(false);
    expect(out.vendorRisk!.payload.narrative).toBe(
      "Third-party exposure could not be tied to a named supplier.",
    );
  });

  it("leaves analyzers with no verbatim-marked list alone", async () => {
    // executiveSummary has no such field; the guard must not reshape its payload.
    mockGenerate.mockResolvedValue({
      object: { summary: "Overall posture is adequate.", abstain_reason: null },
      attempts: 1,
      selfCorrected: false,
    });

    const out = await runAnalyzers({
      reportData,
      llmKey,
      blocks: only("sectionSummaries", "executiveSummary"),
    });

    expect(out.executiveSummary!.payload).toEqual({
      summary: "Overall posture is adequate.",
      abstain_reason: null,
    });
  });

  // ---- shallowness gate (§6) -------------------------------------------

  const SUMMARY_BLOCK =
    "The Policy Manager section comprises 14 policies, of which 9 remain in draft status and 5 have been approved. Ownership is recorded for 11 of the 14 policies; the remaining 3 carry no assigned owner at all. The most recent approval was recorded on 12 March 2026, and 6 of the approved policies list a review date that has already passed. Tagging is inconsistent: 4 policies carry no tag, while the Data Protection tag is applied to 5 separate documents that differ in scope. Two policies share the same title under different identifiers, which suggests a duplicate that was never retired.";
  // Measured against the rendered prompt block: RESTATED 0.84, ANALYSED 0.34.
  const RESTATED = SUMMARY_BLOCK.replace("comprises", "consists of") +
    " Overall the organization maintains a policy set that requires continued attention from governance stakeholders.";
  const ANALYSED =
    "Sixty-four percent of the policy set has never cleared approval, and the five that did are already ageing: six carry a review date behind the 12 March 2026 reference point, so the approved population is smaller than the raw count suggests. Every record names its own drafter as approver, which is the most economical explanation for a duplicated title surviving unretired, and the three ownerless drafts have nobody to trigger the review that would catch it.";

  /** executiveSummary over one section summary — the run-2 failure's shape. */
  const restatingRun = () => {
    mockSectionSummaries.mockResolvedValue({ policyManager: SUMMARY_BLOCK });
    return runAnalyzers({
      reportData,
      llmKey,
      blocks: only("sectionSummaries", "executiveSummary"),
    });
  };

  it("re-issues once with a corrective directive when the prose restates its input", async () => {
    mockGenerate
      .mockResolvedValueOnce({ object: { summary: RESTATED, abstain_reason: null }, attempts: 1, selfCorrected: false })
      .mockResolvedValueOnce({ object: { summary: ANALYSED, abstain_reason: null }, attempts: 1, selfCorrected: false });

    const out = await restatingRun();

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = mockGenerate.mock.calls;
    expect(secondCall[0].system).toContain("RESTATEMENT DETECTED");
    expect(firstCall[0].system).not.toContain("RESTATEMENT DETECTED");
    // Same question, re-asked. Only the system prompt changes.
    expect(secondCall[0].prompt).toBe(firstCall[0].prompt);
    // The re-issue gets the same guardrails as the first call, including its
    // own fresh timeout budget. Asserted relative to the first call so this
    // test does not re-pin the values Phases 1 and 3 own.
    expect(secondCall[0].timeoutMs).toBe(firstCall[0].timeoutMs);
    expect(secondCall[0].maxSelfCorrectionAttempts).toBe(firstCall[0].maxSelfCorrectionAttempts);
    expect(secondCall[0].extra).toEqual(firstCall[0].extra);
    expect(out.executiveSummary!.payload.summary).toBe(ANALYSED);
    expect(out.executiveSummary!.restatementRetried).toBe(true);
    expect(out.executiveSummary!.attempts).toBe(2);
  });

  it("keeps the first payload when the re-issue restates its input as well", async () => {
    // Invariant: the gate must never turn a produced analysis into a lost one.
    mockGenerate
      .mockResolvedValueOnce({ object: { summary: RESTATED, abstain_reason: null }, attempts: 1, selfCorrected: false })
      .mockResolvedValueOnce({ object: { summary: SUMMARY_BLOCK, abstain_reason: null }, attempts: 1, selfCorrected: false });

    const out = await restatingRun();

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(out.executiveSummary!.payload.summary).toBe(RESTATED);
    expect(out.executiveSummary!.abstained).toBe(false);
    expect(out.executiveSummary!.restatementRetried).toBe(true);
  });

  it("keeps the first payload when the re-issue abstains", async () => {
    // The directive invites an abstention ("If the data genuinely cannot
    // support that, set abstain_reason and say so plainly"), and an
    // abstention's prose is far too short to trip isRestatement — so the
    // novelty guard alone would let it REPLACE a payload that was produced,
    // and mapAnalysesToSummaries drops abstained payloads out of the report.
    // A re-issue that abstains produced no new analysis; that is the same
    // second failure as a re-issue that restates.
    mockGenerate
      .mockResolvedValueOnce({ object: { summary: RESTATED, abstain_reason: null }, attempts: 1, selfCorrected: false })
      .mockResolvedValueOnce({
        object: { summary: "The supplied data cannot support a deeper reading.", abstain_reason: "insufficient detail in the policy section" },
        attempts: 1,
        selfCorrected: false,
      });

    const out = await restatingRun();

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(out.executiveSummary!.payload.summary).toBe(RESTATED);
    expect(out.executiveSummary!.abstained).toBe(false);
    expect(out.executiveSummary!.abstain_reason).toBeNull();
    expect(out.executiveSummary!.restatementRetried).toBe(true);
    // The re-issue was still billed.
    expect(out.executiveSummary!.attempts).toBe(2);
  });

  it("keeps the first payload when the re-issue throws", async () => {
    mockGenerate
      .mockResolvedValueOnce({ object: { summary: RESTATED, abstain_reason: null }, attempts: 1, selfCorrected: false })
      .mockRejectedValueOnce(new Error("llm exploded"));

    const out = await restatingRun();

    expect(out.executiveSummary!.payload.summary).toBe(RESTATED);
    expect(out.executiveSummary!.abstained).toBe(false);
    expect(out.executiveSummary!.restatementRetried).toBe(true);
    // audit_metadata must not record restatement_retried:true beside the
    // attempt count of a run that never re-issued. A re-issue that exhausts
    // its budget and rethrows still spent provider calls.
    expect(out.executiveSummary!.attempts).toBeGreaterThan(1);
    // Not the generic AI-service-failed abstention: the throw happened inside
    // runOne's own try, so collect()'s rejected branch is never reached and
    // the three verbatim abstain strings stay authoritative.
    expect(out.executiveSummary!.abstain_reason).toBeNull();
  });

  it("does not re-issue for prose that analyses its input", async () => {
    mockGenerate.mockResolvedValue({ object: { summary: ANALYSED, abstain_reason: null }, attempts: 1, selfCorrected: false });

    const out = await restatingRun();

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(out.executiveSummary!.payload.summary).toBe(ANALYSED);
    expect(out.executiveSummary!.restatementRetried).toBe(false);
  });

  it("does not re-issue an abstention, however closely it echoes the input", async () => {
    // Invariant 5: abstention stays cheap. Paying a second call to make an
    // honest abstention wordier is exactly the padding this must not buy.
    mockGenerate.mockResolvedValue({
      object: { summary: RESTATED, abstain_reason: "the policy section carries no approval dates" },
      attempts: 1,
      selfCorrected: false,
    });

    const out = await restatingRun();

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(out.executiveSummary!.abstained).toBe(true);
    expect(out.executiveSummary!.restatementRetried).toBe(false);
  });
});
