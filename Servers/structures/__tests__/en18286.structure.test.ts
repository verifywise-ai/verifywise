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

const org = getStructureById(27) as FrameworkStructure;
const aiSystems = getStructureById(28) as FrameworkStructure;

/** "4.1", "9.6", ... as the UI renders them from order_no. */
const subclauses = (fw: FrameworkStructure) =>
  fw.seed.structure.flatMap((l1) => (l1.items ?? []).map((l2) => `${l1.order_no}.${l2.order_no}`));

const sqlOf = (call: any[]) => String(call[0]).replace(/\s+/g, " ");

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([]);
});

describe("EN 18286 registry entries", () => {
  it("registers the organization-level framework as id 27", () => {
    expect(org.key).toBe("en-18286");
    expect(org.framework_type).toBe("en_18286");
    expect(org.seed.name).toBe("EN 18286");
    expect(org.seed.is_organizational).toBe(true);
  });

  it("registers the AI system-level framework as id 28", () => {
    expect(aiSystems.key).toBe("en-18286-ai-systems");
    expect(aiSystems.framework_type).toBe("en_18286_ai_systems");
    expect(aiSystems.seed.name).toBe("EN 18286 AI systems");
    expect(aiSystems.seed.is_organizational).toBe(false);
  });

  it("does not share an id, key, framework_type or table with any other registry framework", () => {
    for (const fw of [org, aiSystems]) {
      const others = FRAMEWORK_STRUCTURES.filter((other) => other !== fw);
      const otherTables = new Set(others.flatMap((other) => Object.values(other.tables)));
      expect(others.map((other) => other.id)).not.toContain(fw.id);
      expect(others.map((other) => other.key)).not.toContain(fw.key);
      expect(others.map((other) => other.framework_type)).not.toContain(fw.framework_type);
      for (const table of Object.values(fw.tables)) expect(otherTables.has(table)).toBe(false);
    }
  });

  it("has a notes enum value for each entity type, within the 50-character column", () => {
    for (const fw of [org, aiSystems]) {
      const value = `${fw.framework_type.toUpperCase()}_${fw.entity_types.l2_impl.toUpperCase()}`;
      expect(Object.values(NotesAttachedToEnum)).toContain(value);
      expect(value.length).toBeLessThanOrEqual(50);
    }
  });
});

describe("EN 18286 clause split", () => {
  it("puts clauses 4-7, 9.6, 9.7 and 10 at organization level", () => {
    expect(org.seed.structure.map((l1) => l1.order_no)).toEqual([4, 5, 6, 7, 9, 10]);
    expect(subclauses(org)).toEqual([
      "4.1",
      "4.2",
      "4.3",
      "4.4",
      "4.5",
      "5.1",
      "5.2",
      "5.3",
      "6.1",
      "6.2",
      "7.1",
      "7.2",
      "7.3",
      "7.4",
      "9.6",
      "9.7",
      "10.1",
      "10.2",
    ]);
  });

  it("puts clause 8 and 9.1-9.5 at AI system level", () => {
    expect(aiSystems.seed.structure.map((l1) => l1.order_no)).toEqual([8, 9]);
    expect(subclauses(aiSystems)).toEqual([
      "8.1",
      "8.2",
      "8.3",
      "8.4",
      "8.5",
      "8.6",
      "8.7",
      "8.8",
      "8.9",
      "9.1",
      "9.2",
      "9.3",
      "9.4",
      "9.5",
    ]);
  });

  it("keeps titles free of clause numbers, since the UI prefixes order_no", () => {
    for (const fw of [org, aiSystems]) {
      for (const l1 of fw.seed.structure) {
        expect(l1.title).not.toMatch(/^\d/);
        for (const l2 of l1.items ?? []) expect(l2.title).not.toMatch(/^\d/);
      }
    }
  });

  it("gives every requirement a description, summary, questions and evidence examples", () => {
    for (const fw of [org, aiSystems]) {
      for (const l2 of fw.seed.structure.flatMap((l1) => l1.items ?? [])) {
        expect(l2.description).toBeTruthy();
        expect(l2.summary).toBeTruthy();
        expect(l2.questions?.length).toBeGreaterThan(0);
        expect(l2.evidence_examples?.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("EN 18286 add and remove dispatch", () => {
  it.each([
    [27, "en_18286_requirements", "en_18286_requirements_struct", "en_18286_clauses_struct"],
    [
      28,
      "en_18286_ai_systems_requirements",
      "en_18286_ai_systems_requirements_struct",
      "en_18286_ai_systems_clauses_struct",
    ],
  ])("framework %i seeds its own impl table", async (frameworkId, impl, l2Struct, l1Struct) => {
    mockQuery
      .mockResolvedValueOnce([{ id: PF_ID, owner: null, is_demo: false }])
      .mockResolvedValueOnce([{ status_type: `verifywise.enum_${impl}_status` }])
      .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);

    await frameworkAdditionMap[frameworkId](PROJECT_ID, false, ORG_ID, tx);

    const [, , insert] = mockQuery.mock.calls;
    expect(sqlOf(insert)).toContain(`INSERT INTO ${impl} `);
    expect(sqlOf(insert)).toContain(`FROM ${l2Struct} l2 JOIN ${l1Struct} l1`);
    expect(sqlOf(insert)).toContain(`'Not started'::verifywise.enum_${impl}_status`);
    expect((insert[1] as any).replacements).toMatchObject({ frameworkId, pfId: PF_ID });
  });

  it.each([
    [27, "en_18286", "en_18286_requirements"],
    [28, "en_18286_ai_systems", "en_18286_ai_systems_requirements"],
  ])("framework %i removes only its own file links", async (frameworkId, frameworkType, impl) => {
    mockQuery
      .mockResolvedValueOnce([{ id: PF_ID, owner: null, is_demo: false }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: PF_ID }]);

    const removed = await frameworkDeletionMap[frameworkId](PROJECT_ID, ORG_ID, tx);

    expect(removed).toBe(true);
    const [lookup, fileLinks, projectFramework] = mockQuery.mock.calls;
    expect((lookup[1] as any).replacements).toMatchObject({ frameworkId });
    expect(sqlOf(fileLinks)).toContain(
      `SELECT id FROM ${impl} WHERE projects_frameworks_id = :pfId`,
    );
    expect((fileLinks[1] as any).replacements).toMatchObject({
      framework_type: frameworkType,
      entity_type: "requirement",
      pfId: PF_ID,
    });
    expect(sqlOf(projectFramework)).toContain("DELETE FROM projects_frameworks WHERE id = :pfId");
  });
});
