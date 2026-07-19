import { mapAnalysesToSummaries } from "../mapToSummaries";

const ok = (payload: any) => ({ payload, abstained: false, abstain_reason: null, model: "m", attempts: 1 });
const abstained = { payload: null, abstained: true, abstain_reason: "no data", model: "m", attempts: 0 };

describe("mapAnalysesToSummaries", () => {
  it("carries per-section summaries onto the render contract", () => {
    const out = mapAnalysesToSummaries({
      sectionSummaries: ok({ summaries: { projectRisks: "P", compliance: "C" } }),
    } as any);
    expect(out.sectionSummaries).toEqual({ projectRisks: "P", compliance: "C" });
  });

  it("always returns a sectionSummaries object even with no analyses", () => {
    // The renderers index into it unguarded in places; undefined would throw.
    expect(mapAnalysesToSummaries({} as any).sectionSummaries).toEqual({});
  });

  it("drops abstained sections rather than rendering an empty block", () => {
    const out = mapAnalysesToSummaries({
      executiveSummary: abstained,
      sectionSummaries: abstained,
    } as any);
    expect(out.executiveSummary).toBeUndefined();
    expect(out.sectionSummaries).toEqual({});
  });

  it("maps riskAnalysis onto riskHighlights so the existing box keeps rendering", () => {
    const out = mapAnalysesToSummaries({
      riskAnalysis: ok({ narrative: "N", top_risks: [] }),
    } as any);
    expect(out.riskHighlights).toBe("N");
    expect(out.riskAnalysis).toEqual({ narrative: "N", top_risks: [] });
  });

  it("populates both the structured actions and the legacy string list", () => {
    const out = mapAnalysesToSummaries({
      recommendedActions: ok({ actions: [{ action: "Do X", suggestedOwner: null, priority: "high", rationale: "R" }] }),
    } as any);
    expect(out.recommendations).toEqual(["Do X"]);
    expect(out.recommendedActions?.[0].suggestedOwner).toBeUndefined();
  });
});
