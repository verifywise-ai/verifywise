import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn(async (..._args: any[]): Promise<any> => []);
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));
jest.mock("../fileUpload.utils", () => ({ deleteFileById: jest.fn() }));

import {
  getAllAgentPrimitivesQuery,
  reassignAgentOwnersOfDeletedUsersQuery,
} from "../agentDiscovery.utils";
import { deleteUserByIdQuery, deleteDemoUsersQuery } from "../user.utils";

const ORG_ID = 7;
const tx = { id: "tx" } as any;

const sqlOf = (call: any[]) => String(call[0]).replace(/\s+/g, " ");
const indexOfCall = (pattern: RegExp) =>
  mockQuery.mock.calls.findIndex((c) => pattern.test(sqlOf(c)));

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([]);
});

describe("reassignAgentOwnersOfDeletedUsersQuery", () => {
  it("moves the primary owner to the first remaining owner, scoped to the organization", async () => {
    await reassignAgentOwnersOfDeletedUsersQuery([5], ORG_ID, tx);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, options] = mockQuery.mock.calls[0] as [string, any];
    const flat = sql.replace(/\s+/g, " ");
    expect(flat).toContain("UPDATE agent_primitives ap SET owner_id = ( SELECT apo.user_id::text");
    expect(flat).toContain("apo.user_id NOT IN (:userIds) ORDER BY apo.id ASC LIMIT 1");
    // Only manual agents: a synced agent's owner_id is source-reported text.
    expect(flat).toContain(
      "WHERE ap.organization_id = :organizationId AND ap.is_manual = true AND ap.owner_id IN (:userIdTexts)",
    );
    expect(options.replacements).toEqual({
      organizationId: ORG_ID,
      userIds: [5],
      userIdTexts: ["5"],
    });
    expect(options.transaction).toBe(tx);
  });

  it("does nothing when no users are deleted", async () => {
    await reassignAgentOwnersOfDeletedUsersQuery([], ORG_ID, tx);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("user deletion keeps agent primary owners consistent", () => {
  it("deleteUserByIdQuery reassigns agent owners before deleting the user", async () => {
    await deleteUserByIdQuery(5, ORG_ID, tx);
    const reassign = indexOfCall(/UPDATE agent_primitives ap/);
    const del = indexOfCall(/DELETE FROM users WHERE id = :id/);
    expect(reassign).toBeGreaterThanOrEqual(0);
    expect(del).toBeGreaterThan(reassign);
    const options = mockQuery.mock.calls[reassign][1] as any;
    expect(options.replacements).toEqual(
      expect.objectContaining({ organizationId: ORG_ID, userIds: [5] }),
    );
    expect(options.transaction).toBe(tx);
  });

  it("deleteDemoUsersQuery reassigns agents owned by the demo users first", async () => {
    mockQuery.mockImplementation(async (sql: any) =>
      /SELECT id FROM users/.test(String(sql)) ? [{ id: 11 }, { id: 12 }] : [],
    );
    await deleteDemoUsersQuery(ORG_ID, tx);
    const reassign = indexOfCall(/UPDATE agent_primitives ap/);
    const del = indexOfCall(/DELETE FROM users WHERE organization_id = :organizationId/);
    expect(reassign).toBeGreaterThanOrEqual(0);
    expect(del).toBeGreaterThan(reassign);
    expect((mockQuery.mock.calls[reassign][1] as any).replacements).toEqual(
      expect.objectContaining({ organizationId: ORG_ID, userIds: [11, 12] }),
    );
  });
});

describe("getAllAgentPrimitivesQuery owner sets", () => {
  it("does not load owners unless asked (advisor callers)", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    const rows = await getAllAgentPrimitivesQuery(ORG_ID);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(sqlOf(mockQuery.mock.calls[0])).not.toContain("agent_primitive_owners");
    expect((rows[0] as any).owner_ids).toBeUndefined();
  });

  it("attaches each agent's owners with one grouped query when asked", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]).mockResolvedValueOnce([
      { agent_primitive_id: 1, user_id: 3 },
      { agent_primitive_id: 1, user_id: 4 },
    ]);
    const rows = await getAllAgentPrimitivesQuery(ORG_ID, {}, { includeOwners: true });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(sqlOf(mockQuery.mock.calls[1])).toContain("FROM agent_primitive_owners");
    expect((mockQuery.mock.calls[1][1] as any).replacements).toEqual({
      organizationId: ORG_ID,
      ids: [1, 2],
    });
    expect((rows[0] as any).owner_ids).toEqual([3, 4]);
    expect((rows[1] as any).owner_ids).toEqual([]);
  });
});
