import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn(async (..._args: any[]): Promise<any> => []);
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

import { FRAMEWORK_STRUCTURES, getStructureById } from "..";
import type { FrameworkStructure } from "..";
import { frameworkAdditionMap, frameworkDeletionMap } from "../../types/framework.type";
import { NotesAttachedToEnum } from "../../domain.layer/models/notes/notes.model";

const ORG_ID = 7;
const PROJECT_ID = 11;
const PF_ID = 13;
const tx = { id: "tx" } as any;

const naii = getStructureById(30) as FrameworkStructure;

const sqlOf = (call: any[]) => String(call[0]).replace(/\s+/g, " ");

/**
 * SDAIA-P123 v1 (May 2025), section 3.2.1: 3 pillars, 7 sub-pillars and 23
 * domains, in the document's order.
 */
const SDAIA_INDEX: Array<[string, string[]]> = [
  ["Directions: Strategy", ["Planning and performance", "Initiatives", "Budget"]],
  [
    "Directions: Governance",
    [
      "Frameworks and policies",
      "Regulatory enablement",
      "Reliability and safety",
      "Regulatory compliance",
    ],
  ],
  ["Enablers: Data", ["Availability and accessibility", "Quality and integration", "Reliability"]],
  [
    "Enablers: Infrastructure",
    ["Technical standards", "Availability and monitoring", "Operational resilience"],
  ],
  [
    "Enablers: Human capabilities",
    [
      "Headcount and diversity",
      "Professional development",
      "Academic collaboration",
      "Job stability",
    ],
  ],
  [
    "Outputs: Applications",
    ["Development and deployment", "Privacy and security", "Operation and management"],
  ],
  [
    "Outputs: Impact",
    ["Operational efficiency", "Employee productivity", "Service quality and improvement"],
  ],
];

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([]);
});

describe("Saudi NAII registry entry", () => {
  it("registers the framework as id 30 at organization level", () => {
    expect(naii.key).toBe("saudi-naii");
    expect(naii.framework_type).toBe("saudi_naii");
    expect(naii.seed.name).toBe("Saudi National AI Index (NAII)");
    expect(naii.seed.is_organizational).toBe(true);
    expect(naii.seed.hierarchy.type).toBe("two_level");
  });

  it("leaves id 29 to EU AI Act (organization), which is not a registry framework", () => {
    expect(getStructureById(29)).toBeNull();
  });

  it("does not share an id, key, framework_type or table with any other registry framework", () => {
    const others = FRAMEWORK_STRUCTURES.filter((other) => other !== naii);
    const otherTables = new Set(others.flatMap((other) => Object.values(other.tables)));
    expect(others.map((other) => other.id)).not.toContain(naii.id);
    expect(others.map((other) => other.key)).not.toContain(naii.key);
    expect(others.map((other) => other.framework_type)).not.toContain(naii.framework_type);
    for (const table of Object.values(naii.tables)) expect(otherTables.has(table)).toBe(false);
  });

  it("has a notes enum value for its entity type, within the 50-character column", () => {
    const value = `${naii.framework_type.toUpperCase()}_${naii.entity_types.l2_impl.toUpperCase()}`;
    expect(Object.values(NotesAttachedToEnum)).toContain(value);
    expect(value.length).toBeLessThanOrEqual(50);
  });
});

describe("Saudi NAII structure", () => {
  it("matches SDAIA's 7 sub-pillars and 23 domains one to one", () => {
    const actual = naii.seed.structure.map(
      (l1) => [l1.title, (l1.items ?? []).map((l2) => l2.title)] as [string, string[]],
    );
    expect(actual).toEqual(SDAIA_INDEX);
    expect(actual.flatMap(([, domains]) => domains)).toHaveLength(23);
  });

  it("numbers sub-pillars 1-7 and domains from 1 within each sub-pillar", () => {
    naii.seed.structure.forEach((l1, i) => {
      expect(l1.order_no).toBe(i + 1);
      (l1.items ?? []).forEach((l2, j) => expect(l2.order_no).toBe(j + 1));
    });
  });

  it("gives every sub-pillar a description and every domain full guidance", () => {
    for (const l1 of naii.seed.structure) {
      expect(l1.description).toBeTruthy();
      for (const l2 of l1.items ?? []) {
        expect(l2.description).toBeTruthy();
        expect(l2.summary).toBeTruthy();
        expect(l2.questions?.length).toBeGreaterThanOrEqual(3);
        expect(l2.evidence_examples?.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("asks SDAIA's 26 appendix questions, by id, in each domain's order", () => {
    const ids = naii.seed.structure.flatMap((l1) =>
      (l1.items ?? []).map((l2) =>
        (l2.questions ?? [])
          .map((q) => /^(AI\.AQ\.[A-Z]{2}\.[\d.]+):/.exec(q)?.[1])
          .filter((id): id is string => Boolean(id)),
      ),
    );
    expect(ids).toEqual([
      ["AI.AQ.ST.1"],
      ["AI.AQ.ST.2"],
      ["AI.AQ.ST.3"],
      ["AI.AQ.GO.1"],
      ["AI.AQ.GO.2"],
      ["AI.AQ.GO.3"],
      ["AI.AQ.GO.4"],
      ["AI.AQ.DA.1"],
      ["AI.AQ.DA.2"],
      ["AI.AQ.DA.3"],
      ["AI.AQ.IN.1"],
      ["AI.AQ.IN.2"],
      ["AI.AQ.IN.3"],
      ["AI.AQ.HC.1"],
      ["AI.AQ.HC.2"],
      ["AI.AQ.HC.3"],
      ["AI.AQ.HC.4"],
      ["AI.AQ.AP.1.1", "AI.AQ.AP.1.2", "AI.AQ.AP.1.3", "AI.AQ.AP.1.4"],
      ["AI.AQ.AP.2"],
      ["AI.AQ.AP.3"],
      ["AI.AQ.IM.1"],
      ["AI.AQ.IM.2"],
      ["AI.AQ.IM.3"],
    ]);
  });

  it("codes every evidence example with its own domain's SDAIA codes for levels 3 to 5", () => {
    // Evidence groups match the question id, except Applications, which SDAIA
    // numbers AP.1-AP.4 (AP.1.1-1.4), AP.5 (AP.2) and AP.6 (AP.3).
    const groupsOf = (questionIds: string[]): string[] =>
      questionIds.map((id) => {
        const code = id.replace(/^AI\.AQ\./, "");
        if (code.startsWith("AP.1.")) return `AP.${code.split(".")[2]}`;
        if (code === "AP.2") return "AP.5";
        if (code === "AP.3") return "AP.6";
        return code;
      });
    for (const l1 of naii.seed.structure) {
      for (const l2 of l1.items ?? []) {
        const questionIds = (l2.questions ?? [])
          .map((q) => /^(AI\.AQ\.[A-Z]{2}\.[\d.]+):/.exec(q)?.[1])
          .filter((id): id is string => Boolean(id));
        const groups = groupsOf(questionIds);
        for (const evidence of l2.evidence_examples ?? []) {
          expect(evidence).toMatch(
            /\([A-Z]{2}\.\d+\.[3-5]\.\d+(?:, [A-Z]{2}\.\d+\.[3-5]\.\d+)*\)$/,
          );
          const codes = /\(([^()]+)\)$/.exec(evidence)![1].split(", ");
          for (const code of codes) {
            const group = code.split(".").slice(0, 2).join(".");
            expect(groups).toContain(group);
          }
        }
      }
    }
  });
});

describe("Saudi NAII add and remove dispatch", () => {
  it("seeds its own impl table", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: PF_ID, owner: null, is_demo: false }])
      .mockResolvedValueOnce([{ status_type: "verifywise.enum_saudi_naii_domains_status" }])
      .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);

    await frameworkAdditionMap[30](PROJECT_ID, false, ORG_ID, tx);

    const [, , insert] = mockQuery.mock.calls;
    expect(sqlOf(insert)).toContain("INSERT INTO saudi_naii_domains ");
    expect(sqlOf(insert)).toContain(
      "FROM saudi_naii_domains_struct l2 JOIN saudi_naii_sub_pillars_struct l1",
    );
    expect(sqlOf(insert)).toContain("'Not started'::verifywise.enum_saudi_naii_domains_status");
    expect((insert[1] as any).replacements).toMatchObject({ frameworkId: 30, pfId: PF_ID });
  });

  it("removes only its own file links", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: PF_ID, owner: null, is_demo: false }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: PF_ID }]);

    const removed = await frameworkDeletionMap[30](PROJECT_ID, ORG_ID, tx);

    expect(removed).toBe(true);
    const [lookup, fileLinks, projectFramework] = mockQuery.mock.calls;
    expect((lookup[1] as any).replacements).toMatchObject({ frameworkId: 30 });
    expect(sqlOf(fileLinks)).toContain(
      "SELECT id FROM saudi_naii_domains WHERE projects_frameworks_id = :pfId",
    );
    expect((fileLinks[1] as any).replacements).toMatchObject({
      framework_type: "saudi_naii",
      entity_type: "domain",
      pfId: PF_ID,
    });
    expect(sqlOf(projectFramework)).toContain("DELETE FROM projects_frameworks WHERE id = :pfId");
  });
});
