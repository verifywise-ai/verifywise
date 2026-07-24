import { ANALYSIS_LABELS, isOperationalAbstention, mapAnalysesToSummaries } from "../mapToSummaries";

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

  it("carries structured findings alongside the flat string list", () => {
    const out = mapAnalysesToSummaries({
      keyFindings: ok({
        findings: [
          {
            text: "Only 3 of 25 models name an owner",
            section: "models",
            severity: "high",
            basis: "observed",
            related_sections: ["modelRisks"],
            what_would_close_this: "An owner recorded on every model inventory row",
          },
        ],
      }),
    } as any);

    // The flat list stays: the renderers fall back to it.
    expect(out.keyFindings).toEqual(["Only 3 of 25 models name an owner"]);
    expect(out.keyFindingsDetailed).toEqual([
      {
        text: "Only 3 of 25 models name an owner",
        section: "models",
        severity: "high",
        basis: "observed",
        related_sections: ["modelRisks"],
        what_would_close_this: "An owner recorded on every model inventory row",
      },
    ]);
  });

  it("normalises the list fields but never invents a basis", () => {
    // Two payload shapes reach here: an older row with no basis key at all, and
    // a v2 row whose nullable basis came back null. Both must render no label.
    const out = mapAnalysesToSummaries({
      keyFindings: ok({
        findings: [
          { text: "Legacy finding text", section: "compliance", severity: "low" },
          {
            text: "Nullable finding text",
            section: "compliance",
            severity: "low",
            basis: null,
            what_would_close_this: null,
          },
        ],
      }),
    } as any);

    expect(out.keyFindingsDetailed?.[0].related_sections).toEqual([]);
    expect(out.keyFindingsDetailed?.[0].what_would_close_this).toBe("");
    // Absent is absent — a defaulted "observed" would be a fabricated
    // provenance claim, which is exactly what the basis label exists to prevent.
    expect(out.keyFindingsDetailed?.[0].basis).toBeUndefined();
    expect(out.keyFindingsDetailed?.[1].basis).toBeUndefined();
    expect(out.keyFindingsDetailed?.[1].what_would_close_this).toBe("");
  });

  it("carries the action basis label and rationale onto the render contract", () => {
    const out = mapAnalysesToSummaries({
      recommendedActions: ok({
        actions: [
          {
            action: "Assign owners to the 22 ownerless models",
            suggestedOwner: null,
            priority: "high",
            rationale: "22 of 25 model rows have no owner",
            basis: "observed",
          },
        ],
      }),
    } as any);

    expect(out.recommendedActions?.[0].basis).toBe("observed");
    expect(out.recommendedActions?.[0].sourceSignal).toBe("22 of 25 model rows have no owner");
  });

  it("records stated abstention reasons and skips the ones with nothing to say", () => {
    const out = mapAnalysesToSummaries({
      riskAnalysis: abstained,
      vendorRisk: { payload: null, abstained: true, abstain_reason: null, model: "m", attempts: 0 },
      executiveSummary: ok({ summary: "Posture is uneven." }),
    } as any);

    expect(out.abstentions).toEqual({ riskAnalysis: "no data" });
  });

  it("replaces an operational failure reason with a neutral sentence", () => {
    // "the AI service call failed" tells a regulator nothing about the
    // organization's posture and everything about our infrastructure. The
    // analytical reason next to it is the reader's actual answer, so it stays
    // verbatim.
    const out = mapAnalysesToSummaries({
      riskAnalysis: {
        payload: null,
        abstained: true,
        abstain_reason: "this analysis could not be produced because the AI service call failed",
        model: "m",
        attempts: 1,
      },
      vendorRisk: {
        payload: null,
        abstained: true,
        abstain_reason: "insufficient data for this section",
        model: "m",
        attempts: 0,
      },
    } as any);

    expect(out.abstentions).toEqual({
      riskAnalysis: "This analysis was not produced.",
      vendorRisk: "insufficient data for this section",
    });
  });

  it("labels every one of the seven analyzer keys, exactly once", () => {
    // ONE map. docxGenerator imports it and pdfGenerator passes it to EJS, so a
    // renderer that gains a block cannot drift its heading away from the other.
    expect(ANALYSIS_LABELS).toEqual({
      sectionSummaries: "Section summaries",
      executiveSummary: "Executive summary",
      keyFindings: "Key findings",
      recommendedActions: "Recommended actions",
      riskAnalysis: "Risk analysis",
      complianceGap: "Compliance gap analysis",
      vendorRisk: "Third-party risk analysis",
    });
  });
});

describe("isOperationalAbstention", () => {
  it("is true for the two reasons that describe the service rather than the data", () => {
    // Both strings are pinned verbatim in runAnalyzers.test.ts; they are
    // produced at runAnalyzers.ts:332 and :212.
    expect(
      isOperationalAbstention("this analysis could not be produced because the AI service call failed"),
    ).toBe(true);
    expect(isOperationalAbstention("no LLM key is configured for this organization")).toBe(true);
  });

  it("is false for every reason that tells the reader something about the data", () => {
    for (const reason of [
      "insufficient data for this section",
      "no section summaries were available to summarise",
      "no section produced a summary",
      "the vendor list contained no third-party processors",
    ]) {
      expect(isOperationalAbstention(reason)).toBe(false);
    }
  });
});
