import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock the sequelize instance before importing the module under test.
const mockQuery = jest.fn<(sql: string, options?: unknown) => Promise<any>>();
const mockTx = { id: "tx" };
const mockTransaction = jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(mockTx));

jest.mock("../database/db", () => ({
  sequelize: {
    query: (sql: string, options?: unknown) => mockQuery(sql, options),
    transaction: (cb: (t: unknown) => Promise<unknown>) => mockTransaction(cb),
  },
}));

import {
  addGroupMembersQuery,
  createGroupQuery,
  getGroupByIdQuery,
  setGroupMembersQuery,
  setProjectGroupsQuery,
  updateGroupByIdQuery,
} from "./group.utils";
import {
  ValidationException,
  NotFoundException,
} from "../domain.layer/exceptions/custom.exception";

const ORG = 7;

beforeEach(() => {
  mockQuery.mockReset();
  mockTransaction.mockClear();
});

/** Every query after the first `from` calls ran inside the transaction. */
const expectAllInTransaction = (from = 0) => {
  for (const call of mockQuery.mock.calls.slice(from)) {
    expect((call[1] as any).transaction).toBe(mockTx);
  }
};

describe("createGroupQuery", () => {
  it("creates a group with trimmed name", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, name: "Model risk team" }]);
    const group = await createGroupQuery(
      { name: "  Model risk team  ", description: "Reviews models" },
      ORG,
      42,
    );
    expect(group.id).toBe(1);
    const [sql, options] = mockQuery.mock.calls[0] as any[];
    expect(sql).toContain("INSERT INTO groups");
    expect(options.replacements.name).toBe("Model risk team");
    expect(options.replacements.organizationId).toBe(ORG);
  });

  it.each<[string | number, string]>([
    ["a", "too short"],
    [123, "not a string"],
    ["x".repeat(256), "too long"],
  ])("rejects invalid name %p (%s)", async (name, _desc) => {
    await expect(createGroupQuery({ name }, ORG, 42)).rejects.toBeInstanceOf(ValidationException);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("maps unique violation to ConflictException", async () => {
    mockQuery.mockRejectedValueOnce({ original: { code: "23505" } });
    await expect(createGroupQuery({ name: "Model risk team" }, ORG, 42)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe("updateGroupByIdQuery", () => {
  it("throws when nothing to update", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1 }]); // getGroupByIdOrThrowQuery
    await expect(updateGroupByIdQuery(1, ORG, {})).rejects.toBeInstanceOf(ValidationException);
  });

  it("pushes only supplied fields into SET", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 1 }]) // getGroupByIdOrThrowQuery
      .mockResolvedValueOnce([{ id: 1, name: "New name" }]);
    await updateGroupByIdQuery(1, ORG, { name: "New name" });
    const [sql] = mockQuery.mock.calls[1] as any[];
    expect(sql).toContain("name = :name");
    expect(sql).not.toContain("description = :description");
  });
});

describe("addGroupMembersQuery", () => {
  it("validates org membership of every user", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 1 }]) // group exists (locked)
      .mockResolvedValueOnce([]); // user 9 not an org member
    await expect(addGroupMembersQuery(1, ORG, [9])).rejects.toBeInstanceOf(ValidationException);
  });

  it("dedups user ids and inserts with unnest, in one transaction", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 1 }]) // group exists (locked)
      .mockResolvedValueOnce([{ user_id: 5 }, { user_id: 6 }]) // org members
      .mockResolvedValueOnce([{ others: 0 }]) // existing members outside the request
      .mockResolvedValueOnce(undefined); // INSERT ... SELECT
    const result = await addGroupMembersQuery(1, ORG, [5, 6, 5]);
    expect(mockQuery.mock.calls[0][0]).toContain("FOR UPDATE");
    const [sql, options] = mockQuery.mock.calls[3] as any[];
    expect(sql).toContain("ON CONFLICT (group_id, user_id) DO NOTHING");
    expect(options.replacements.userIds).toBe("{5,6}");
    expect(result.added).toBe(0);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expectAllInTransaction();
  });

  it("caps the group's total members, not the request size", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 1 }]) // group exists
      .mockResolvedValueOnce([{ user_id: 5 }]) // org member
      .mockResolvedValueOnce([{ others: 500 }]); // group is already full
    await expect(addGroupMembersQuery(1, ORG, [5])).rejects.toThrow(/at most 500 members/);
    expect(mockQuery).toHaveBeenCalledTimes(3); // nothing inserted
  });
});

describe("setGroupMembersQuery", () => {
  it("validates, deletes and inserts in one transaction", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 1 }]) // group exists (locked)
      .mockResolvedValueOnce([{ user_id: 5 }]) // org member
      .mockResolvedValueOnce(undefined) // DELETE
      .mockResolvedValueOnce(undefined); // INSERT
    await setGroupMembersQuery(1, ORG, [5]);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[2][0]).toContain("DELETE FROM group_members");
    expect(mockQuery.mock.calls[3][0]).toContain("INSERT INTO group_members");
    expectAllInTransaction();
  });

  it("propagates an insert failure so the transaction rolls the delete back", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ user_id: 5 }])
      .mockResolvedValueOnce(undefined) // DELETE
      .mockRejectedValueOnce(new Error("insert failed"));
    await expect(setGroupMembersQuery(1, ORG, [5])).rejects.toThrow("insert failed");
    expectAllInTransaction();
  });

  it("rejects more than 500 distinct members before touching the database", async () => {
    const ids = Array.from({ length: 501 }, (_, i) => i + 1);
    await expect(setGroupMembersQuery(1, ORG, ids)).rejects.toBeInstanceOf(ValidationException);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("setProjectGroupsQuery", () => {
  it("404s when the project is in another org", async () => {
    mockQuery.mockResolvedValueOnce([]); // project lookup
    await expect(setProjectGroupsQuery(33, ORG, [1])).rejects.toBeInstanceOf(NotFoundException);
  });

  it("replaces the group set in one transaction", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 33 }]) // project
      .mockResolvedValueOnce([{ id: 1 }]) // groups lookup
      .mockResolvedValueOnce(undefined) // DELETE
      .mockResolvedValueOnce(undefined); // INSERT
    await setProjectGroupsQuery(33, ORG, [1]);
    const [deleteSql] = mockQuery.mock.calls[2] as any[];
    const [insertSql, insertOpts] = mockQuery.mock.calls[3] as any[];
    expect(deleteSql).toContain("DELETE FROM project_groups");
    expect(insertSql).toContain("INSERT INTO project_groups");
    expect(insertOpts.replacements.groupIds).toBe("{1}");
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expectAllInTransaction();
  });

  it("checks every group with one org-scoped query", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 33 }]) // project
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]) // groups lookup
      .mockResolvedValueOnce(undefined) // DELETE
      .mockResolvedValueOnce(undefined); // INSERT
    await setProjectGroupsQuery(33, ORG, [1, 2, 3, 2]);
    expect(mockQuery).toHaveBeenCalledTimes(4);
    const [lookupSql, lookupOpts] = mockQuery.mock.calls[1] as any[];
    expect(lookupSql).toContain("FROM groups");
    expect(lookupSql).toContain("organization_id = :organizationId");
    expect(lookupSql).toContain("id IN (:ids)");
    expect(lookupOpts.replacements).toEqual({ organizationId: ORG, ids: [1, 2, 3] });
    expectAllInTransaction();
  });

  it("404s on a group outside the org and writes nothing", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 33 }]) // project
      .mockResolvedValueOnce([{ id: 1 }]); // only group 1 is in the org
    await expect(setProjectGroupsQuery(33, ORG, [1, 9])).rejects.toThrow("Group 9 not found");
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("skips the groups lookup when clearing all groups", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 33 }]) // project
      .mockResolvedValueOnce(undefined); // DELETE
    await setProjectGroupsQuery(33, ORG, []);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect((mockQuery.mock.calls[1] as any[])[0]).toContain("DELETE FROM project_groups");
  });
});

describe("getGroupByIdQuery", () => {
  it.each([NaN, 0, -1, 1.5])("rejects %p as a ValidationException without querying", async (id) => {
    await expect(getGroupByIdQuery(id, ORG)).rejects.toBeInstanceOf(ValidationException);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns the org-scoped group", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 5, member_count: 2 }]);
    const group = await getGroupByIdQuery(5, ORG);
    expect(group).toEqual({ id: 5, member_count: 2 });
    const [, options] = mockQuery.mock.calls[0] as any[];
    expect(options.replacements).toEqual({ organizationId: ORG, groupId: 5 });
  });
});
