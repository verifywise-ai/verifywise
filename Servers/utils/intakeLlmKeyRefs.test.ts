import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();
const mockTransaction = jest.fn();
jest.mock("../database/db", () => ({
  sequelize: {
    query: (...args: unknown[]) => mockQuery(...args),
    transaction: (fn: (t: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));

import { getIntakeFormByIdQuery } from "./intakeForm.utils";
import { deleteLLMKeyQuery, llmKeyExistsQuery } from "./llmKey.utils";

describe("intake form llm key references", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.mockImplementation(async (fn: any) => fn("tx"));
  });

  it("reads llmKeyId only when the key still exists in the organization", async () => {
    mockQuery.mockResolvedValue([] as never);
    await getIntakeFormByIdQuery(1, 1);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toMatch(/llm_keys/);
    expect(sql).toMatch(/organization_id\s*=\s*intake_forms\.organization_id/);
    expect(sql).toMatch(/as "llmKeyId"/);
  });

  it("deleting a key clears it from the organization's intake forms in the same transaction", async () => {
    mockQuery.mockResolvedValue([{ id: 8 }] as never);
    const ok = await deleteLLMKeyQuery(8, 1);

    expect(ok).toBe(true);
    const sqls = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => /UPDATE intake_forms SET llm_key_id = NULL/.test(s))).toBe(true);
    for (const c of mockQuery.mock.calls) {
      expect((c[1] as any).transaction).toBe("tx");
      expect((c[1] as any).replacements).toEqual({ organizationId: 1, id: 8 });
    }
  });

  it("llmKeyExistsQuery is scoped to the organization", async () => {
    mockQuery.mockResolvedValue([{ id: 2 }] as never);
    expect(await llmKeyExistsQuery(2, 1)).toBe(true);
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/organization_id = :organizationId/);
    mockQuery.mockResolvedValue([] as never);
    expect(await llmKeyExistsQuery(9, 1)).toBe(false);
  });
});
