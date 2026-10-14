import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn(async (..._args: any[]): Promise<any> => []);
const mockTx = {
  id: "tx",
  commit: jest.fn(async () => undefined),
  rollback: jest.fn(async () => undefined),
};
jest.mock("../../database/db", () => ({
  sequelize: {
    query: (...args: any[]) => mockQuery(...args),
    transaction: async () => mockTx,
  },
}));
const mockAppend = jest.fn(async (..._args: any[]) => undefined);
jest.mock("../auditLedger.utils", () => ({
  appendToAuditLedger: (...args: any[]) => mockAppend(...args),
}));

import {
  createCustomFieldDefinitionQuery,
  deleteCustomFieldDefinitionQuery,
  getCustomFieldUsageQuery,
  setCustomFieldValueQuery,
  updateCustomFieldDefinitionQuery,
} from "../customField.utils";

const ORG = 7;
const flat = (sql: unknown) => String(sql).replace(/\s+/g, " ").trim();

const scoredDef = {
  id: 11,
  organization_id: ORG,
  entity_type: "project",
  field_key: "feasibility",
  label: "Technical feasibility",
  field_type: "scored_select",
  options: [
    { id: "opt_00000001", label: "High", score: 3 },
    { id: "opt_00000002", label: "Medium", score: 2 },
  ],
  required: false,
};
const selectDef = { ...scoredDef, id: 12, field_type: "select", options: ["US", "EU"] };
const multiDef = { ...scoredDef, id: 13, field_type: "multiselect", options: ["a", "b"] };
const textDef = { ...scoredDef, id: 14, field_type: "text", options: null };

/** Route each SQL statement to a canned answer. */
function serve(def: unknown) {
  mockQuery.mockImplementation(async (sql: unknown) => {
    const s = flat(sql);
    if (s.startsWith("SELECT * FROM custom_field_definitions")) return [def];
    if (s.startsWith("SELECT 1 AS ok FROM")) return [{ ok: 1 }];
    if (s.startsWith("INSERT INTO custom_field_values")) return [{ id: 1, definition_id: 11 }];
    if (s.startsWith("INSERT INTO custom_field_definitions")) return [{ ...scoredDef, id: 99 }];
    return [];
  });
}

beforeEach(() => {
  mockQuery.mockReset();
  mockAppend.mockReset();
});

describe("creating a scored select definition", () => {
  it("stores validated options with server-assigned ids", async () => {
    serve(scoredDef);
    await createCustomFieldDefinitionQuery(
      {
        entity_type: "project",
        field_key: "feasibility",
        label: "Technical feasibility",
        field_type: "scored_select",
        options: [
          { label: "High", score: 3 },
          { label: "Low", score: 1.005 },
        ],
      },
      ORG,
      3,
    );
    const insert = mockQuery.mock.calls.find((c) =>
      flat(c[0]).startsWith("INSERT INTO custom_field_definitions"),
    )!;
    const stored = JSON.parse((insert[1] as any).replacements.options);
    expect(stored.map((o: any) => o.label)).toEqual(["High", "Low"]);
    stored.forEach((o: any) => expect(o.id).toMatch(/^opt_[0-9a-f]{8}$/));
    expect((insert[1] as any).replacements.field_type).toBe("scored_select");
  });

  it("rejects option objects on a plain select", async () => {
    await expect(
      createCustomFieldDefinitionQuery(
        {
          entity_type: "project",
          field_key: "region",
          label: "Region",
          field_type: "select",
          options: [{ label: "US", score: 1 }] as any,
        },
        ORG,
        3,
      ),
    ).rejects.toThrow(/option values must be strings/);
  });
});

describe("setting a value", () => {
  const write = (def: unknown, value: unknown) => {
    serve(def);
    return setCustomFieldValueQuery(
      { definition_id: (def as any).id, entity_id: 5, value },
      ORG,
      mockTx as any,
    );
  };

  it("accepts a current option id and stores it", async () => {
    await write(scoredDef, "opt_00000002");
    const insert = mockQuery.mock.calls.find((c) =>
      flat(c[0]).startsWith("INSERT INTO custom_field_values"),
    )!;
    expect((insert[1] as any).replacements.value).toBe(JSON.stringify("opt_00000002"));
  });

  it.each([
    ["a label", "Medium"],
    ["an unknown id", "opt_ffffffff"],
    ["a number", 2],
  ])("rejects %s", async (_name, value) => {
    await expect(write(scoredDef, value)).rejects.toThrow(/allowed options/);
  });

  it("reads the definition FOR SHARE inside the caller's transaction", async () => {
    await write(scoredDef, "opt_00000001");
    const read = mockQuery.mock.calls.find((c) =>
      flat(c[0]).startsWith("SELECT * FROM custom_field_definitions"),
    )!;
    expect(flat(read[0])).toMatch(/FOR SHARE$/);
    expect((read[1] as any).transaction).toBe(mockTx);
  });

  it("still validates select and multiselect values by label (regression)", async () => {
    await expect(write(selectDef, "EU")).resolves.toBeDefined();
    await expect(write(selectDef, "XX")).rejects.toThrow(/allowed options/);
    await expect(write(multiDef, ["a", "b"])).resolves.toBeDefined();
    await expect(write(multiDef, ["c"])).rejects.toThrow(/allowed options/);
  });
});

/** Serve an update: the locked read, usage counts, the move UPDATEs, then the definition UPDATE. */
function serveUpdate(def: any, usage: Array<{ option_key: string; count: number }>, movedRows = 0) {
  mockQuery.mockImplementation(async (sql: unknown, opts: any) => {
    const s = flat(sql);
    if (s.startsWith("SELECT * FROM custom_field_definitions")) return [def];
    if (s.includes("GROUP BY")) return usage;
    if (
      s.startsWith("UPDATE custom_field_values") ||
      s.startsWith("DELETE FROM custom_field_values")
    )
      return Array.from({ length: movedRows }, () => ({ "?column?": 1 }));
    if (s.startsWith("UPDATE custom_field_definitions")) {
      return [
        {
          ...def,
          label: opts.replacements.label,
          required: opts.replacements.required,
          options: JSON.parse(opts.replacements.options),
        },
      ];
    }
    if (s.startsWith("DELETE FROM custom_field_definitions")) return [{ id: def.id }];
    return [];
  });
}

const sameOptionsMinusMedium = [{ id: "opt_00000001", label: "High", score: 3 }];

describe("updating a scored select definition", () => {
  beforeEach(() => {
    mockTx.commit.mockClear();
    mockTx.rollback.mockClear();
  });

  it("locks the definition FOR UPDATE inside one transaction and commits", async () => {
    serveUpdate(scoredDef, []);
    await updateCustomFieldDefinitionQuery(11, ORG, { label: "Feasibility" }, 3);
    const read = mockQuery.mock.calls.find((c) =>
      flat(c[0]).startsWith("SELECT * FROM custom_field_definitions"),
    )!;
    expect(flat(read[0])).toMatch(/FOR UPDATE$/);
    for (const call of mockQuery.mock.calls) expect((call[1] as any).transaction).toBe(mockTx);
    expect(mockTx.commit).toHaveBeenCalledTimes(1);
  });

  it("keeps ids when options are renamed, so answers are untouched", async () => {
    serveUpdate(scoredDef, [{ option_key: "opt_00000002", count: 4 }]);
    const out = await updateCustomFieldDefinitionQuery(
      11,
      ORG,
      {
        options: [
          { id: "opt_00000001", label: "Very high", score: 3 },
          { id: "opt_00000002", label: "Medium", score: 2 },
        ],
      },
      3,
    );
    expect((out.options as any[]).map((o) => o.id)).toEqual(["opt_00000001", "opt_00000002"]);
    expect(
      mockQuery.mock.calls.some((c) => flat(c[0]).startsWith("UPDATE custom_field_values")),
    ).toBe(false);
  });

  it("removes an unused option without a move", async () => {
    serveUpdate(scoredDef, [{ option_key: "opt_00000001", count: 5 }]);
    await expect(
      updateCustomFieldDefinitionQuery(11, ORG, { options: sameOptionsMinusMedium }, 3),
    ).resolves.toBeDefined();
  });

  it("refuses to remove a used option without a move: 409 with counts, nothing written", async () => {
    serveUpdate(scoredDef, [{ option_key: "opt_00000002", count: 80 }]);
    const err: any = await updateCustomFieldDefinitionQuery(
      11,
      ORG,
      { options: sameOptionsMinusMedium },
      3,
    ).catch((e) => e);
    expect(err.statusCode).toBe(409);
    expect(err.metadata).toEqual(
      expect.objectContaining({
        code: "options_in_use",
        entity_type: "project",
        in_use: [{ id: "opt_00000002", label: "Medium", count: 80 }],
      }),
    );
    expect(mockQuery.mock.calls.some((c) => flat(c[0]).startsWith("UPDATE"))).toBe(false);
    expect(mockTx.rollback).toHaveBeenCalledTimes(1);
    expect(mockAppend).not.toHaveBeenCalled();
  });

  it("moves answers then removes the option, scoped to the field and org", async () => {
    serveUpdate(scoredDef, [{ option_key: "opt_00000002", count: 80 }], 80);
    await updateCustomFieldDefinitionQuery(
      11,
      ORG,
      { options: sameOptionsMinusMedium, option_moves: { opt_00000002: "opt_00000001" } },
      3,
    );
    const move = mockQuery.mock.calls.find((c) =>
      flat(c[0]).startsWith("UPDATE custom_field_values"),
    )!;
    expect(flat(move[0])).toContain(
      "SET value = to_jsonb(CAST(:target AS text)), updated_at = NOW() WHERE definition_id = :id AND organization_id = :organizationId AND value = to_jsonb(CAST(:removed AS text)) RETURNING 1",
    );
    expect((move[1] as any).replacements).toEqual({
      target: "opt_00000001",
      removed: "opt_00000002",
      id: 11,
      organizationId: ORG,
    });
    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Use cases · Technical feasibility · 80 answers moved to High",
      }),
    );
  });

  it("skips a move for a removed option no record uses", async () => {
    serveUpdate(scoredDef, [{ option_key: "opt_00000001", count: 5 }]);
    await updateCustomFieldDefinitionQuery(
      11,
      ORG,
      { options: sameOptionsMinusMedium, option_moves: { opt_00000002: "opt_00000001" } },
      3,
    );
    expect(
      mockQuery.mock.calls.some((c) => flat(c[0]).startsWith("UPDATE custom_field_values")),
    ).toBe(false);
    for (const call of mockAppend.mock.calls) {
      expect((call[0] as any).description).not.toMatch(/answers? moved/);
    }
  });

  it("rejects option_moves on a field without options", async () => {
    serveUpdate(textDef, []);
    await expect(
      updateCustomFieldDefinitionQuery(14, ORG, { option_moves: { a: "b" } }, 3),
    ).rejects.toThrow(/only allowed for select, multiselect and scored select/);
  });

  it("writes ledger entries only after commit", async () => {
    const order: string[] = [];
    mockTx.commit.mockImplementationOnce(async () => {
      order.push("commit");
    });
    mockAppend.mockImplementation(async () => {
      order.push("ledger");
    });
    serveUpdate(scoredDef, []);
    await updateCustomFieldDefinitionQuery(11, ORG, { label: "Feasibility" }, 3);
    expect(order).toEqual(["commit", "ledger"]);
  });
});

describe("updating a select or multiselect definition", () => {
  const moveCall = () =>
    mockQuery.mock.calls.find((c) => flat(c[0]).startsWith("UPDATE custom_field_values"));

  it("refuses to drop a used select option without a move: 409 keyed by the option text", async () => {
    serveUpdate(selectDef, [{ option_key: "EU", count: 4 }]);
    const err: any = await updateCustomFieldDefinitionQuery(12, ORG, { options: ["US"] }, 3).catch(
      (e) => e,
    );
    expect(err.statusCode).toBe(409);
    expect(err.metadata).toEqual(
      expect.objectContaining({
        code: "options_in_use",
        in_use: [{ id: "EU", label: "EU", count: 4 }],
      }),
    );
    expect(mockQuery.mock.calls.some((c) => flat(c[0]).startsWith("UPDATE"))).toBe(false);
  });

  it("treats a renamed select option as removed, and moves its answers to the new text", async () => {
    serveUpdate(selectDef, [{ option_key: "EU", count: 4 }], 4);
    await updateCustomFieldDefinitionQuery(
      12,
      ORG,
      { options: ["US", "Europe"], option_moves: { EU: "Europe" } },
      3,
    );
    const move = moveCall()!;
    expect(flat(move[0])).toContain("SET value = to_jsonb(CAST(:target AS text))");
    expect((move[1] as any).replacements).toEqual({
      target: "Europe",
      removed: "EU",
      id: 12,
      organizationId: ORG,
    });
    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldName: "option",
        oldValue: "EU",
        description: "Use cases · Technical feasibility · 4 answers moved to Europe",
      }),
    );
  });

  it("treats an option named like an Object member as a normal option", async () => {
    serveUpdate({ ...selectDef, options: ["constructor", "US"] }, [
      { option_key: "constructor", count: 3 },
    ]);
    const err: any = await updateCustomFieldDefinitionQuery(12, ORG, { options: ["US"] }, 3).catch(
      (e) => e,
    );
    expect(err.statusCode).toBe(409);
    expect(err.metadata.in_use).toEqual([{ id: "constructor", label: "constructor", count: 3 }]);
  });

  it("moves answers from an option named like an Object member", async () => {
    serveUpdate(
      { ...selectDef, options: ["toString", "US"] },
      [{ option_key: "toString", count: 2 }],
      2,
    );
    await updateCustomFieldDefinitionQuery(
      12,
      ORG,
      { options: ["US"], option_moves: { toString: "US" } },
      3,
    );
    expect(
      mockQuery.mock.calls.some((c) => flat(c[0]).startsWith("UPDATE custom_field_values")),
    ).toBe(true);
  });

  it("removes an unused select option without a move", async () => {
    serveUpdate(selectDef, [{ option_key: "US", count: 2 }]);
    await expect(
      updateCustomFieldDefinitionQuery(12, ORG, { options: ["US"] }, 3),
    ).resolves.toBeDefined();
    expect(moveCall()).toBeUndefined();
  });

  it("counts multiselect usage per option inside each list", async () => {
    serveUpdate(multiDef, [{ option_key: "b", count: 2 }]);
    const err: any = await updateCustomFieldDefinitionQuery(13, ORG, { options: ["a"] }, 3).catch(
      (e) => e,
    );
    expect(err.statusCode).toBe(409);
    expect(err.metadata.in_use).toEqual([{ id: "b", label: "b", count: 2 }]);
    const count = mockQuery.mock.calls.find((c) => flat(c[0]).includes("GROUP BY"))!;
    expect(flat(count[0])).toContain("jsonb_array_elements_text");
  });

  it("replaces the option inside multiselect lists, keeping one copy of the target", async () => {
    serveUpdate(multiDef, [{ option_key: "b", count: 2 }], 2);
    await updateCustomFieldDefinitionQuery(
      13,
      ORG,
      { options: ["a"], option_moves: { b: "a" } },
      3,
    );
    const move = moveCall()!;
    const sql = flat(move[0]);
    expect(sql).toContain("jsonb_agg(option ORDER BY first_pos)");
    expect(sql).toContain("GROUP BY 1");
    expect(sql).toContain("value @> jsonb_build_array(CAST(:removed AS text))");
    expect((move[1] as any).replacements).toEqual({
      target: "a",
      removed: "b",
      id: 13,
      organizationId: ORG,
    });
  });

  it("rejects a move to an option that is not in the new list", async () => {
    serveUpdate(selectDef, [{ option_key: "EU", count: 4 }]);
    await expect(
      updateCustomFieldDefinitionQuery(
        12,
        ORG,
        { options: ["US"], option_moves: { EU: "Europe" } },
        3,
      ),
    ).rejects.toThrow(/target must be a remaining option/);
  });
});

describe("removing an option's answers instead of moving them", () => {
  const sqlCalls = (prefix: string) =>
    mockQuery.mock.calls.filter((c) => flat(c[0]).startsWith(prefix));

  it("deletes a single select option's answers and records it in the ledger", async () => {
    serveUpdate(selectDef, [{ option_key: "EU", count: 4 }], 4);
    await updateCustomFieldDefinitionQuery(
      12,
      ORG,
      { options: ["US"], option_removals: ["EU"] },
      3,
    );
    const del = sqlCalls("DELETE FROM custom_field_values")[0]!;
    expect(flat(del[0])).toContain("value = to_jsonb(CAST(:removed AS text))");
    expect((del[1] as any).replacements).toEqual({ removed: "EU", id: 12, organizationId: ORG });
    expect(sqlCalls("UPDATE custom_field_values")).toHaveLength(0);
    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValue: "EU",
        description: "Use cases · Technical feasibility · 4 answers removed",
      }),
    );
  });

  it("drops the option from multiselect lists, then deletes lists left empty", async () => {
    serveUpdate(multiDef, [{ option_key: "b", count: 2 }], 2);
    await updateCustomFieldDefinitionQuery(13, ORG, { options: ["a"], option_removals: ["b"] }, 3);
    const [update] = sqlCalls("UPDATE custom_field_values");
    expect(flat(update[0])).toContain("SET value = value - CAST(:removed AS text)");
    expect(flat(update[0])).toContain("value @> jsonb_build_array(CAST(:removed AS text))");
    const [cleanup] = sqlCalls("DELETE FROM custom_field_values");
    expect(flat(cleanup[0])).toContain("value = '[]'::jsonb");
    expect((cleanup[1] as any).replacements).toEqual(
      expect.objectContaining({ id: 13, organizationId: ORG }),
    );
  });

  it("deletes emptied multiselect lists once, after removing several options", async () => {
    serveUpdate(
      { ...multiDef, options: ["a", "b", "c"] },
      [
        { option_key: "b", count: 2 },
        { option_key: "c", count: 1 },
      ],
      1,
    );
    await updateCustomFieldDefinitionQuery(
      13,
      ORG,
      { options: ["a"], option_removals: ["b", "c"] },
      3,
    );
    expect(sqlCalls("UPDATE custom_field_values")).toHaveLength(2);
    expect(sqlCalls("DELETE FROM custom_field_values")).toHaveLength(1);
  });

  it("deletes a scored option's answers", async () => {
    serveUpdate(scoredDef, [{ option_key: "opt_00000002", count: 80 }], 80);
    await updateCustomFieldDefinitionQuery(
      11,
      ORG,
      { options: sameOptionsMinusMedium, option_removals: ["opt_00000002"] },
      3,
    );
    expect(sqlCalls("DELETE FROM custom_field_values")).toHaveLength(1);
    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Use cases · Technical feasibility · 80 answers removed",
      }),
    );
  });

  it("rejects removing answers of an option that stays", async () => {
    serveUpdate(selectDef, [{ option_key: "EU", count: 4 }]);
    await expect(
      updateCustomFieldDefinitionQuery(
        12,
        ORG,
        { options: ["US", "EU"], option_removals: ["EU"] },
        3,
      ),
    ).rejects.toThrow(/can only list a removed option/);
  });

  it("rejects an option that is both moved and removed", async () => {
    serveUpdate(selectDef, [{ option_key: "EU", count: 4 }]);
    await expect(
      updateCustomFieldDefinitionQuery(
        12,
        ORG,
        { options: ["US"], option_moves: { EU: "US" }, option_removals: ["EU"] },
        3,
      ),
    ).rejects.toThrow(/moved or removed once, not both/);
  });

  it("rejects option_removals on a field without options", async () => {
    serveUpdate(textDef, []);
    await expect(
      updateCustomFieldDefinitionQuery(14, ORG, { option_removals: ["x"] }, 3),
    ).rejects.toThrow(/option_removals is only allowed/);
  });
});

describe("usage and delete", () => {
  it("returns total and per-option counts for a scored field", async () => {
    serveUpdate(scoredDef, [
      { option_key: "opt_00000001", count: 40 },
      { option_key: "opt_00000002", count: 80 },
    ]);
    await expect(getCustomFieldUsageQuery(11, ORG)).resolves.toEqual({
      total: 120,
      by_option: { opt_00000001: 40, opt_00000002: 80 },
    });
  });

  it("returns per-option counts for a plain select", async () => {
    serveUpdate(selectDef, [{ option_key: "EU", count: 3 }]);
    await expect(getCustomFieldUsageQuery(12, ORG)).resolves.toEqual({
      total: 3,
      by_option: { EU: 3 },
    });
  });

  it("returns only a total for a field without options", async () => {
    serveUpdate(textDef, [{ option_key: "anything", count: 3 }]);
    await expect(getCustomFieldUsageQuery(14, ORG)).resolves.toEqual({ total: 3, by_option: {} });
  });

  it("logs how many records lost their answer when a field is deleted", async () => {
    serveUpdate(scoredDef, [{ option_key: "opt_00000001", count: 12 }]);
    await expect(deleteCustomFieldDefinitionQuery(11, ORG, 3)).resolves.toBe(true);
    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "Delete",
        description: "Use cases · Technical feasibility · 12 records lost their answer",
      }),
    );
  });
});
