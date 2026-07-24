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

  it("gives findings, actions, rationales, gaps and concerns room for a mechanism, a value and an effect", () => {
    const long = "x".repeat(450);

    const finding = {
      text: long,
      section: "compliance",
      severity: "high",
      basis: "observed",
      what_would_close_this: "Evidence is attached to each of the twelve controls.",
      related_sections: [],
    };
    expect(keyFindingsSchema.parse({ findings: [finding], abstain_reason: null }).findings[0].text).toHaveLength(450);
    expect(() =>
      keyFindingsSchema.parse({ findings: [{ ...finding, text: "x".repeat(601) }], abstain_reason: null }),
    ).toThrow();

    const action = {
      action: long,
      suggestedOwner: null,
      priority: "high",
      rationale: long,
      basis: "observed",
    };
    expect(recommendedActionsSchema.parse({ actions: [action], abstain_reason: null }).actions[0].rationale).toHaveLength(450);
    expect(() =>
      recommendedActionsSchema.parse({ actions: [{ ...action, action: "x".repeat(601) }], abstain_reason: null }),
    ).toThrow();
    expect(() =>
      recommendedActionsSchema.parse({ actions: [{ ...action, rationale: "x".repeat(601) }], abstain_reason: null }),
    ).toThrow();

    const gapPayload = {
      narrative: "Readiness is uneven across the control set and two families lag the rest.",
      gaps: [
        {
          control: "AC-12 Access Review",
          gap: long,
          priority: "high",
          basis: "absent",
          what_would_close_this: "An approved access-review record is attached to AC-12.",
        },
      ],
      scores_caveat: null,
      abstain_reason: null,
    };
    expect(complianceGapSchema.parse(gapPayload).gaps[0].gap).toHaveLength(450);
    expect(() =>
      complianceGapSchema.parse({ ...gapPayload, gaps: [{ ...gapPayload.gaps[0], gap: "x".repeat(601) }] }),
    ).toThrow();

    const concernPayload = {
      narrative: "Third-party exposure is concentrated in a single unreviewed supplier.",
      concerns: [{ vendor: "Acme Corp", concern: long, severity: "high", basis: "observed" }],
      abstain_reason: null,
    };
    expect(vendorRiskSchema.parse(concernPayload).concerns[0].concern).toHaveLength(450);
    expect(() =>
      vendorRiskSchema.parse({ ...concernPayload, concerns: [{ ...concernPayload.concerns[0], concern: "x".repeat(601) }] }),
    ).toThrow();
  });

  it("leaves the prose caps alone — the row caps were what was binding", () => {
    expect(executiveSummarySchema.parse({ summary: "x".repeat(3500), abstain_reason: null }).summary).toHaveLength(3500);
    expect(() => executiveSummarySchema.parse({ summary: "x".repeat(3501), abstain_reason: null })).toThrow();
    expect(
      riskAnalysisSchema.parse({ narrative: "x".repeat(2500), top_risks: [], abstain_reason: null }).narrative,
    ).toHaveLength(2500);
    expect(() =>
      riskAnalysisSchema.parse({ narrative: "x".repeat(2501), top_risks: [], abstain_reason: null }),
    ).toThrow();
  });

  /**
   * In this codebase the .describe() text IS the prompt, so the calibration
   * anchors are only real if they are in it. Modelled on
   * advisor/evidenceAnalyzer/prompts.ts, which carries 25 written grade
   * anchors and an explicit anti-inflation rule; this is the small version.
   */
  describe("severity and priority calibration", () => {
    const severityField = (keyFindingsSchema.shape.findings as any).element.shape.severity;
    const priorityField = (recommendedActionsSchema.shape.actions as any).element.shape.priority;

    it("keeps the four levels exactly as they are", () => {
      expect(severityField.options).toEqual(["low", "medium", "high", "critical"]);
      expect(priorityField.options).toEqual(["low", "medium", "high", "critical"]);
    });

    it("writes one anchor per severity level plus an anti-inflation rule", () => {
      const text = severityField.description as string;
      for (const level of ["critical:", "high:", "medium:", "low:"]) {
        expect(text).toContain(level);
      }
      expect(text).toContain("choose the LOWER");
      // The live corpus rated "20 of 22 training records are demo-seed" as
      // critical. Volume is not severity, and the anchor text has to say so.
      expect(text).toContain("a hundred low items stay low");
      // The pre-existing vocabulary mapping and anti-invention rule survive.
      expect(text).toContain("map 'Very High' to critical");
      expect(text).toContain("Never invent a level");
    });

    it("writes one anchor per priority level plus an anti-inflation rule", () => {
      const text = priorityField.description as string;
      for (const level of ["critical:", "high:", "medium:", "low:"]) {
        expect(text).toContain(level);
      }
      expect(text).toContain("choose the LOWER");
      expect(text).toContain("order of work");
    });

    it("shares the calibrated severity text with gaps[].priority and concerns[].severity", () => {
      const gapPriority = (complianceGapSchema.shape.gaps as any).element.shape.priority;
      const concernSeverity = (vendorRiskSchema.shape.concerns as any).element.shape.severity;
      expect(gapPriority.description).toBe(severityField.description);
      expect(concernSeverity.description).toBe(severityField.description);
    });
  });
});
