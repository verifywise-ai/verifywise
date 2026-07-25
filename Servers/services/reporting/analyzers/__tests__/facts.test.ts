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

  it("§1 — counts rows by enum-ish fields and counts rows missing the person column", () => {
    const risks = collectFacts(reportData).sections.projectRisks;
    expect(risks["riskLevel_Very high risk"]).toBe(1);
    expect(risks.mitigationStatus_Unknown).toBe(2);
    // "Unassigned" (dataCollector's placeholder) and "" both count as missing.
    // risks.risk_owner IS an owner column, so here the aggregate names one.
    expect(risks.owner_missing).toBe(2);
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
    expect(policies.owner_missing).toBe(0);
  });

  it("§1 — keeps a present-but-empty section as an explicit zero, and omits an absent one", () => {
    const facts = collectFacts({
      metadata: reportData.metadata,
      charts: {},
      sections: { vendors: { totalVendors: 0, vendors: [] } },
    } as any);
    expect(facts.sections.vendors).toEqual({ totalVendors: 0, items: 0, assignee_missing: 0 });
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
        {
          name: "Unbounded model access",
          riskLevel: "Very high risk",
          mitigationStatus: "Unknown",
        },
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
    expect(facts.actionOwner_missing).toBe(1);
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
        { trainingName: "Annual AI ethics", status: "Completed" },
        { trainingName: "Model risk 101", status: "Planned" },
      ],
    });
    expect(String(facts.top1)).toContain("Model risk 101");
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

/**
 * Every field a spec names must be one the collector actually populates from a
 * real column. A spec that aggregates a field the projection hard-codes to NULL
 * — or one that was renamed out from under it — does not produce a missing
 * number, it produces a CONFIDENT WRONG one: "22 of 22 training records are
 * ownerless" is emitted for every tenant regardless of their data, and the facts
 * block reaches executiveSummary, keyFindings and recommendedActions, which
 * never see the raw section to check it against.
 *
 * The aggregate's NAME is part of that contract. A count keyed `ownerless` over
 * a column that is not an owner asserts the ownership the section has no column
 * for, so the name is derived from the field itself and cannot drift from it.
 */
describe("collectFacts — aggregates only fields the collector populates", () => {
  it("training records carry neither an assignee nor a completion date", () => {
    // `trainingregistar` has no such columns at all — verified against the
    // schema. So a missing-person count here could only ever equal the row
    // count, and the label could only ever read "completed unset".
    const facts = factsFor("trainingRegistry", {
      totalRecords: 2,
      records: [
        { trainingName: "Annual AI ethics", status: "Completed" },
        { trainingName: "Model risk 101", status: "Planned" },
      ],
    });
    expect(facts.owner_missing).toBeUndefined();
    expect(facts.ownerless).toBeUndefined();
    expect(facts.top1).toBe("Model risk 101 (Planned)");
  });

  it("models aggregate the approver, the only person column model_inventories has", () => {
    const facts = factsFor("models", {
      totalModels: 2,
      models: [
        { name: "gpt-x", version: "1.0", status: "Approved", approver: "Alice" },
        { name: "gpt-y", version: "2.0", status: "Pending" },
      ],
    });
    expect(facts.approver_Alice).toBe(1);
    expect(facts.owner_Alice).toBeUndefined();
    // The unsigned-off model outranks the approved one, and the COUNT says so
    // as "approver" too — model_inventories has no owner column, so an
    // `ownerless` count over it asserts an ownership nothing can back.
    expect(facts.approver_missing).toBe(1);
    expect(facts.ownerless).toBeUndefined();
    expect(facts.owner_missing).toBeUndefined();
    expect(String(facts.top1)).toContain("gpt-y");
    expect(String(facts.top1)).toContain("approver unset");
  });

  it("incidents count rows with no reporter, their only person column", () => {
    const facts = factsFor("incidentManagement", {
      totalIncidents: 2,
      incidents: [
        {
          incidentId: "INC-1",
          type: "Misuse",
          severity: "Minor",
          status: "Closed",
          reporter: "Alice",
        },
        { incidentId: "INC-2", type: "Model drift", severity: "Serious", status: "Open" },
      ],
    });
    // ai_incident_managements has neither an owner nor an assignee column.
    expect(facts.reporter_missing).toBe(1);
    expect(facts.ownerless).toBeUndefined();
  });
});

/**
 * §1 requires the top-N be ranked by materiality "severity, then due date".
 * Where a section's rank reads a single-valued status column the sort is a
 * no-op and the top-N falls back to the collector's `id ASC` order — the exact
 * "oldest N" failure the ranking exists to prevent.
 */
describe("collectFacts — the top-N breaks ties on the deadline where one exists", () => {
  it("orders same-status controls by due date, undated ones last", () => {
    // Query order is id ASC and every control is 'Waiting', so before the
    // tie-break this returned C-9, C-10, C-34 — the three lowest ids.
    const facts = factsFor("compliance", {
      totalControls: 4,
      controls: [
        { controlId: "C-9", title: "Risk register", status: "Waiting", dueDate: "2026-12-01" },
        { controlId: "C-10", title: "Post-market plan", status: "Waiting" },
        { controlId: "C-34", title: "Incident log", status: "Waiting", dueDate: "2026-08-01" },
        // Finished work stays behind open work however soon its date: the
        // deadline is a TIE-break, not the primary key.
        { controlId: "C-2", title: "Scope defined", status: "Done", dueDate: "2026-01-01" },
      ],
    });
    expect(String(facts.top1)).toContain("C-34");
    expect(String(facts.top2)).toContain("C-9");
    expect(String(facts.top3)).toContain("C-10");
  });

  it("orders same-level model risks by target date", () => {
    const facts = factsFor("modelRisks", {
      totalRisks: 3,
      risks: [
        {
          riskName: "Drift unmonitored",
          modelName: "gpt-x",
          riskLevel: "Critical",
          targetDate: "2026-11-01",
        },
        {
          riskName: "No eval baseline",
          modelName: "gpt-y",
          riskLevel: "Critical",
          targetDate: "2026-09-01",
        },
        // Sooner than both, but two levels down — the level still wins.
        { riskName: "Docs stale", modelName: "gpt-z", riskLevel: "Low", targetDate: "2026-07-01" },
      ],
    });
    expect(String(facts.top1)).toContain("No eval baseline");
    expect(String(facts.top3)).toContain("Docs stale");
  });

  it("does not order on reviewDate, which reaches it locale-rendered", () => {
    // "1/3/2026" is 3 January or 1 March depending on the server locale, so it
    // must not order anything — the same exclusion prompts.ts's dateOf makes.
    const facts = factsFor("policyManager", {
      totalPolicies: 2,
      policies: [
        { policyName: "Acceptable use", status: "Draft", reviewDate: "12/1/2026", owner: "Bob" },
        { policyName: "Model release", status: "Draft", reviewDate: "1/3/2026", owner: "Bob" },
      ],
    });
    expect(String(facts.top1)).toContain("Acceptable use");
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

  it("stamps a dropped bucket tail, like every other truncation in the block", () => {
    // Without the stamp the eight surviving buckets sum to less than `items`
    // and nothing says so. GROUNDING_RULES tells the model that counting over
    // supplied values is grounded, so "the inventory has eight approvers" is a
    // fabricated count that passes every guard — it IS arithmetic over what it
    // was given. `_distinct` is the number SECTION_INSTRUCTIONS.models asks for.
    const models = Array.from({ length: 12 }, (_, i) => i).flatMap((i) =>
      Array.from({ length: 12 - i }, () => ({
        name: `Model ${i}`,
        version: "1.0",
        status: "Approved",
        approver: `Approver ${i}`,
      })),
    );

    const facts = factsFor("models", { totalModels: models.length, models });
    expect(facts["approver_Approver 0"]).toBe(12);
    expect(facts["approver_Approver 8"]).toBeUndefined();
    expect(facts.approver_showing).toBe("showing 8 of 12");
    expect(facts.approver_distinct).toBe(12);
    // The status field fits inside MAX_BUCKETS, so it is stamped with neither.
    expect(facts.status_showing).toBeUndefined();
    expect(facts.status_distinct).toBeUndefined();
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
        projectRisks: {
          totalRisks: 1,
          items: 1,
          owner_missing: 5,
          top1: "something else entirely",
        },
      },
    };

    const out = renderFacts(collectFacts(reportData), prior);
    const deltaBlock = out.split("Change since the previous report run")[1];

    expect(out).toContain("Change since the previous report run (2026-06-22):");
    expect(deltaBlock).toContain("Use Case Risks totalRisks: 3 (was 1, +2)");
    expect(deltaBlock).toContain("Use Case Risks owner_missing: 2 (was 5, -3)");
    // Labels churn between runs without the estate changing; only numbers diff.
    expect(deltaBlock).not.toContain("top1");
    // An aggregate the prior run did not record is not a change.
    expect(deltaBlock).not.toContain("riskLevel_Critical");
  });

  it("§10 — reports a bucket that emptied to zero, the improvement worth reporting", () => {
    // A bucket key exists only when a row falls in it, so six Very high risks
    // all closing since the prior run leaves the key ABSENT rather than zero.
    // Iterating the current keys alone made the single most material
    // improvement between two runs the one thing the comparison could not say.
    const current = collectFacts({
      metadata: reportData.metadata,
      charts: {},
      sections: {
        projectRisks: {
          totalRisks: 2,
          risks: [
            { name: "Stale register", riskLevel: "Low risk", mitigationStatus: "Approved" },
            { name: "Vendor sprawl", riskLevel: "Low risk", mitigationStatus: "Approved" },
          ],
        },
      },
    } as any);

    const prior: FactsSnapshot = {
      generatedAt: "2026-06-22",
      framework: "ISO 42001",
      subject: "Acme Corp",
      sections: {
        projectRisks: {
          totalRisks: 2,
          items: 2,
          "riskLevel_Very high risk": 6,
          "riskLevel_Low risk": 2,
        },
        // Not collected in this run at all — a report-configuration change, not
        // an estate change, so it must not be reported as one.
        vendors: { totalVendors: 4, items: 4 },
      },
    };

    const deltaBlock = renderFacts(current, prior).split("Change since the previous report run")[1];
    expect(deltaBlock).toContain("Use Case Risks riskLevel_Very high risk: 0 (was 6, -6)");
    // Unchanged buckets stay silent, and an absent section stays absent.
    expect(deltaBlock).not.toContain("riskLevel_Low risk");
    expect(deltaBlock).not.toContain("totalVendors");
  });

  it("§10 — an unchanged estate produces no change block at all", () => {
    const snapshot = collectFacts(reportData);
    expect(renderFacts(snapshot, snapshot)).not.toContain("Change since");
  });

  it("§1 — stays inside its prompt budget for a full eight-section estate", () => {
    const rows = (n: number, make: (i: number) => any) =>
      Array.from({ length: n }, (_, i) => make(i));
    const full: any = {
      metadata: reportData.metadata,
      charts: {},
      sections: {
        projectRisks: {
          totalRisks: 60,
          risks: rows(60, (i) => ({
            name: `Risk ${i}`,
            riskLevel: "High",
            mitigationStatus: "Unknown",
            owner: "Alice",
          })),
        },
        vendorRisks: {
          totalRisks: 40,
          risks: rows(40, (i) => ({
            riskName: `VR ${i}`,
            vendorName: `Vendor ${i}`,
            riskLevel: "Medium",
          })),
        },
        modelRisks: {
          totalRisks: 30,
          risks: rows(30, (i) => ({
            riskName: `MR ${i}`,
            modelName: `Model ${i}`,
            riskLevel: "Low",
            mitigationStatus: "Unknown",
          })),
        },
        compliance: {
          totalControls: 80,
          completedControls: 20,
          overallProgress: 25,
          controls: rows(80, (i) => ({
            controlId: `C-${i}`,
            title: `Control ${i}`,
            status: "Waiting",
            owner: "",
          })),
        },
        vendors: {
          totalVendors: 25,
          vendors: rows(25, (i) => ({
            name: `Vendor ${i}`,
            riskStatus: "Not started",
            assignee: "",
          })),
        },
        models: {
          totalModels: 25,
          models: rows(25, (i) => ({
            name: `Model ${i}`,
            version: "1.0",
            status: "Approved",
            approver: "Alice",
          })),
        },
        policyManager: {
          totalPolicies: 20,
          policies: rows(20, (i) => ({ policyName: `Policy ${i}`, status: "Draft", owner: "Bob" })),
        },
        incidentManagement: {
          totalIncidents: 12,
          incidents: rows(12, (i) => ({
            incidentId: `INC-${i}`,
            type: "Outage",
            severity: "High",
            status: "Open",
            reportedDate: "1/2/2026",
          })),
        },
      },
    };

    const out = renderFacts(collectFacts(full));
    expect(out.length).toBeLessThan(3000);
    expect(out).toContain('top_showing="showing 3 of 60"');
  });
});
