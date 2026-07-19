import {
  executiveSummarySchema,
  keyFindingsSchema,
  recommendedActionsSchema,
  riskAnalysisSchema,
  complianceGapSchema,
  vendorRiskSchema,
} from "../schemas";

describe("analyzer schemas", () => {
  it("executiveSummary accepts a valid payload", () => {
    const parsed = executiveSummarySchema.parse({
      summary: "The programme demonstrates partial coverage of the required controls across all assessed domains.",
      abstain_reason: null,
    });
    expect(parsed.abstain_reason).toBeNull();
  });

  it("executiveSummary accepts the abstain path", () => {
    const parsed = executiveSummarySchema.parse({
      summary: "There is insufficient data in this report to support an executive summary.",
      abstain_reason: "No sections contained any records.",
    });
    expect(parsed.abstain_reason).toBe("No sections contained any records.");
  });

  it("rejects unknown keys (strict)", () => {
    expect(() =>
      executiveSummarySchema.parse({
        summary: "The programme demonstrates partial coverage of the required controls.",
        abstain_reason: null,
        hallucinated_field: true,
      }),
    ).toThrow();
  });

  it("keyFindings caps the array and requires a section key", () => {
    const parsed = keyFindingsSchema.parse({
      findings: [{ text: "Twelve controls have no evidence attached.", section: "compliance", severity: "high" }],
      abstain_reason: null,
    });
    expect(parsed.findings[0].severity).toBe("high");
    expect(() => keyFindingsSchema.parse({ findings: [{ text: "x", section: "compliance", severity: "high" }], abstain_reason: null })).toThrow();
  });

  it("recommendedActions allows a null owner but not an unknown priority", () => {
    const parsed = recommendedActionsSchema.parse({
      actions: [{ action: "Attach evidence to the twelve uncovered controls.", suggestedOwner: null, priority: "high", rationale: "These controls are unevidenced." }],
      abstain_reason: null,
    });
    expect(parsed.actions[0].suggestedOwner).toBeNull();
    expect(() =>
      recommendedActionsSchema.parse({
        actions: [{ action: "Do the thing properly.", suggestedOwner: null, priority: "urgent", rationale: "Because it matters." }],
        abstain_reason: null,
      }),
    ).toThrow();
  });

  it("riskAnalysis, complianceGap and vendorRisk each accept an abstaining payload", () => {
    // Prose fields keep their .min(40) floor even when abstaining — an abstention
    // still has to say something a reader can act on, and these strings are what
    // actually renders in the report.
    expect(riskAnalysisSchema.parse({ narrative: "No risks are recorded for this project, so no risk posture can be assessed.", top_risks: [], abstain_reason: "Empty risk register." }).top_risks).toEqual([]);
    expect(complianceGapSchema.parse({ narrative: "No readiness scores are stored for this project, so no gap analysis is possible.", gaps: [], scores_caveat: "Readiness has never been calculated for this project.", abstain_reason: "No stored readiness rows." }).gaps).toEqual([]);
    expect(vendorRiskSchema.parse({ narrative: "No vendors are registered against this project, so there is no exposure to assess.", concerns: [], abstain_reason: "Empty vendor list." }).concerns).toEqual([]);
  });

  it("rejects a prose field too short to be a usable sentence", () => {
    expect(() => executiveSummarySchema.parse({ summary: "ok", abstain_reason: "no data" })).toThrow();
  });
});
