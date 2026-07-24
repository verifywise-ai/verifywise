import { ANALYZERS, ANALYZER_VERSION, ANALYSIS_SECTION_KEYS } from "../registry";
import { prepareSectionData, renderSections, SECTION_LABELS } from "../prompts";

describe("analyzer registry", () => {
  it("exposes exactly the six analyzers", () => {
    expect(Object.keys(ANALYZERS).sort()).toEqual(
      ["complianceGap", "executiveSummary", "keyFindings", "recommendedActions", "riskAnalysis", "vendorRisk"].sort(),
    );
    expect(ANALYSIS_SECTION_KEYS).toHaveLength(6);
  });

  it("carries a version string", () => {
    expect(ANALYZER_VERSION).toMatch(/^report-analyzer-v\d+$/);
  });

  it("every analyzer builds a non-empty system and user prompt when its own sections/summaries are present", () => {
    // The fixture must satisfy EVERY analyzer's input: riskAnalysis reads
    // projectRisks/vendorRisks/modelRisks, vendorRisk reads vendors/
    // vendorRisks, complianceGap reads compliance + the readiness extra, and
    // executiveSummary/keyFindings/recommendedActions read extras.sectionSummaries
    // (Fix 1) rather than raw sections.
    const reportData: any = {
      metadata: { frameworkName: "EU AI Act", projectTitle: "Acme", organizationId: 5 },
      sections: {
        projectRisks: { totalRisks: 1, risksByLevel: [{ level: "High", count: 1 }], risks: [{ name: "R1" }] },
        vendorRisks: { totalRisks: 1, risks: [{ riskName: "VR1" }] },
        vendors: { totalVendors: 1, vendors: [{ name: "Acme Corp" }] },
        compliance: { totalControls: 1, completedControls: 0, overallProgress: 0, controls: [{ id: 1 }] },
      },
    };
    const extras = {
      readiness: { controlScores: [{ control_id: 1, overall_score: 25 }], weakestControls: [], frameworkScore: null, stale: true },
      sectionSummaries: {
        projectRisks: "Use case risks are concentrated in one high-severity item.",
        compliance: "Compliance controls are mostly complete.",
      },
    };
    for (const def of Object.values(ANALYZERS)) {
      expect(def.buildSystemPrompt().length).toBeGreaterThan(50);
      expect(def.buildUserPrompt(reportData, extras).length).toBeGreaterThan(20);
    }
  });

  it("returns an empty prompt — not a wasted LLM call — when an analyzer has no input", () => {
    const empty: any = { metadata: { frameworkName: "EU AI Act", projectTitle: "Acme", organizationId: 5 }, sections: {} };
    for (const def of Object.values(ANALYZERS)) {
      expect(def.buildUserPrompt(empty, {})).toBe("");
    }
  });

  it("truncates long section arrays to protect the context window, and says it did", () => {
    const risks = Array.from({ length: 200 }, (_, i) => ({ name: `R${i}` }));
    const out = JSON.parse(prepareSectionData("projectRisks", { risks }));
    expect(out.risks).toHaveLength(50);
    // Silent truncation reads to the model as a complete set — the top-level
    // arrays now carry the same stamp the nested ones already did.
    expect(out._risksTruncated).toBe("showing 50 of 200");
  });

  it("ranks by materiality BEFORE truncating, so the model sees the worst rows not the oldest", () => {
    // The collector's queries order by id ASC, so a plain slice hands the
    // model 50 Low rows and cuts the Critical one sitting at index 60.
    const risks = [
      ...Array.from({ length: 60 }, (_, i) => ({ name: `Low${i}`, riskLevel: "Low" })),
      { name: "CriticalLate", riskLevel: "Critical" },
      { name: "HighLate", riskLevel: "High" },
    ];
    const out = JSON.parse(prepareSectionData("projectRisks", { risks }));
    expect(out.risks).toHaveLength(50);
    expect(out.risks[0].name).toBe("CriticalLate");
    expect(out.risks[1].name).toBe("HighLate");
    expect(out._risksTruncated).toBe("showing 50 of 62");
  });

  it("breaks severity ties by deadline and leaves unrankable rows in query order", () => {
    const risks = [
      { name: "LateHigh", riskLevel: "High", targetDate: "2026-12-01" },
      { name: "EarlyHigh", riskLevel: "High", targetDate: "2026-01-05" },
      { name: "NoLevelA" },
      { name: "NoLevelB" },
    ];
    const out = JSON.parse(prepareSectionData("projectRisks", { risks }));
    expect(out.risks.map((r: any) => r.name)).toEqual([
      "EarlyHigh",
      "LateHigh",
      "NoLevelA",
      "NoLevelB",
    ]);
    // Nothing was dropped, so nothing is stamped.
    expect(out._risksTruncated).toBeUndefined();
  });

  it("does not mutate the caller's array while ranking (the renderers get the same objects)", () => {
    const risks = [
      { name: "Low1", riskLevel: "Low" },
      { name: "Crit1", riskLevel: "Critical" },
    ];
    prepareSectionData("projectRisks", { risks });
    expect(risks.map((r) => r.name)).toEqual(["Low1", "Crit1"]);
  });

  it("keeps the twelve human-readable section labels", () => {
    expect(SECTION_LABELS.projectRisks).toBe("Use Case Risks");
    expect(Object.keys(SECTION_LABELS)).toHaveLength(12);
  });

  describe("Fix 1 — summary-consuming analyzers read extras.sectionSummaries, not raw sections", () => {
    const reportData: any = {
      metadata: { frameworkName: "EU AI Act", projectTitle: "Acme" },
      // A big raw section is present, but must never leak into these three
      // analyzers' prompts — only sectionSummaries prose may.
      sections: { projectRisks: { totalRisks: 1, risksByLevel: [], risks: [{ name: "RawSectionLeakMarker" }] } },
    };

    for (const key of ["executiveSummary", "keyFindings", "recommendedActions"] as const) {
      it(`${key} returns "" when sectionSummaries is absent, and non-empty prose when present`, () => {
        expect(ANALYZERS[key].buildUserPrompt(reportData, {})).toBe("");

        const prompt = ANALYZERS[key].buildUserPrompt(reportData, {
          sectionSummaries: { projectRisks: "A concise prose summary of project risk posture." },
        });
        expect(prompt.length).toBeGreaterThan(0);
        expect(prompt).toContain("Section analyses:");
        expect(prompt).toContain("[Use Case Risks]");
        expect(prompt).toContain("A concise prose summary of project risk posture.");
        expect(prompt).not.toContain("RawSectionLeakMarker");
      });
    }
  });

  it("Fix 6 — pins a specific vendor name and risk name from the fixture into the rendered prompts", () => {
    const reportData: any = {
      metadata: { frameworkName: "EU AI Act", projectTitle: "Acme" },
      sections: {
        vendorRisks: { totalRisks: 1, risks: [{ vendorName: "Northwind Traders", riskName: "Unvetted subprocessor" }] },
        vendors: { totalVendors: 1, vendors: [{ name: "Northwind Traders" }] },
        projectRisks: { totalRisks: 1, risksByLevel: [], risks: [{ name: "Unbounded model access" }] },
      },
    };

    const vendorPrompt = ANALYZERS.vendorRisk.buildUserPrompt(reportData, {});
    expect(vendorPrompt).toContain("Northwind Traders");
    expect(vendorPrompt).toContain("Unvetted subprocessor");
    expect(vendorPrompt).toContain("[Vendors]");
    expect(vendorPrompt).toContain("[Vendor Risks]");

    const riskPrompt = ANALYZERS.riskAnalysis.buildUserPrompt(reportData, {});
    expect(riskPrompt).toContain("Unbounded model access");
    expect(riskPrompt).toContain("[Use Case Risks]");
  });

  it("Fix 2 — skips a present-but-empty section shaped like real dataCollector output", () => {
    // dataCollector always assigns a section object, even for an empty
    // project: { totalRisks: 0, risksByLevel: [], risks: [] } is truthy, so a
    // presence check alone would not filter it out.
    const sections = {
      projectRisks: { totalRisks: 0, risksByLevel: [], risks: [] },
      vendorRisks: { totalRisks: 1, risks: [{ vendorName: "Acme Corp", riskName: "VR1" }] },
    };
    const out = renderSections(sections, ["projectRisks", "vendorRisks"]);
    expect(out).not.toContain("Use Case Risks");
    expect(out).toContain("Vendor Risks");
  });

  it("Fix 3/5 — bounds nested assessment topics/subtopics/questions and stamps truncation counts", () => {
    const topics = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      title: `Topic ${i}`,
      progress: 0,
      subtopics: Array.from({ length: 10 }, (_, j) => ({
        id: j,
        title: `Subtopic ${j}`,
        questions: Array.from({ length: 10 }, (_, k) => ({ id: k, question: `Q${k}`, status: "answered" })),
      })),
    }));
    const out = JSON.parse(prepareSectionData("assessment", { totalQuestions: 2000, answeredQuestions: 0, topics }));

    expect(out.topics).toHaveLength(10);
    expect(out._topicsTruncated).toBe("showing 10 of 20");
    expect(out.topics[0].subtopics).toHaveLength(5);
    expect(out.topics[0]._subtopicsTruncated).toBe("showing 5 of 10");
    expect(out.topics[0].subtopics[0].questions).toHaveLength(5);
    expect(out.topics[0].subtopics[0]._questionsTruncated).toBe("showing 5 of 10");
  });

  it("Fix 3/5 — bounds nested clausesAndAnnexes subClauses/controls and stamps truncation counts", () => {
    const clauses = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      clauseId: `C${i}`,
      title: `Clause ${i}`,
      status: "met",
      subClauses: Array.from({ length: 30 }, (_, j) => ({ id: j, title: `Sub ${j}`, status: "met" })),
    }));
    const annexes = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      annexId: `A${i}`,
      title: `Annex ${i}`,
      status: "met",
      controls: Array.from({ length: 30 }, (_, j) => ({ id: j, controlId: `AC${j}`, title: `Control ${j}`, status: "met" })),
    }));
    const out = JSON.parse(prepareSectionData("clausesAndAnnexes", { clauses, annexes }));

    expect(out.clauses).toHaveLength(30);
    expect(out._clausesTruncated).toBe("showing 30 of 40");
    expect(out.clauses[0].subClauses).toHaveLength(20);
    expect(out.clauses[0]._subClausesTruncated).toBe("showing 20 of 30");

    expect(out.annexes).toHaveLength(30);
    expect(out._annexesTruncated).toBe("showing 30 of 40");
    expect(out.annexes[0].controls).toHaveLength(20);
    expect(out.annexes[0]._controlsTruncated).toBe("showing 20 of 30");
  });

  it("Fix 3/5 — bounds nested nistSubcategories categories[].subcategories and stamps truncation counts", () => {
    const functions = [
      {
        name: "Govern",
        categories: [
          {
            id: "GV.1",
            name: "Governance",
            subcategories: Array.from({ length: 40 }, (_, i) => ({
              id: i,
              subcategoryId: `GV.1.${i}`,
              name: `Sub ${i}`,
              status: "met",
              risks: [],
            })),
          },
        ],
      },
    ];
    const out = JSON.parse(prepareSectionData("nistSubcategories", { functions }));

    expect(out.functions[0].categories[0].subcategories).toHaveLength(20);
    expect(out.functions[0].categories[0]._subcategoriesTruncated).toBe("showing 20 of 40");
  });

  it("Fix 4 — complianceGap does not claim scores are missing when frameworkScore/weakestControls exist without controlScores", () => {
    const reportData: any = { metadata: { frameworkName: "EU AI Act", projectTitle: "Acme" }, sections: {} };
    const prompt = ANALYZERS.complianceGap.buildUserPrompt(reportData, {
      readiness: { controlScores: [], weakestControls: [{ control_id: 1, overall_score: 10 }], frameworkScore: 42 },
    });
    expect(prompt).not.toContain("No stored readiness scores were found for this project.");
    expect(prompt).toContain("42");
  });

  it("Fix 3 — clamps the joined section body at the prompt budget with a visible marker", () => {
    const bigControls = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      controlId: `C${i}`,
      title: `Control ${i}`,
      status: "met",
      description: "x".repeat(3000),
    }));
    const sections = {
      compliance: { totalControls: 50, completedControls: 0, overallProgress: 0, controls: bigControls },
    };
    const out = renderSections(sections, ["compliance"]);
    expect(out).toContain("[TRUNCATED: section data exceeded the prompt budget]");
    expect(out.length).toBeLessThan(60200);
  });
});
