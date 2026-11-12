import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn(async (..._args: any[]): Promise<any> => []);
const mockTx = { id: "tx" };
jest.mock("../../database/db", () => ({
  sequelize: {
    query: (...args: any[]) => mockQuery(...args),
    transaction: async () => mockTx,
  },
}));
jest.mock("../auditLedger.utils", () => ({
  appendToAuditLedger: jest.fn(async () => undefined),
}));

import { ENTITY_TYPE_TO_TABLE, setCustomFieldValueQuery } from "../customField.utils";

const ORG = 7;
const flat = (sql: unknown) => String(sql).replace(/\s+/g, " ").trim();

const textDef = {
  id: 21,
  organization_id: ORG,
  entity_type: "ai_app",
  field_key: "notes",
  label: "Notes",
  field_type: "text",
  options: null,
  required: false,
};

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: unknown) => {
    const s = flat(sql);
    if (s.startsWith("SELECT * FROM custom_field_definitions")) return [textDef];
    if (s.startsWith("SELECT 1 AS ok FROM")) return [{ ok: 1 }];
    if (s.startsWith("INSERT INTO custom_field_values")) return [{ id: 1, definition_id: 21 }];
    return [];
  });
});

describe("AI apps as a custom-field entity", () => {
  it("maps ai_app to the ai_apps table", () => {
    expect(ENTITY_TYPE_TO_TABLE.ai_app).toBe("ai_apps");
  });

  it("runs the ownership check inside the caller's transaction", async () => {
    await setCustomFieldValueQuery(
      { definition_id: 21, entity_id: 5, value: "hello" },
      ORG,
      mockTx as any,
    );
    const check = mockQuery.mock.calls.find((c) =>
      flat(c[0]).startsWith("SELECT 1 AS ok FROM ai_apps"),
    )!;
    expect(check).toBeDefined();
    expect((check[1] as any).transaction).toBe(mockTx);
  });
});
