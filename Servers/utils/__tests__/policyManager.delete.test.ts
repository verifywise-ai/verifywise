import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../config/changeHistory.config", () => ({
  runInSavepoint: jest.fn(async (work: () => Promise<unknown>) => work()),
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("../changeHistory.base.utils", () => ({
  recordEntityDeletion: jest.fn(),
}));
jest.mock("../customField.utils", () => ({
  deleteAllCustomFieldValuesForEntityQuery: jest.fn(),
  fetchCustomFieldsForEntities: jest.fn(),
}));

import { sequelize } from "../../database/db";
import { deletePolicyByIdQuery } from "../policyManager.utils";
import { runInSavepoint } from "../../config/changeHistory.config";
import { recordEntityDeletion } from "../changeHistory.base.utils";
import { deleteAllCustomFieldValuesForEntityQuery } from "../customField.utils";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const tx = { id: "tx" } as any;

describe("deletePolicyByIdQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  it("returns false and touches nothing when the policy does not exist", async () => {
    mockQuery.mockResolvedValue([] as any);
    expect(await deletePolicyByIdQuery(4, 10, 7, tx)).toBe(false);
    const issued = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(issued.some((sql) => sql.trim().startsWith("DELETE"))).toBe(false);
    expect(recordEntityDeletion).not.toHaveBeenCalled();
    expect(deleteAllCustomFieldValuesForEntityQuery).not.toHaveBeenCalled();
  });

  it("removes the leftovers org-scoped on the transaction, then records the deletion", async () => {
    mockQuery.mockImplementation((async (sql: string) =>
      String(sql).includes("FROM policy_manager pm")
        ? [{ id: 10, assigned_reviewer_ids: [] }]
        : [[], 0]) as any);

    expect(await deletePolicyByIdQuery(4, 10, 7, tx)).toBe(true);

    const deletes = mockQuery.mock.calls.filter((c) => String(c[0]).trim().startsWith("DELETE"));
    const tables = deletes.map((c) => /DELETE FROM (\w+)/.exec(String(c[0]))![1]);
    expect(tables).toEqual([
      "policy_folder_mappings",
      "ce_marking_policies",
      "task_entity_links",
      "share_links",
      "policy_manager",
    ]);
    for (const call of deletes) {
      expect(String(call[0])).toContain("organization_id = :organizationId");
      expect((call[1] as any).transaction).toBe(tx);
      expect((call[1] as any).replacements).toEqual({ organizationId: 4, id: 10 });
    }
    expect(String(deletes[2][0])).toContain("entity_type = 'policy'");
    expect(String(deletes[3][0])).toContain("resource_type = 'policy'");
    expect(tables).not.toContain("policy_change_history");

    expect(deleteAllCustomFieldValuesForEntityQuery).toHaveBeenCalledWith("policy", 10, 4, tx);
    expect(recordEntityDeletion).toHaveBeenCalledWith("policy", 10, 7, 4, tx);
  });

  const policyRowOnly = () =>
    mockQuery.mockImplementation((async (sql: string) =>
      String(sql).includes("FROM policy_manager pm")
        ? [{ id: 10, assigned_reviewer_ids: [] }]
        : [[], 0]) as any);

  it("still deletes when the history write fails", async () => {
    policyRowOnly();
    (recordEntityDeletion as any).mockRejectedValueOnce(new Error("insert failed"));
    expect(await deletePolicyByIdQuery(4, 10, 7, tx)).toBe(true);
    expect(runInSavepoint).toHaveBeenCalledWith(expect.any(Function), tx);
  });

  it("records no history without an acting user", async () => {
    policyRowOnly();
    expect(await deletePolicyByIdQuery(4, 10, null, tx)).toBe(true);
    expect(recordEntityDeletion).not.toHaveBeenCalled();
  });
});
