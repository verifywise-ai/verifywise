import { ANALYZERS, ANALYZER_VERSION, ANALYSIS_SECTION_KEYS } from "../registry";
import {
  GENERIC_SECTION_INSTRUCTION,
  GROUNDING_RULES,
  prepareSectionData,
  renderSections,
  SECTION_INSTRUCTIONS,
  SECTION_LABELS,
} from "../prompts";

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

  it("ranks projectRisks by materiality BEFORE truncating, using the enum the collector actually emits", () => {
    // dataCollector sets riskLevel = risk_level_autocalculated, whose enum
    // carries a " risk" suffix ('Very high risk', not 'Very high'). The
    // collector's query orders by id ASC, so a plain slice hands the model 50
    // 'Low risk' rows and cuts the 'Very high risk' one sitting at index 60.
    const risks = [
      ...Array.from({ length: 60 }, (_, i) => ({ name: `Low${i}`, riskLevel: "Low risk" })),
      { name: "VeryHighLate", riskLevel: "Very high risk" },
      { name: "HighLate", riskLevel: "High risk" },
      { name: "NoRiskLate", riskLevel: "No risk" },
    ];
    const out = JSON.parse(prepareSectionData("projectRisks", { risks }));
    expect(out.risks).toHaveLength(50);
    expect(out.risks[0].name).toBe("VeryHighLate");
    expect(out.risks[1].name).toBe("HighLate");
    // 'No risk' is not material — it must not outrank the Low rows.
    expect(out.risks.map((r: any) => r.name)).not.toContain("NoRiskLate");
    expect(out._risksTruncated).toBe("showing 50 of 63");
  });

  it("ranks modelRisks by the bare-word vocabulary its own enum uses", () => {
    const risks = [
      ...Array.from({ length: 60 }, (_, i) => ({ riskName: `Low${i}`, riskLevel: "Low" })),
      { riskName: "CriticalLate", riskLevel: "Critical" },
      { riskName: "HighLate", riskLevel: "High" },
    ];
    const out = JSON.parse(prepareSectionData("modelRisks", { risks }));
    expect(out.risks).toHaveLength(50);
    expect(out.risks[0].riskName).toBe("CriticalLate");
    expect(out.risks[1].riskName).toBe("HighLate");
    expect(out._risksTruncated).toBe("showing 50 of 62");
  });

  it("ranks incidents by their own severity vocabulary — the only thing ordering them", () => {
    // ai_incident_managements.severity is 'Minor' | 'Serious' | 'Very serious',
    // and the section carries no deadline field, so without those three words in
    // LEVEL_RANK the comparator is a no-op and the slice keeps the 50 newest by
    // created_at DESC.
    const incidents = [
      ...Array.from({ length: 60 }, (_, i) => ({ title: `Minor${i}`, severity: "Minor" })),
      { title: "VerySeriousLate", severity: "Very serious" },
      { title: "SeriousLate", severity: "Serious" },
    ];
    const out = JSON.parse(prepareSectionData("incidentManagement", { incidents }));
    expect(out.incidents).toHaveLength(50);
    expect(out.incidents[0].title).toBe("VerySeriousLate");
    expect(out.incidents[1].title).toBe("SeriousLate");
    expect(out._incidentsTruncated).toBe("showing 50 of 62");
  });

  it("breaks severity ties by deadline and leaves unrankable rows in query order", () => {
    // modelRisks is the risk section that actually carries targetDate.
    const risks = [
      { riskName: "LateHigh", riskLevel: "High", targetDate: "2026-12-01" },
      { riskName: "EarlyHigh", riskLevel: "High", targetDate: "2026-01-05" },
      { riskName: "NoLevelA" },
      { riskName: "NoLevelB" },
    ];
    const out = JSON.parse(prepareSectionData("modelRisks", { risks }));
    expect(out.risks.map((r: any) => r.riskName)).toEqual([
      "EarlyHigh",
      "LateHigh",
      "NoLevelA",
      "NoLevelB",
    ]);
    // Nothing was dropped, so nothing is stamped.
    expect(out._risksTruncated).toBeUndefined();
  });

  it("ranks level-less compliance controls by status first, so a Done control never outranks an open one", () => {
    // Compliance controls carry no level, so this section exercises the branch
    // the risk tests never reach: status, then deadline, decide the whole order
    // AND which rows survive the cap. Ranking on the deadline alone would keep
    // the 50 earliest due dates — i.e. the long-closed ones — and drop the open
    // work a gap analysis exists to find.
    const controls = [
      ...Array.from({ length: 55 }, (_, i) => ({
        controlId: `CLOSED${i}`,
        status: "Done",
        dueDate: "2024-01-01",
      })),
      { controlId: "OpenSoon", status: "In progress", dueDate: "2026-02-01" },
      { controlId: "OpenLater", status: "Waiting", dueDate: "2026-09-01" },
      { controlId: "OpenUndatedA", status: "Waiting" },
      { controlId: "OpenUndatedB", status: "Waiting" },
    ];
    const out = JSON.parse(prepareSectionData("compliance", { controls }));

    expect(out.controls).toHaveLength(50);
    expect(out.controls.slice(0, 4).map((c: any) => c.controlId)).toEqual([
      "OpenSoon",
      "OpenLater",
      "OpenUndatedA",
      "OpenUndatedB",
    ]);
    // All four open controls survive; the nine rows dropped at the cap are all Done.
    expect(out.controls.filter((c: any) => c.status === "Done")).toHaveLength(46);
    expect(out._controlsTruncated).toBe("showing 50 of 59");
  });

  it("leaves policies in query order — reviewDate is a locale display string, not a rankable date", () => {
    // dataCollector emits reviewDate via toLocaleDateString(), not isoDate(),
    // so these are the strings the ranker actually receives. On an en-GB server
    // "06/07/2026" means 6 July, but new Date() reads it as 7 June, and
    // "31/12/2025" does not parse at all — ranking on that field would order
    // this list P2, P1, P3. dateOf does not read it, so nothing reorders.
    // The collector also always emits `status`, so the fixture carries it: the
    // vocabulary the UI writes has no terminal value, which is the OTHER half
    // of why this section keeps query order.
    const policies = [
      { policyName: "P1", status: "Published", reviewDate: "06/07/2026" },
      { policyName: "P2", status: "Archived", reviewDate: "01/02/2026" },
      { policyName: "P3", status: "Draft", reviewDate: "31/12/2025" },
    ];
    const out = JSON.parse(prepareSectionData("policyManager", { policies }));
    expect(out.policies.map((p: any) => p.policyName)).toEqual(["P1", "P2", "P3"]);
    expect(out._policiesTruncated).toBeUndefined();
  });

  it("ranks the terminal ISO statuses last, so the capped sub-clause list keeps the open work", () => {
    // subclauses_iso.status is 'Not started' | 'Draft' | 'In progress' |
    // 'Awaiting review' | 'Awaiting approval' | 'Implemented' | 'Audited' |
    // 'Needs rework' — no "Done" anywhere in it. Two of those are terminal and
    // the list is capped at 20 of 27, so matching "Done" alone would let the
    // finished rows crowd the rework out of the prompt.
    const subClauses = [
      ...Array.from({ length: 25 }, (_, i) => ({
        title: `Sub${i}`,
        status: i % 2 ? "Implemented" : "Audited",
      })),
      { title: "NeedsRework", status: "Needs rework" },
      { title: "InProgress", status: "In progress" },
    ];
    const out = JSON.parse(
      prepareSectionData("clausesAndAnnexes", {
        clauses: [{ clauseId: "C1", subClauses }],
        annexes: [],
      }),
    );

    expect(out.clauses[0].subClauses).toHaveLength(20);
    expect(out.clauses[0].subClauses.slice(0, 2).map((s: any) => s.title)).toEqual([
      "NeedsRework",
      "InProgress",
    ]);
    expect(out.clauses[0]._subClausesTruncated).toBe("showing 20 of 27");
  });

  it("ranks Answered questions last — the collector rewrites status before the 5-question cap", () => {
    // dataCollector maps q.status to 'Answered' | 'Pending', so "Answered", not
    // "Done", is the token that reaches the ranker for this section.
    const questions = [
      ...Array.from({ length: 6 }, (_, i) => ({ question: `A${i}`, status: "Answered" })),
      { question: "StillOpen", status: "Pending" },
    ];
    const out = JSON.parse(
      prepareSectionData("assessment", {
        topics: [{ title: "T1", subtopics: [{ title: "S1", questions }] }],
      }),
    );

    const kept = out.topics[0].subtopics[0].questions;
    expect(kept).toHaveLength(5);
    expect(kept[0].question).toBe("StillOpen");
    expect(out.topics[0].subtopics[0]._questionsTruncated).toBe("showing 5 of 7");
  });

  it("does not mutate the caller's array while ranking (the renderers get the same objects)", () => {
    const risks = [
      { name: "Low1", riskLevel: "Low risk" },
      { name: "VeryHigh1", riskLevel: "Very high risk" },
    ];
    prepareSectionData("projectRisks", { risks });
    expect(risks.map((r) => r.name)).toEqual(["Low1", "VeryHigh1"]);
  });

  it("keeps the twelve human-readable section labels", () => {
    expect(SECTION_LABELS.projectRisks).toBe("Use Case Risks");
    expect(Object.keys(SECTION_LABELS)).toHaveLength(12);
  });

  it("§3 — every section key has its own analytic instruction, with a generic fallback for anything unmapped", () => {
    // One shared instruction for all 12 section types is why every section
    // summary reads the same. The key set must track SECTION_LABELS exactly,
    // or a section silently falls back to the generic text.
    expect(Object.keys(SECTION_INSTRUCTIONS).sort()).toEqual(Object.keys(SECTION_LABELS).sort());
    Object.entries(SECTION_INSTRUCTIONS).forEach(([key, body]) => {
      expect(body.length).toBeGreaterThan(120);
      // A camelCase identifier must never appear in prose the model is shown —
      // the human label is what the prompt uses. Only identifier-shaped keys are
      // checked: banning the literal "vendors"/"models" would ban the domain
      // words themselves and shape the prose rather than test anything.
      if (/[A-Z]/.test(key)) expect(body).not.toContain(key);
    });

    // The three the design names as the pattern. 'Critical' belongs to the model
    // risk vocabulary alone; project and vendor risk levels top out at
    // 'Very high risk', so asking for a critical bucket there counts an empty one.
    expect(SECTION_INSTRUCTIONS.projectRisks).toContain("unmitigated high and very high");
    expect(SECTION_INSTRUCTIONS.modelRisks).toContain("unmitigated high and critical");
    expect(SECTION_INSTRUCTIONS.compliance).toContain("completion rate");

    // Day arithmetic is asked for only where the collector emits ISO dates.
    // policy reviewDate and incident reportedDate are toLocaleDateString()
    // renderings — "03/04/2026" is a different day per locale, and an "overdue
    // by N days" claim built on one is wrong silently.
    expect(SECTION_INSTRUCTIONS.compliance).toContain("reference date");
    expect(SECTION_INSTRUCTIONS.policyManager).not.toContain("reference date");
    expect(SECTION_INSTRUCTIONS.incidentManagement).not.toContain("reference date");

    // No question may name a field its own projection cannot populate — the
    // model answers truthfully from absence and the false finding ships.
    // collectTrainingRegistry selects completion_date and assignee_name as
    // literal NULL, so either question reports a 100% gap for every tenant; the
    // vendor risk projection carries no mitigation or status field at all.
    expect(SECTION_INSTRUCTIONS.trainingRegistry).not.toMatch(/completion date|assignee/i);
    expect(SECTION_INSTRUCTIONS.vendorRisks).not.toContain("unmitigated");

    // A section key with no entry falls back to this rather than losing its summary.
    expect(GENERIC_SECTION_INSTRUCTION).toContain("Highlights key observations and patterns");
  });

  it("§3 — grounding rules permit arithmetic over supplied values without loosening the ban on invented ones", () => {
    // The live corpus contains not one percentage, not one date comparison and
    // not one ratio: taken literally, "Never introduce a fact, name, number...
    // that does not appear in it" forbids dividing two numbers that do.
    expect(GROUNDING_RULES).toContain("Compute ratios, percentages, shares, counts and differences");
    expect(GROUNDING_RULES).toContain("compare dates in the data against the reference date when one is supplied");
    expect(GROUNDING_RULES).toContain("neither supplied nor derivable");
    // The anti-fabrication rule itself must survive the carve-out verbatim.
    expect(GROUNDING_RULES).toContain(
      "Use ONLY the data supplied below. Never introduce a fact, name, number, control, vendor or risk that does not appear in it.",
    );
    expect(GROUNDING_RULES).toContain("An honest abstention is correct");
  });

  it("§3 — complianceGap retracts re-scoring only, not the arithmetic the grounding rules just permitted", () => {
    // complianceGap carries the densest numeric input of the six, so a flat
    // "you do not compute anything" three lines under "compute ratios" is
    // where the carve-out would die first.
    const prompt = ANALYZERS.complianceGap.buildSystemPrompt();
    expect(prompt).toContain("You do not recalculate the readiness scores themselves");
    expect(prompt).not.toContain("You do not compute or re-score anything");
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
