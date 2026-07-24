// facts.ts imports isoDate from dataCollector (one date normalisation for the
// whole report), and dataCollector imports the real sequelize instance at
// module load. Same reason collectAnalyzerInputs.test.ts mocks evidenceAi.utils:
// leaving it unmocked opens a DB connection during a unit test.
jest.mock("../../../../database/db", () => ({ sequelize: {} }));

import { collectFacts, referenceDay } from "../facts";

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
      { level: "High", count: 2 },
      { level: "Low", count: 1 },
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
        { name: "Stale register", riskLevel: "Low", mitigationStatus: "Approved", owner: "Alice" },
        { name: "Unbounded model access", riskLevel: "Critical", mitigationStatus: "Unknown", owner: "Unassigned" },
        { name: "Vendor sprawl", riskLevel: "High", mitigationStatus: "Unknown", owner: "" },
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
    expect(risks.riskLevel_Critical).toBe(1);
    expect(risks.mitigationStatus_Unknown).toBe(2);
    // "Unassigned" (dataCollector's placeholder) and "" both count as ownerless.
    expect(risks.ownerless).toBe(2);
  });

  it("§1 — the chart rollup overwrites the row-derived bucket rather than duplicating it", () => {
    // charts.riskDistribution is the authoritative whole-set rollup; the rows
    // can be a truncated view of the same register.
    expect(collectFacts(reportData).sections.projectRisks.riskLevel_High).toBe(2);
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
      riskLevel: "Low",
      mitigationStatus: "Approved",
      owner: "Alice",
    }));
    risks[9] = {
      name: "Critical late arrival",
      riskLevel: "Critical",
      mitigationStatus: "Unknown",
      owner: "Alice",
    };

    const facts = collectFacts({
      metadata: reportData.metadata,
      charts: {},
      sections: { projectRisks: { totalRisks: 10, risks } },
    } as any);

    // Ordered last by id, first by materiality. This is the whole point of the
    // ranking: the underlying queries order by id ASC.
    expect(String(facts.sections.projectRisks.top1)).toContain("Critical late arrival");
    expect(facts.sections.projectRisks.top_showing).toBe("showing 3 of 10");
  });

  it("§1 — ranks the policy with no review date above the one that has one", () => {
    const policies = collectFacts(reportData).sections.policyManager;
    expect(String(policies.top1)).toContain("Acceptable use");
    expect(policies.status_Draft).toBe(1);
    expect(policies.ownerless).toBe(0);
  });

  it("§1 — flattens clauses, sub-clauses and annex controls into one status set", () => {
    const facts = collectFacts({
      metadata: reportData.metadata,
      charts: {},
      sections: {
        clausesAndAnnexes: {
          clauses: [
            {
              clauseId: "4.1",
              title: "Context",
              status: "Done",
              subClauses: [{ title: "Scope", status: "Waiting" }],
            },
          ],
          annexes: [
            { annexId: "A.2", controls: [{ controlId: "A.2.1", title: "Policy", status: "Waiting" }] },
          ],
        },
      },
    } as any);

    const ca = facts.sections.clausesAndAnnexes;
    expect(ca.items).toBe(3);
    expect(ca.status_Waiting).toBe(2);
    expect(ca.status_Done).toBe(1);
    expect(String(ca.top1)).toContain("Waiting");
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
