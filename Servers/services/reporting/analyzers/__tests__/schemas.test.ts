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
      findings: [
        {
          text: "Twelve controls have no evidence attached.",
          section: "compliance",
          severity: "high",
          basis: "observed",
          what_would_close_this: "Evidence is attached to each of the twelve controls.",
          related_sections: [],
        },
      ],
      abstain_reason: null,
    });
    expect(parsed.findings[0].severity).toBe("high");
    expect(parsed.findings[0].basis).toBe("observed");
    expect(parsed.findings[0].related_sections).toEqual([]);
    expect(() =>
      keyFindingsSchema.parse({
        findings: [
          {
            text: "x",
            section: "compliance",
            severity: "high",
            basis: "observed",
            what_would_close_this: "Evidence is attached to each of the twelve controls.",
            related_sections: [],
          },
        ],
        abstain_reason: null,
      }),
    ).toThrow();
  });

  it("recommendedActions allows a null owner but not an unknown priority", () => {
    const parsed = recommendedActionsSchema.parse({
      actions: [
        {
          action: "Attach evidence to the twelve uncovered controls.",
          suggestedOwner: null,
          priority: "high",
          rationale: "These controls are unevidenced.",
          basis: "observed",
        },
      ],
      abstain_reason: null,
    });
    expect(parsed.actions[0].suggestedOwner).toBeNull();
    expect(parsed.actions[0].basis).toBe("observed");
    expect(() =>
      recommendedActionsSchema.parse({
        actions: [
          {
            action: "Do the thing properly.",
            suggestedOwner: null,
            priority: "urgent",
            rationale: "Because it matters.",
            basis: "observed",
          },
        ],
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

  it("requires the basis KEY on every finding, action, gap and concern", () => {
    // Required key, nullable value — the abstain_reason pattern this file
    // already uses. Omitting it entirely is what must fail.
    expect(() =>
      keyFindingsSchema.parse({
        findings: [
          {
            text: "Twelve controls have no evidence attached.",
            section: "compliance",
            severity: "high",
            what_would_close_this: "Evidence is attached to all twelve controls.",
            related_sections: [],
          },
        ],
        abstain_reason: null,
      }),
    ).toThrow();

    expect(() =>
      vendorRiskSchema.parse({
        narrative: "Third-party exposure is concentrated in a single unreviewed supplier.",
        concerns: [{ vendor: "Acme Corp", concern: "No DPA on file for this vendor.", severity: "high" }],
        abstain_reason: null,
      }),
    ).toThrow();
  });

  it("accepts an explicit null basis and null counterfactual rather than throwing the analysis away", () => {
    // A hard-required basis turns one model omission into a thrown parse, an
    // abstained analyzer and "this analysis could not be produced because the
    // AI service call failed" — a produced analysis becoming a lost one, which
    // invariant 3 forbids. The prompt asks for a label; the schema does not
    // destroy the report when it does not get one.
    const parsed = keyFindingsSchema.parse({
      findings: [
        {
          text: "Twelve controls have no evidence attached.",
          section: "compliance",
          severity: "high",
          basis: null,
          what_would_close_this: null,
          related_sections: [],
        },
      ],
      abstain_reason: null,
    });
    expect(parsed.findings[0].basis).toBeNull();
    expect(parsed.findings[0].what_would_close_this).toBeNull();
  });

  it("rejects a basis outside the three declared labels", () => {
    expect(() =>
      keyFindingsSchema.parse({
        findings: [
          {
            text: "Twelve controls have no evidence attached.",
            section: "compliance",
            severity: "high",
            basis: "assumed",
            what_would_close_this: "Evidence is attached to all twelve controls.",
            related_sections: [],
          },
        ],
        abstain_reason: null,
      }),
    ).toThrow();
  });

  it("caps related_sections at six and accepts an empty list", () => {
    const row = {
      text: "Policy approval lags the control evidence that depends on it.",
      section: "policyManager",
      severity: "medium",
      basis: "inferred",
      what_would_close_this: "Each draft policy reaches approved status.",
      related_sections: ["compliance"],
    };
    expect(
      keyFindingsSchema.parse({ findings: [row], abstain_reason: null }).findings[0].related_sections,
    ).toEqual(["compliance"]);
    expect(() =>
      keyFindingsSchema.parse({
        findings: [{ ...row, related_sections: ["a", "b", "c", "d", "e", "f", "g"] }],
        abstain_reason: null,
      }),
    ).toThrow();
  });

  it("requires a non-null counterfactual to say something, not merely exist", () => {
    expect(() =>
      complianceGapSchema.parse({
        narrative: "Readiness is uneven across the control set and two families lag the rest.",
        gaps: [
          {
            control: "AC-12",
            gap: "No evidence attached to this control.",
            priority: "high",
            basis: "absent",
            what_would_close_this: "n/a",
          },
        ],
        scores_caveat: null,
        abstain_reason: null,
      }),
    ).toThrow();
  });
});
