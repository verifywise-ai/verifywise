/**
 * @fileoverview Tests for merging per-target framework sections.
 *
 * Organization scope collects each framework section once per
 * projects_frameworks pairing. These merge the results into the single payload
 * shape the renderers expect, without losing which use case a row came from.
 *
 * @module tests/mergeSections
 */

import {
  mergeCompliance,
  mergeAssessment,
  mergeClausesAndAnnexes,
  mergeNistSubcategories,
  mergeFrameworkRequirements,
} from "../mergeSections";

const compliance = (n: number, done: number, controlId: string) => ({
  overallProgress: Math.round((done / n) * 100),
  totalControls: n,
  completedControls: done,
  controls: [{ id: 1, controlId, title: "t", status: "Compliant" }],
});

describe("mergeCompliance", () => {
  it("returns the single payload untouched when only one target contributed", () => {
    const one = compliance(4, 2, "C1");

    expect(mergeCompliance([{ useCase: "Alpha", data: one }])).toEqual(one);
  });

  it("concatenates controls and re-derives the totals", () => {
    const merged = mergeCompliance([
      { useCase: "Alpha", data: compliance(4, 2, "C1") },
      { useCase: "Beta", data: compliance(6, 6, "C2") },
    ]);

    expect(merged.totalControls).toBe(10);
    expect(merged.completedControls).toBe(8);
    expect(merged.overallProgress).toBe(80);
    expect(merged.controls.map((c) => c.controlId)).toEqual(["C1", "C2"]);
  });

  it("labels each control with its use case once more than one contributes", () => {
    const merged = mergeCompliance([
      { useCase: "Alpha", data: compliance(4, 2, "C1") },
      { useCase: "Beta", data: compliance(6, 6, "C2") },
    ]);

    // Control ids repeat across use cases (every EU AI Act project has C1),
    // so an unlabelled merged table is unreadable.
    expect(merged.controls.map((c: any) => c.useCase)).toEqual(["Alpha", "Beta"]);
  });

  it("never divides by zero", () => {
    const empty = { overallProgress: 0, totalControls: 0, completedControls: 0, controls: [] };

    const merged = mergeCompliance([
      { useCase: "Alpha", data: empty },
      { useCase: "Beta", data: empty },
    ]);

    expect(merged.overallProgress).toBe(0);
  });

  it("returns undefined when nothing contributed", () => {
    expect(mergeCompliance([])).toBeUndefined();
  });
});

describe("mergeAssessment", () => {
  const assessment = (total: number, answered: number, title: string) => ({
    totalQuestions: total,
    answeredQuestions: answered,
    topics: [{ id: 1, title, progress: 0, subtopics: [] }],
  });

  it("sums the question counters and concatenates topics", () => {
    const merged = mergeAssessment([
      { useCase: "Alpha", data: assessment(10, 4, "Risk") },
      { useCase: "Beta", data: assessment(5, 5, "Data") },
    ]);

    expect(merged.totalQuestions).toBe(15);
    expect(merged.answeredQuestions).toBe(9);
    expect(merged.topics.map((t: any) => [t.title, t.useCase])).toEqual([
      ["Risk", "Alpha"],
      ["Data", "Beta"],
    ]);
  });
});

describe("mergeClausesAndAnnexes", () => {
  const iso = (clauseId: string, annexId: string) => ({
    clauses: [{ id: 1, clauseId, title: "c", status: "Done", subClauses: [] }],
    annexes: [{ id: 1, annexId, title: "a", status: "Done", annexControls: [] }],
  });

  it("concatenates both lists", () => {
    const merged = mergeClausesAndAnnexes([
      { useCase: "Alpha", data: iso("4", "A.1") },
      { useCase: "Beta", data: iso("5", "A.2") },
    ]);

    expect(merged.clauses.map((c: any) => [c.clauseId, c.useCase])).toEqual([
      ["4", "Alpha"],
      ["5", "Beta"],
    ]);
    expect(merged.annexes.map((a: any) => [a.annexId, a.useCase])).toEqual([
      ["A.1", "Alpha"],
      ["A.2", "Beta"],
    ]);
  });

  it("keeps ISO 42001 and ISO 27001 pairings of the same project apart", () => {
    // Both frameworks land in this one section, and a project can hold both.
    // Labelling by use case alone would collapse them, so the framework name
    // qualifies the label when it differs.
    const merged = mergeClausesAndAnnexes([
      { useCase: "Alpha", framework: "ISO 42001", data: iso("4", "A.1") },
      { useCase: "Alpha", framework: "ISO 27001", data: iso("5", "A.2") },
    ]);

    expect(merged.clauses.map((c: any) => c.useCase)).toEqual([
      "Alpha — ISO 42001",
      "Alpha — ISO 27001",
    ]);
  });
});

describe("mergeNistSubcategories", () => {
  const nist = (fn: string, categoryId: string) => ({
    functions: [{ name: fn, categories: [{ id: categoryId, name: "c", subcategories: [] }] }],
  });

  it("merges the four functions by name instead of repeating them", () => {
    const merged = mergeNistSubcategories([
      { useCase: "Alpha", data: nist("Govern", "GV.1") },
      { useCase: "Beta", data: nist("Govern", "GV.2") },
      { useCase: "Beta", data: nist("Map", "MP.1") },
    ]);

    expect(merged.functions.map((f: any) => f.name)).toEqual(["Govern", "Map"]);
    expect(merged.functions[0].categories.map((c: any) => [c.id, c.useCase])).toEqual([
      ["GV.1", "Alpha"],
      ["GV.2", "Beta"],
    ]);
  });
});

const reqRow = (implId: number, isDone: boolean, children: any[] = []) => ({
  implId,
  level: 2 as const,
  title: `R${implId}`,
  orderNo: implId,
  status: isDone ? "Implemented" : "Not started",
  owner: isDone ? "Ann" : null,
  reviewer: null,
  approver: null,
  dueDate: null,
  isDone,
  isOverdue: false,
  evidenceCount: isDone ? 1 : 0,
  evidenceFiles: [],
  riskCount: 0,
  children,
});

const fwData = (rows: any[]) => ({
  frameworks: [
    {
      frameworkId: 26,
      frameworkName: "OSFI E-23",
      groups: [
        {
          title: "Governance",
          orderNo: 1,
          requirements: rows,
          rollup: {
            total: rows.length,
            done: rows.filter((r) => r.isDone).length,
            unassigned: 0,
            noEvidence: 0,
            overdue: 0,
            statusBreakdown: {},
          },
        },
      ],
      rollup: {
        total: rows.length,
        done: 0,
        unassigned: 0,
        noEvidence: 0,
        overdue: 0,
        statusBreakdown: {},
      },
    },
  ],
});

describe("mergeFrameworkRequirements", () => {
  it("merges two pairings of one framework with useCase labels and pooled rollup", () => {
    const merged = mergeFrameworkRequirements([
      {
        useCase: "Alpha",
        framework: "OSFI E-23",
        data: fwData([reqRow(1, true), reqRow(2, false)]),
      },
      {
        useCase: "Beta",
        framework: "OSFI E-23",
        data: fwData([reqRow(3, true, [reqRow(4, false)])]),
      },
    ]);

    expect(merged.frameworks).toHaveLength(1);
    const fw = merged.frameworks[0];
    expect(fw.groups.map((g) => g.useCase)).toEqual(["Alpha", "Beta"]);
    // 2 + (1 L2 + 1 L3) rows pooled; 2 done of 4, not an average of percentages.
    expect(fw.rollup.total).toBe(4);
    expect(fw.rollup.done).toBe(2);
    expect(fw.rollup.unassigned).toBe(2);
    expect(fw.rollup.statusBreakdown).toEqual({ Implemented: 2, "Not started": 2 });
  });

  it("keeps single-pairing output unlabelled", () => {
    const one = fwData([reqRow(1, true)]);
    const merged = mergeFrameworkRequirements([
      { useCase: "Alpha", framework: "OSFI E-23", data: one },
    ]);

    expect(merged).toEqual(one);
    expect(merged.frameworks[0].groups[0].useCase).toBeUndefined();
  });

  it("returns undefined for no contributions", () => {
    expect(mergeFrameworkRequirements([])).toBeUndefined();
  });
});
