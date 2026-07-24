// facts.ts imports isoDate from dataCollector (one date normalisation for the
// whole report), and dataCollector imports the real sequelize instance at
// module load. Same reason collectAnalyzerInputs.test.ts mocks evidenceAi.utils:
// leaving it unmocked opens a DB connection during a unit test.
jest.mock("../../../../database/db", () => ({ sequelize: {} }));

import { collectFacts, referenceDay, renderFacts, type FactsSnapshot } from "../facts";

// Every fixture below uses the vocabulary dataCollector ACTUALLY emits for that
// section, not a plausible-looking one. Project and vendor risks carry the
// `risk_level_autocalculated` labels with their " risk" suffix
// (dataCollector.ts:481, :596); incidents carry 'Minor' | 'Serious' | 'Very
// serious'; ISO sub-clauses and NIST subcategories terminate at 'Implemented' |
// 'Audited'; training records at 'Completed'. Fixtures written to match the
// implementation instead would keep passing while the ranking is dead.
const reportData: any = {
  metadata: {
    // Built from LOCAL components: isoDate reads local components (it is the
    // same helper that produced every dueDate/reviewDate in this data), so a
    // fixture built this way expects the same day in every timezone the suite
    // runs in.
    generatedAt: new Date(2026, 6, 22, 9, 0, 0),
    frameworkName: "ISO 42001",
    projectTitle: "Acme Corp",
  },
  charts: {
    riskDistribution: [
      { level: "High risk", count: 2 },
      { level: "Low risk", count: 1 },
    ],
    complianceProgress: [
      { category: "Governance", completed: 9, total: 10, percentage: 90 },
      { category: "Data", completed: 1, total: 9, percentage: 11 },
    ],
    assessmentStatus: [
      { status: "Answered", count: 4 },
      { status: "Pending", count: 6 },
    ],
  },
  sections: {
    projectRisks: {
      totalRisks: 3,
      risks: [
        {
          name: "Stale register",
          riskLevel: "Low risk",
          mitigationStatus: "Approved",
          owner: "Alice",
        },
        {
          name: "Unbounded model access",
          riskLevel: "Very high risk",
          mitigationStatus: "Unknown",
          owner: "Unassigned",
        },
        { name: "Vendor sprawl", riskLevel: "High risk", mitigationStatus: "Unknown", owner: "" },
      ],
    },
    policyManager: {
      totalPolicies: 2,
      policies: [
        { policyName: "Acceptable use", status: "Draft", owner: "Bob" },
        { policyName: "Model release", status: "Approved", reviewDate: "1/1/2026", owner: "Bob" },
      ],
    },
  },
};

/** collectFacts against one section, with the shared metadata and no charts. */
const factsFor = (key: string, section: any) =>
  collectFacts({
    metadata: reportData.metadata,
    charts: {},
    sections: { [key]: section },
  } as any).sections[key];

describe("collectFacts", () => {
  it("§1 — carries the reference day, framework and subject off metadata", () => {
    const facts = collectFacts(reportData);
    expect(facts.generatedAt).toBe("2026-07-22");
    expect(facts.framework).toBe("ISO 42001");
    expect(facts.subject).toBe("Acme Corp");
  });

  it("§1 — falls back rather than throwing when metadata is absent", () => {
    const facts = collectFacts({ sections: {} } as any);
    expect(facts.framework).toBe("AI governance");
    expect(facts.subject).toBe("the organization");
    expect(facts.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(facts.sections).toEqual({});
  });

  it("§1 — copies the aggregates already on the section object and counts the rows", () => {
    const risks = collectFacts(reportData).sections.projectRisks;
    expect(risks.totalRisks).toBe(3);
    expect(risks.items).toBe(3);
  });

  it("§1 — counts rows by enum-ish fields and counts ownerless rows", () => {
    const risks = collectFacts(reportData).sections.projectRisks;
    expect(risks["riskLevel_Very high risk"]).toBe(1);
    expect(risks.mitigationStatus_Unknown).toBe(2);
    // "Unassigned" (dataCollector's placeholder) and "" both count as ownerless.
    expect(risks.ownerless).toBe(2);
  });

  it("§1 — the chart rollup overwrites the row-derived bucket rather than duplicating it", () => {
    // charts.riskDistribution is the authoritative whole-set rollup; the rows
    // can be a truncated view of the same register.
    expect(collectFacts(reportData).sections.projectRisks["riskLevel_High risk"]).toBe(2);
  });

  it("§1 — surfaces the weakest compliance categories from the discarded chart data", () => {
    const compliance = collectFacts(reportData).sections.compliance;
    expect(compliance.weakestCategory1).toBe("Data 1/9 (11%)");
    expect(compliance.weakestCategory2).toBe("Governance 9/10 (90%)");
  });

  it("§1 — carries the assessment rollup even though no assessment section was collected", () => {
    const assessment = collectFacts(reportData).sections.assessment;
    expect(assessment.questions_Answered).toBe(4);
    expect(assessment.questions_Pending).toBe(6);
  });

  it("§1 — ranks by materiality BEFORE truncating, and stamps what it dropped", () => {
    const risks = Array.from({ length: 10 }, (_, i) => ({
      name: `R${i}`,
      riskLevel: "Low risk",
      mitigationStatus: "Approved",
      owner: "Alice",
    }));
    risks[9] = {
      name: "Very high late arrival",
      riskLevel: "Very high risk",
      mitigationStatus: "Unknown",
      owner: "Alice",
    };

    // Ordered last by id, first by materiality. This is the whole point of the
    // ranking: the underlying queries order by id ASC.
    const facts = factsFor("projectRisks", { totalRisks: 10, risks });
    expect(String(facts.top1)).toContain("Very high late arrival");
    expect(facts.top_showing).toBe("showing 3 of 10");
  });

  it("§1 — ranks the policy with no review date above the one that has one", () => {
    const policies = collectFacts(reportData).sections.policyManager;
    expect(String(policies.top1)).toContain("Acceptable use");
    expect(policies.status_Draft).toBe(1);
    expect(policies.ownerless).toBe(0);
  });

  it("§1 — keeps a present-but-empty section as an explicit zero, and omits an absent one", () => {
    const facts = collectFacts({
      metadata: reportData.metadata,
      charts: {},
      sections: { vendors: { totalVendors: 0, vendors: [] } },
    } as any);
    expect(facts.sections.vendors).toEqual({ totalVendors: 0, items: 0, ownerless: 0 });
    expect(facts.sections.models).toBeUndefined();
  });

  it("§1 — referenceDay is the one shared date normalisation, and falls back to today", () => {
    // A one-line wrapper over dataCollector's isoDate — the SAME helper that
    // produced every dueDate/reviewDate the model is asked to compare against.
    expect(referenceDay(new Date(2026, 6, 22, 9, 0, 0))).toBe("2026-07-22");
    expect(referenceDay("2026-07-22T09:00:00.000Z")).toBe("2026-07-22");
    expect(referenceDay(undefined)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/**
 * One case per section, each built from the collector's own vocabulary and each
 * asserting that the material row — not the first row by id — lands in top1.
 * These are the tests that fail when the shared level/status tables and the
 * facts ranking drift apart.
 */
describe("collectFacts — ranks every section on the vocabulary its collector emits", () => {
  it("project risks rank on the suffixed risk_level_autocalculated labels", () => {
    // Query order is id ASC, so the material row is deliberately last.
    const facts = factsFor("projectRisks", {
      totalRisks: 2,
      risks: [
        { name: "Stale register", riskLevel: "Low risk", mitigationStatus: "Approved" },
        { name: "Unbounded model access", riskLevel: "Very high risk", mitigationStatus: "Unknown" },
      ],
    });
    expect(String(facts.top1)).toContain("Unbounded model access");
  });

  it("vendor risks reuse those same suffixed labels", () => {
    const facts = factsFor("vendorRisks", {
      totalRisks: 2,
      risks: [
        {
          riskName: "Sub-processor churn",
          vendorName: "Acme",
          riskLevel: "Low risk",
          actionOwner: "Alice",
        },
        { riskName: "No DPA on file", vendorName: "Globex", riskLevel: "Very high risk" },
      ],
    });
    expect(String(facts.top1)).toContain("No DPA on file");
    expect(facts.ownerless).toBe(1);
  });

  it("model risks rank on the bare words", () => {
    const facts = factsFor("modelRisks", {
      totalRisks: 2,
      risks: [
        { riskName: "Drift unmonitored", modelName: "gpt-x", riskLevel: "Low" },
        { riskName: "No eval baseline", modelName: "gpt-y", riskLevel: "Critical" },
      ],
    });
    expect(String(facts.top1)).toContain("No eval baseline");
  });

  it("incidents rank on severity, their only materiality axis", () => {
    const facts = factsFor("incidentManagement", {
      totalIncidents: 3,
      incidents: [
        { incidentId: "INC-1", type: "Misuse", severity: "Minor", status: "Closed" },
        { incidentId: "INC-2", type: "Model drift", severity: "Serious", status: "Open" },
        { incidentId: "INC-3", type: "Security breach", severity: "Very serious", status: "Open" },
      ],
    });
    expect(String(facts.top1)).toContain("INC-3");
    expect(facts.severity_Minor).toBe(1);
  });

  it("flattens sub-clauses and annex controls, dropping the stateless struct rows", () => {
    // clauses_struct_iso and annex_struct_iso have no status column, so
    // dataCollector's `clause.status || "Unknown"` is always literally
    // "Unknown". Those rows must neither bucket nor rank.
    const facts = factsFor("clausesAndAnnexes", {
      clauses: [
        {
          clauseId: "4.1",
          title: "Context",
          status: "Unknown",
          subClauses: [
            { title: "Scope", status: "Implemented" },
            { title: "Interested parties", status: "Not started" },
          ],
        },
      ],
      annexes: [
        {
          annexId: "A.2",
          title: "Policies",
          status: "Unknown",
          controls: [{ controlId: "A.2.1", title: "AI policy", status: "Audited" }],
        },
      ],
    });

    expect(facts.items).toBe(3);
    expect(facts.status_Unknown).toBeUndefined();
    expect(facts.status_Implemented).toBe(1);
    expect(facts.status_Audited).toBe(1);
    expect(facts["status_Not started"]).toBe(1);
    // 'Implemented' and 'Audited' are both terminal; only the open row is.
    expect(String(facts.top1)).toContain("Not started");
  });

  it("NIST subcategories terminate at Implemented/Audited too", () => {
    const facts = factsFor("nistSubcategories", {
      functions: [
        {
          name: "Govern",
          categories: [
            {
              subcategories: [
                { subcategoryId: "GV.1-1", status: "Audited", risks: [] },
                { subcategoryId: "GV.1-2", status: "Not started", risks: [{ id: 1 }] },
              ],
            },
          ],
        },
      ],
    });
    expect(String(facts.top1)).toContain("GV.1-2");
    expect(facts._fn_Govern).toBe(2);
  });

  it("training records terminate at Completed", () => {
    const facts = factsFor("trainingRegistry", {
      totalRecords: 2,
      records: [
        { trainingName: "Annual AI ethics", status: "Completed", completionDate: "1/1/2026" },
        { trainingName: "Model risk 101", status: "Planned", assignee: "Bob" },
      ],
    });
    expect(String(facts.top1)).toContain("Model risk 101");
    expect(facts.ownerless).toBe(1);
  });

  it("compliance controls terminate at Done", () => {
    const facts = factsFor("compliance", {
      totalControls: 2,
      controls: [
        { controlId: "C-1", title: "Risk register kept", status: "Done", owner: "Alice" },
        { controlId: "C-2", title: "Post-market plan", status: "Waiting", owner: "Alice" },
      ],
    });
    expect(String(facts.top1)).toContain("C-2");
  });
});

describe("collectFacts — truncation branches", () => {
  it("keeps only the heaviest MAX_BUCKETS values of a high-cardinality field", () => {
    // Ten distinct statuses, S0 the heaviest at 10 rows down to S9 at one.
    const risks = Array.from({ length: 10 }, (_, i) => i).flatMap((i) =>
      Array.from({ length: 10 - i }, () => ({
        name: `R${i}`,
        riskLevel: "Low risk",
        mitigationStatus: `S${i}`,
        owner: "Alice",
      })),
    );

    const facts = factsFor("projectRisks", { totalRisks: risks.length, risks });
    expect(facts.mitigationStatus_S0).toBe(10);
    expect(facts.mitigationStatus_S7).toBe(3);
    // S8 (2 rows) and S9 (1 row) fall off the tail rather than blowing the budget.
    expect(facts.mitigationStatus_S8).toBeUndefined();
    expect(facts.mitigationStatus_S9).toBeUndefined();
  });

  it("caps each top-N label at MAX_LABEL_CHARS", () => {
    const facts = factsFor("projectRisks", {
      totalRisks: 1,
      risks: [
        {
          name: "R".repeat(200),
          riskLevel: "Very high risk",
          mitigationStatus: "Unknown",
          owner: "Alice",
        },
      ],
    });
    expect(String(facts.top1)).toHaveLength(80);
    // Truncated mid-name, so no stamp is emitted — top_showing counts ROWS
    // dropped, not characters.
    expect(facts.top_showing).toBeUndefined();
  });
});

describe("renderFacts", () => {
  it("§1 — leads with the reference date, framework and subject", () => {
    const out = renderFacts(collectFacts(reportData));
    expect(out).toContain("Reference date: 2026-07-22");
    expect(out).toContain("Framework: ISO 42001");
    expect(out).toContain("Subject: Acme Corp");
  });

  it("§1 — renders one labelled line per section, numbers bare and strings quoted", () => {
    const out = renderFacts(collectFacts(reportData));
    expect(out).toContain("[Use Case Risks] totalRisks=3;");
    expect(out).toContain("[Policy Manager]");
    expect(out).toContain('top1="Acceptable use (Draft, review unset, owner Bob)"');
    // The raw section key must not leak in place of the human label.
    expect(out).not.toContain("[projectRisks]");
  });

  it("§1 — emits no change block when there is no prior snapshot", () => {
    expect(renderFacts(collectFacts(reportData))).not.toContain("Change since");
    expect(renderFacts(collectFacts(reportData), null)).not.toContain("Change since");
  });

  it("§10 — emits one delta line per changed numeric aggregate, signed", () => {
    const prior: FactsSnapshot = {
      // A snapshot stored before this change carries a full ISO timestamp;
      // one stored after carries a day. The header handles both.
      generatedAt: "2026-06-22T09:00:00.000Z",
      framework: "ISO 42001",
      subject: "Acme Corp",
      sections: {
        projectRisks: { totalRisks: 1, items: 1, ownerless: 5, top1: "something else entirely" },
      },
    };

    const out = renderFacts(collectFacts(reportData), prior);
    const deltaBlock = out.split("Change since the previous report run")[1];

    expect(out).toContain("Change since the previous report run (2026-06-22):");
    expect(deltaBlock).toContain("Use Case Risks totalRisks: 3 (was 1, +2)");
    expect(deltaBlock).toContain("Use Case Risks ownerless: 2 (was 5, -3)");
    // Labels churn between runs without the estate changing; only numbers diff.
    expect(deltaBlock).not.toContain("top1");
    // An aggregate the prior run did not record is not a change.
    expect(deltaBlock).not.toContain("riskLevel_Critical");
  });

  it("§10 — an unchanged estate produces no change block at all", () => {
    const snapshot = collectFacts(reportData);
    expect(renderFacts(snapshot, snapshot)).not.toContain("Change since");
  });

  it("§1 — stays inside its prompt budget for a full eight-section estate", () => {
    const rows = (n: number, make: (i: number) => any) => Array.from({ length: n }, (_, i) => make(i));
    const full: any = {
      metadata: reportData.metadata,
      charts: {},
      sections: {
        projectRisks: {
          totalRisks: 60,
          risks: rows(60, (i) => ({ name: `Risk ${i}`, riskLevel: "High", mitigationStatus: "Unknown", owner: "Alice" })),
        },
        vendorRisks: {
          totalRisks: 40,
          risks: rows(40, (i) => ({ riskName: `VR ${i}`, vendorName: `Vendor ${i}`, riskLevel: "Medium" })),
        },
        modelRisks: {
          totalRisks: 30,
          risks: rows(30, (i) => ({ riskName: `MR ${i}`, modelName: `Model ${i}`, riskLevel: "Low", mitigationStatus: "Unknown" })),
        },
        compliance: {
          totalControls: 80,
          completedControls: 20,
          overallProgress: 25,
          controls: rows(80, (i) => ({ controlId: `C-${i}`, title: `Control ${i}`, status: "Waiting", owner: "" })),
        },
        vendors: {
          totalVendors: 25,
          vendors: rows(25, (i) => ({ name: `Vendor ${i}`, riskStatus: "Not started", assignee: "" })),
        },
        models: {
          totalModels: 25,
          models: rows(25, (i) => ({ name: `Model ${i}`, version: "1.0", status: "Approved", owner: "Alice" })),
        },
        policyManager: {
          totalPolicies: 20,
          policies: rows(20, (i) => ({ policyName: `Policy ${i}`, status: "Draft", owner: "Bob" })),
        },
        incidentManagement: {
          totalIncidents: 12,
          incidents: rows(12, (i) => ({ incidentId: `INC-${i}`, type: "Outage", severity: "High", status: "Open", reportedDate: "1/2/2026" })),
        },
      },
    };

    const out = renderFacts(collectFacts(full));
    expect(out.length).toBeLessThan(3000);
    expect(out).toContain('top_showing="showing 3 of 60"');
  });
});
