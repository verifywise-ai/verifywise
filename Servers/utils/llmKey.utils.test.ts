import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();
jest.mock("../database/db", () => ({
  sequelize: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

import { llmKeyExistsQuery, getLLMKeyWithKeyByIdQuery } from "./llmKey.utils";

describe("llmKeyExistsQuery", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("is scoped to the organization", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 2 }] as never);
    expect(await llmKeyExistsQuery(2, 1)).toBe(true);
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/organization_id = :organizationId/);
    expect((mockQuery.mock.calls[0][1] as any).replacements).toEqual({ organizationId: 1, id: 2 });
  });

  it("is false when the organization has no such key", async () => {
    mockQuery.mockResolvedValueOnce([] as never);
    expect(await llmKeyExistsQuery(9, 1)).toBe(false);
  });

  it("does not lock the key without a transaction", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 2 }] as never);
    await llmKeyExistsQuery(2, 1);
    expect(String(mockQuery.mock.calls[0][0])).not.toMatch(/FOR KEY SHARE/);
  });

  it("locks the key inside the caller's transaction so it cannot be deleted before the write", async () => {
    const transaction = { id: "tx" } as any;
    mockQuery.mockResolvedValueOnce([{ id: 2 }] as never);
    expect(await llmKeyExistsQuery(2, 1, transaction)).toBe(true);
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/FOR KEY SHARE/);
    expect((mockQuery.mock.calls[0][1] as any).transaction).toBe(transaction);
  });
});

describe("getLLMKeyWithKeyByIdQuery", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("selects only the requested key of the organization", async () => {
    const row = { id: 2, name: "OpenAI", key: "sk-test", model: "gpt-4o-mini" };
    mockQuery.mockResolvedValueOnce([row] as never);
    expect(await getLLMKeyWithKeyByIdQuery(2, 1)).toEqual(row);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toMatch(/organization_id = :organizationId/);
    expect(sql).toMatch(/id = :id/);
    expect((mockQuery.mock.calls[0][1] as any).replacements).toEqual({ organizationId: 1, id: 2 });
  });

  it("is null when the organization has no such key", async () => {
    mockQuery.mockResolvedValueOnce([] as never);
    expect(await getLLMKeyWithKeyByIdQuery(9, 1)).toBeNull();
  });
});
