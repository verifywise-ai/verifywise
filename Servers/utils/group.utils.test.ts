import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock the sequelize instance before importing the module under test.
const mockQuery = jest.fn<any>();

jest.mock("../database/db", () => ({
  sequelize: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

import {
  addGroupMembersQuery,
  createGroupQuery,
  getGroupMemberIdsQuery,
  getEffectiveProjectMemberIdsQuery,
  invalidateGroupMembersCache,
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
  invalidateGroupMembersCache();
});

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

  it.each([
    ["a", "too short"],
    [123, "not a string"],
    ["x".repeat(256), "too long"],
  ])("rejects invalid name %p (%s)", async (name) => {
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
      .mockResolvedValueOnce([{ id: 1 }]) // group exists
      .mockResolvedValueOnce([]); // user 9 not an org member
    await expect(addGroupMembersQuery(1, ORG, [9])).rejects.toBeInstanceOf(ValidationException);
  });

  it("dedups user ids and inserts with unnest", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 1 }]) // group exists
      .mockResolvedValueOnce([{ ok: 1 }]) // user 5 is org member
      .mockResolvedValueOnce([{ ok: 1 }]) // user 6 is org member
      .mockResolvedValueOnce(undefined); // INSERT ... SELECT
    const result = await addGroupMembersQuery(1, ORG, [5, 6, 5]);
    const [sql, options] = mockQuery.mock.calls[3] as any[];
    expect(sql).toContain("ON CONFLICT (group_id, user_id) DO NOTHING");
    expect(options.replacements.userIds).toBe("{5,6}");
    expect(result.added).toBe(0);
  });
});

describe("setProjectGroupsQuery", () => {
  it("404s when the project is in another org", async () => {
    mockQuery.mockResolvedValueOnce([]); // project lookup
    await expect(setProjectGroupsQuery(33, ORG, [1])).rejects.toBeInstanceOf(NotFoundException);
  });

  it("replaces the group set transactionally", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 33 }]) // project
      .mockResolvedValueOnce([{ id: 1 }]) // group 1
      .mockResolvedValueOnce(undefined) // DELETE
      .mockResolvedValueOnce(undefined); // INSERT
    await setProjectGroupsQuery(33, ORG, [1]);
    const [deleteSql] = mockQuery.mock.calls[2] as any[];
    const [insertSql, insertOpts] = mockQuery.mock.calls[3] as any[];
    expect(deleteSql).toContain("DELETE FROM project_groups");
    expect(insertSql).toContain("INSERT INTO project_groups");
    expect(insertOpts.replacements.groupIds).toBe("{1}");
  });
});

describe("getGroupMemberIdsQuery cache", () => {
  it("resolves through the cache and invalidates on demand", async () => {
    mockQuery.mockResolvedValue([{ user_id: 5 }, { user_id: 6 }]);
    const first = await getGroupMemberIdsQuery(1, ORG);
    const second = await getGroupMemberIdsQuery(1, ORG);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect([...first].sort()).toEqual([5, 6]);
    expect(second).toBe(first);
    invalidateGroupMembersCache(ORG, 1);
    await getGroupMemberIdsQuery(1, ORG);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe("getEffectiveProjectMemberIdsQuery", () => {
  it("unions direct members and group members", async () => {
    mockQuery.mockResolvedValue([{ user_id: 1 }, { user_id: 2 }, { user_id: 3 }]);
    const ids = await getEffectiveProjectMemberIdsQuery(10, ORG);
    const [sql] = mockQuery.mock.calls[0] as any[];
    expect(sql).toContain("projects_members");
    expect(sql).toContain("project_groups");
    expect(ids).toEqual([1, 2, 3]);
  });
});
