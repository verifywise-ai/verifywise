const mockControlScores = jest.fn();
const mockWeakest = jest.fn();
const mockFrameworkScore = jest.fn();

jest.mock("../../../../utils/readiness.utils", () => ({
  getControlScoresQuery: (...a: any[]) => mockControlScores(...a),
  getWeakestControlsQuery: (...a: any[]) => mockWeakest(...a),
  getFrameworkScoreByTypeQuery: (...a: any[]) => mockFrameworkScore(...a),
}));

// Must be mocked too: evidenceAi.utils imports the real sequelize instance at
// module load (evidenceAi.utils.ts:1), so leaving it unmocked opens a DB
// connection during the unit test.
const mockGaps = jest.fn();
jest.mock("../../../../utils/evidenceAi.utils", () => ({
  getEvidenceGapsQuery: (...a: any[]) => mockGaps(...a),
}));

// Same reason: reportRunAnalysis.utils imports the real sequelize instance at
// module load (reportRunAnalysis.utils.ts:1).
const mockPriorFacts = jest.fn();
jest.mock("../../../../utils/reportRunAnalysis.utils", () => ({
  getPriorFactsSnapshotQuery: (...a: any[]) => mockPriorFacts(...a),
}));

// collectAnalyzerInputs now imports ./facts, which imports isoDate from
// dataCollector, which imports the real sequelize instance at module load.
jest.mock("../../../../database/db", () => ({ sequelize: {} }));

import {
  collectReadinessInput,
  collectEvidenceGapsInput,
  collectAllowedOwners,
  collectFactsInput,
  collectPriorFacts,
  resolveBlocks,
} from "../collectAnalyzerInputs";

describe("collectAnalyzerInputs", () => {
  beforeEach(() => {
    mockControlScores.mockReset().mockResolvedValue([{ control_id: 1, overall_score: 25 }]);
    mockWeakest.mockReset().mockResolvedValue([{ control_id: 1, framework_type: "eu_ai_act" }]);
    mockFrameworkScore.mockReset().mockResolvedValue({ avg_score: 40 });
    mockGaps.mockReset().mockResolvedValue([{ control_id: 1, gap_type: "no_evidence" }]);
    mockPriorFacts.mockReset().mockResolvedValue(null);
  });

  it("skips the evidence-gap query for a framework it does not cover", async () => {
    // iso_27001 is outside GAP_SUPPORTED_FRAMEWORKS. Calling anyway returns EU
    // rows mislabeled with the requested type (evidenceAi.utils.ts:170-172).
    const out = await collectEvidenceGapsInput(3, 5);
    expect(mockGaps).not.toHaveBeenCalled();
    expect(out).toEqual({ gaps: [], frameworkUnsupported: true });
  });

  it("queries evidence gaps for a covered framework", async () => {
    const out = await collectEvidenceGapsInput(1, 5);
    expect(mockGaps).toHaveBeenCalledWith(5, "eu_ai_act");
    expect(out.frameworkUnsupported).toBe(false);
    expect(out.gaps).toHaveLength(1);
  });

  it("does NOT query readiness without a projectId, and says why", async () => {
    const out = await collectReadinessInput(0, 1, 5, null);
    expect(mockControlScores).not.toHaveBeenCalled();
    expect(mockWeakest).not.toHaveBeenCalled();
    expect(out.stale).toBe(true);
    expect(out.controlScores).toEqual([]);
  });

  it("passes frameworkType first to the two scoped queries and orgId first to weakest", async () => {
    await collectReadinessInput(3, 1, 5, 11);
    expect(mockControlScores).toHaveBeenCalledWith("eu_ai_act", 5, 3, 11);
    expect(mockFrameworkScore).toHaveBeenCalledWith("eu_ai_act", 5, 3, 11);
    // 4 args, limit 100: HEAD's getWeakestControlsQuery cannot filter by
    // framework, so we over-fetch and narrow client-side.
    expect(mockWeakest).toHaveBeenCalledWith(5, 100, 3, 11);
  });

  it("keeps only the requested framework's weakest controls, capped at 10", async () => {
    // The query returns the weakest across ALL frameworks. Narrowing to 10
    // first would have left a handful of rows and read as "almost no weak
    // controls" for this framework.
    mockWeakest.mockResolvedValue([
      ...Array.from({ length: 12 }, (_, i) => ({
        control_id: i,
        framework_type: "eu_ai_act",
      })),
      { control_id: 99, framework_type: "iso_42001" },
    ]);

    const out = await collectReadinessInput(3, 1, 5, 11);

    expect(out.weakestControls).toHaveLength(10);
    expect(out.weakestControls.every((r: any) => r.framework_type === "eu_ai_act")).toBe(true);
    expect(out.weakestControls.map((r: any) => r.control_id)).not.toContain(99);
  });

  it("returns an empty, non-throwing result for an unknown frameworkId", async () => {
    const out = await collectReadinessInput(3, 99, 5, 11);
    expect(mockControlScores).not.toHaveBeenCalled();
    expect(out.controlScores).toEqual([]);
  });

  it("degrades to an empty result when a readiness query throws", async () => {
    mockControlScores.mockRejectedValue(new Error("db down"));
    const out = await collectReadinessInput(3, 1, 5, 11);
    expect(out.controlScores).toEqual([]);
    expect(out.stale).toBe(true);
  });

  it("harvests owner names that actually appear in the report data", () => {
    const owners = collectAllowedOwners({
      sections: {
        projectRisks: { risks: [{ owner: "Alice" }, { owner: "Bob" }] },
        vendors: { vendors: [{ assignee: "Carol" }] },
      },
    } as any);
    expect(owners).toEqual(expect.arrayContaining(["Alice", "Bob", "Carol"]));
  });

  it("harvests approvers from the models section — its omission is why every action had a null owner", () => {
    // dataCollector.collectModelsList emits `approver` as a resolved name
    // string; model_inventories has no owner column. Leaving the section out
    // meant sanitizeOwners nulled any model approver the analyzer proposed.
    const owners = collectAllowedOwners({
      sections: {
        models: {
          totalModels: 2,
          models: [
            { id: 1, name: "gpt-4o", approver: "Dana Reed" },
            { id: 2, name: "claude" },
          ],
        },
      },
    } as any);
    expect(owners).toEqual(["Dana Reed"]);
  });

  it("resolves manual runs to the blocks that reproduce today's aiSummarizer output", () => {
    expect(resolveBlocks({ aiEnhanced: true } as any)).toEqual({
      sectionSummaries: true,
      executiveSummary: true,
      keyFindings: true,
      recommendedActions: true,
      riskAnalysis: true,
      complianceGap: false,
      vendorRisk: false,
    });
  });

  it("leaves the two new project-scoped analyzers off for manual runs", () => {
    const blocks = resolveBlocks({ aiEnhanced: true } as any);
    expect(blocks.complianceGap).toBe(false);
    expect(blocks.vendorRisk).toBe(false);
  });

  it("prefers an explicit aiBlocks over the legacy default", () => {
    const blocks = resolveBlocks({ aiEnhanced: true, aiBlocks: { sectionSummaries: false, executiveSummary: false, keyFindings: false, recommendedActions: false, riskAnalysis: true, complianceGap: false, vendorRisk: false } } as any);
    expect(blocks.riskAnalysis).toBe(true);
    expect(blocks.executiveSummary).toBe(false);
    expect(blocks.sectionSummaries).toBe(false);
  });

  it("enables nothing when aiEnhanced is false", () => {
    expect(Object.values(resolveBlocks({ aiEnhanced: false } as any)).every((v) => v === false)).toBe(true);
  });

  it("§1 — builds the facts block and returns the snapshot for a later run to diff against", () => {
    const out = collectFactsInput({
      metadata: {
        // Local components: isoDate reads local components, so this fixture
        // expects the same day in every timezone the suite runs in.
        generatedAt: new Date(2026, 6, 22),
        frameworkName: "ISO 42001",
        projectTitle: "Acme",
      },
      charts: {},
      sections: {
        policyManager: {
          totalPolicies: 2,
          policies: [
            { policyName: "Acceptable use", status: "Draft", owner: "Bob" },
            { policyName: "Model release", status: "Approved", reviewDate: "1/1/2026", owner: "Bob" },
          ],
        },
      },
    } as any);

    // The snapshot is what §10 persists to audit_metadata, so the caller needs
    // it alongside the rendered text.
    expect(out.snapshot.generatedAt).toBe("2026-07-22");
    expect(out.snapshot.sections.policyManager.status_Draft).toBe(1);
    expect(out.facts).toContain("Reference date: 2026-07-22");
    expect(out.facts).toContain("[Policy Manager]");
    expect(out.facts).toContain("Acceptable use");
  });

  it("§10 — renders the delta when a prior snapshot is supplied", () => {
    const rd: any = {
      metadata: { generatedAt: new Date(2026, 6, 22), frameworkName: "ISO 42001", projectTitle: "Acme" },
      charts: {},
      sections: { policyManager: { totalPolicies: 2, policies: [{ policyName: "A" }, { policyName: "B" }] } },
    };
    const prior = collectFactsInput({ ...rd, sections: { policyManager: { totalPolicies: 1, policies: [{ policyName: "A" }] } } }).snapshot;

    expect(collectFactsInput(rd, prior).facts).toContain("totalPolicies: 2 (was 1, +1)");
    expect(collectFactsInput(rd).facts).not.toContain("Change since");
  });

  it("does not query for a prior snapshot when the run belongs to no schedule", async () => {
    // A manual run has no predecessor by construction. Skipping the query is
    // the whole of "degrade to prior = null silently".
    expect(await collectPriorFacts(undefined, 5)).toBeNull();
    expect(mockPriorFacts).not.toHaveBeenCalled();
  });

  it("returns the stored snapshot for the schedule, scoped to the organization", async () => {
    const stored = {
      generatedAt: "2026-06-01T00:00:00.000Z",
      framework: "EU AI Act",
      subject: "Test Project",
      sections: { projectRisks: { totalRisks: 41 } },
    };
    mockPriorFacts.mockResolvedValue(stored);

    expect(await collectPriorFacts(12, 5)).toEqual(stored);
    expect(mockPriorFacts).toHaveBeenCalledWith(12, 5);
  });

  it("degrades to no comparison when the lookup throws", async () => {
    // One extra read on the report path must never cost the report.
    mockPriorFacts.mockRejectedValue(new Error("db down"));
    expect(await collectPriorFacts(12, 5)).toBeNull();
  });

  it("rejects a stored value that is not a facts snapshot", async () => {
    // audit_metadata is unconstrained JSONB written by an earlier analyzer
    // version. A malformed prior must read as "no prior", never reach
    // renderFacts and throw inside the analysis path.
    mockPriorFacts.mockResolvedValue({ foo: 1 });
    expect(await collectPriorFacts(12, 5)).toBeNull();

    mockPriorFacts.mockResolvedValue("report-analyzer-v1");
    expect(await collectPriorFacts(12, 5)).toBeNull();

    mockPriorFacts.mockResolvedValue({ generatedAt: "2026-06-01T00:00:00.000Z" });
    expect(await collectPriorFacts(12, 5)).toBeNull();
  });
});
