import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();
jest.mock("../database/db", () => ({
  sequelize: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

import { llmKeyExistsQuery } from "./llmKey.utils";

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
});
