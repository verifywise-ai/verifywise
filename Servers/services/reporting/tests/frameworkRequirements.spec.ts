/**
 * @fileoverview Tests for the bundled-framework requirements collector.
 *
 * @module tests/frameworkRequirements
 */

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));

import { sequelize } from "../../../database/db";
import { FRAMEWORK_STRUCTURES } from "../../../structures";
import type { FrameworkTarget } from "../reportScope";
import {
  collectFrameworkRequirements,
  isBundledFrameworkId,
} from "../collectors/frameworkRequirements";

const query = sequelize.query as jest.Mock;

const flat = FRAMEWORK_STRUCTURES.find((s) => !s.tables.l3_impl && !s.adoption_levels)!;
const withLevels = FRAMEWORK_STRUCTURES.find((s) => s.adoption_levels)!;
const nested = FRAMEWORK_STRUCTURES.find((s) => s.tables.l3_impl)!;

const targetFor = (id: number, name: string): FrameworkTarget => ({
  projectId: 1,
  projectTitle: "P",
  isOrganizationalProject: false,
  frameworkId: id,
  frameworkName: name,
  projectFrameworkId: 7,
});

const generatedAt = new Date(2026, 10, 22, 12, 0, 0);

const l2Row = (over: Record<string, unknown>) => ({
  impl_id: 1,
  struct_id: 1,
  group_id: 1,
  group_title: "G1",
  group_order: 1,
  title: "R",
  order_no: 1,
  status: "Not started",
  owner: 5,
  reviewer: null,
  approver: null,
  due_date: null,
  ...over,
});

const names = async (ids: unknown[]) =>
  new Map<number, string>(ids.filter((i) => i === 5).map((i) => [i as number, "Ann"]));

/** Answer by SQL shape: evidence and risk queries by content, else L2. */
const mockQueries = (answers: { l2?: unknown[]; evidence?: unknown[]; risks?: unknown[] }) => {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes("file_entity_links")) return answers.evidence ?? [];
    if (sql.includes("projects_risks_id")) return answers.risks ?? [];
    return answers.l2 ?? [];
  });
};

describe("collectFrameworkRequirements", () => {
  beforeEach(() => query.mockReset());

  it("recognises bundled ids only", () => {
    expect(isBundledFrameworkId(flat.id)).toBe(true);
    expect(isBundledFrameworkId(1)).toBe(false);
  });

  it("throws for a non-bundled framework", async () => {
    await expect(
      collectFrameworkRequirements(targetFor(1, "EU"), 1, generatedAt, names),
    ).rejects.toThrow("Not a bundled framework: 1");
  });

  it("builds groups in order with rollups", async () => {
    mockQueries({
      l2: [
        l2Row({
          impl_id: 1,
          group_id: 2,
          group_title: "B",
          group_order: 2,
          order_no: 1,
          status: "Implemented",
        }),
        l2Row({
          impl_id: 2,
          group_id: 1,
          group_title: "A",
          group_order: 1,
          order_no: 1,
          status: "Audited",
        }),
        l2Row({
          impl_id: 3,
          group_id: 1,
          group_title: "A",
          group_order: 1,
          order_no: 2,
          status: "In progress",
          owner: null,
          due_date: "2026-01-01",
        }),
      ],
    });
    const out = await collectFrameworkRequirements(
      targetFor(flat.id, flat.displayName ?? "F"),
      1,
      generatedAt,
      names,
    );
    expect(out.frameworks).toHaveLength(1);
    const fw = out.frameworks[0];
    expect(fw.groups.map((g) => g.title)).toEqual(["A", "B"]);
    expect(fw.rollup).toMatchObject({
      total: 3,
      done: 2,
      unassigned: 1,
      noEvidence: 3,
      overdue: 1,
    });
    expect(fw.rollup.statusBreakdown).toEqual({
      Implemented: 1,
      Audited: 1,
      "In progress": 1,
    });
  });

  it("attaches evidence names and risk counts", async () => {
    const files = Array.from({ length: 12 }, (_, i) => ({
      entity_type: flat.entity_types.l2_impl,
      entity_id: 1,
      file_id: i,
      filename: `f${String(11 - i).padStart(2, "0")}.pdf`,
    }));
    mockQueries({
      l2: [l2Row({ impl_id: 1 })],
      evidence: files,
      risks: [{ impl_id: 1, count: 3 }],
    });
    const out = await collectFrameworkRequirements(targetFor(flat.id, "F"), 1, generatedAt, names);
    const row = out.frameworks[0].groups[0].requirements[0];
    expect(row.evidenceCount).toBe(12);
    expect(row.evidenceFiles).toHaveLength(10);
    expect(row.evidenceFiles[0]).toBe("f00.pdf");
    expect(row.riskCount).toBe(3);
  });

  it("keeps requirements with no evidence or risks", async () => {
    mockQueries({ l2: [l2Row({ impl_id: 1 }), l2Row({ impl_id: 2, order_no: 2 })] });
    const out = await collectFrameworkRequirements(targetFor(flat.id, "F"), 1, generatedAt, names);
    const rows = out.frameworks[0].groups[0].requirements;
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.evidenceCount).toBe(0);
      expect(r.evidenceFiles).toEqual([]);
      expect(r.riskCount).toBe(0);
    }
  });

  it("nests L3 rows and counts them", async () => {
    // The L3 query is the only one selecting parent_struct_id.
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("file_entity_links") || sql.includes("projects_risks_id")) return [];
      if (sql.includes("parent_struct_id"))
        return [
          {
            impl_id: 20,
            parent_impl_id: 10,
            parent_struct_id: 100,
            title: "Child",
            order_no: 1,
            status: "Draft",
            owner: 5,
            reviewer: null,
            approver: null,
            due_date: null,
          },
        ];
      return [l2Row({ impl_id: 10, struct_id: 100, status: "Implemented" })];
    });
    const out = await collectFrameworkRequirements(
      targetFor(nested.id, "N"),
      1,
      generatedAt,
      names,
    );
    const parent = out.frameworks[0].groups[0].requirements[0];
    expect(parent.children).toHaveLength(1);
    expect(parent.children![0]).toMatchObject({ implId: 20, level: 3, status: "Draft" });
    expect(out.frameworks[0].rollup.total).toBe(2);
    expect(out.frameworks[0].rollup.done).toBe(1);
  });

  it("falls back to Unknown user", async () => {
    mockQueries({ l2: [l2Row({ owner: 99, reviewer: 5 })] });
    const out = await collectFrameworkRequirements(targetFor(flat.id, "F"), 1, generatedAt, names);
    const row = out.frameworks[0].groups[0].requirements[0];
    expect(row.owner).toBe("Unknown user");
    expect(row.reviewer).toBe("Ann");
    expect(row.approver).toBeNull();
  });

  it("skips evidence and risk queries when there are no impl rows", async () => {
    mockQueries({ l2: [] });
    const out = await collectFrameworkRequirements(targetFor(flat.id, "F"), 1, generatedAt, names);
    expect(query).toHaveBeenCalledTimes(1);
    expect(out.frameworks[0].groups).toEqual([]);
    expect(out.frameworks[0].rollup.total).toBe(0);
  });

  it("counts a file linked twice once", async () => {
    const link = {
      entity_type: flat.entity_types.l2_impl,
      entity_id: 1,
      file_id: 4,
      filename: "a.pdf",
    };
    mockQueries({ l2: [l2Row({ impl_id: 1 })], evidence: [link, { ...link }] });
    const out = await collectFrameworkRequirements(targetFor(flat.id, "F"), 1, generatedAt, names);
    expect(out.frameworks[0].groups[0].requirements[0].evidenceCount).toBe(1);
  });

  it("scopes the risk join to the organization", async () => {
    mockQueries({ l2: [l2Row({ impl_id: 1 })] });
    await collectFrameworkRequirements(targetFor(flat.id, "F"), 1, generatedAt, names);
    const riskSql = query.mock.calls
      .map((c) => c[0] as string)
      .find((q) => q.includes("projects_risks_id"))!;
    expect(riskSql).toContain("pr.organization_id = r.organization_id");
  });

  it("rejects an invalid generatedAt", async () => {
    await expect(
      collectFrameworkRequirements(targetFor(flat.id, "F"), 1, new Date("nope"), names),
    ).rejects.toThrow("Invalid generatedAt");
  });

  it("keeps groups with the same title apart by id", async () => {
    mockQueries({
      l2: [
        l2Row({ impl_id: 1, group_id: 1, group_title: "Same", group_order: 1 }),
        l2Row({ impl_id: 2, group_id: 2, group_title: "Same", group_order: 1 }),
      ],
    });
    const out = await collectFrameworkRequirements(targetFor(flat.id, "F"), 1, generatedAt, names);
    expect(out.frameworks[0].groups).toHaveLength(2);
  });

  it("nests L3 by struct parent when the impl parent matches nothing", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("file_entity_links") || sql.includes("projects_risks_id")) return [];
      if (sql.includes("parent_struct_id"))
        return [
          {
            impl_id: 20,
            parent_impl_id: null,
            parent_struct_id: 100,
            title: "Child",
            order_no: 1,
            status: "Draft",
            owner: 5,
            reviewer: null,
            approver: null,
            due_date: null,
          },
        ];
      return [l2Row({ impl_id: 10, struct_id: 100 })];
    });
    const out = await collectFrameworkRequirements(
      targetFor(nested.id, "N"),
      1,
      generatedAt,
      names,
    );
    expect(out.frameworks[0].groups[0].requirements[0].children).toHaveLength(1);
  });

  it("carries the adoption level for a framework with levels", async () => {
    mockQueries({
      l2: [
        l2Row({ impl_id: 1, order_no: 1, adoption_level: 3 }),
        l2Row({ impl_id: 2, order_no: 2, adoption_level: null }),
      ],
    });
    const out = await collectFrameworkRequirements(
      targetFor(withLevels.id, "NAII"),
      1,
      generatedAt,
      names,
    );
    const fw = out.frameworks[0];
    expect(fw.adoptionLevels).toBe(true);
    expect(fw.groups[0].requirements.map((r) => r.adoptionLevel)).toEqual([3, null]);
    expect(fw.groups[0].adoptionSummary).toEqual({ assessed: 1, total: 2, min: 3, max: 3 });
    expect(String(query.mock.calls[0][0])).toContain("i.adoption_level");
  });

  it("leaves the adoption level out for other frameworks", async () => {
    mockQueries({ l2: [l2Row({ impl_id: 1, adoption_level: null })] });
    const out = await collectFrameworkRequirements(
      targetFor(flat.id, flat.displayName ?? "F"),
      1,
      generatedAt,
      names,
    );
    expect(out.frameworks[0]).not.toHaveProperty("adoptionLevels");
    expect(out.frameworks[0].groups[0].requirements[0]).not.toHaveProperty("adoptionLevel");
    expect(out.frameworks[0].groups[0]).not.toHaveProperty("adoptionSummary");
    expect(String(query.mock.calls[0][0])).toContain("NULL::smallint AS adoption_level");
  });
});
