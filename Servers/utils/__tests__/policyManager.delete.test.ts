import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
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
    expect(recordEntityDeletion).not.toHaveBeenCalled();
    expect(deleteAllCustomFieldValuesForEntityQuery).not.toHaveBeenCalled();
  });

  it("removes the leftovers org-scoped on the transaction, then records the deletion", async () => {
    mockQuery.mockImplementation((async (sql: string) =>
      String(sql).includes("FROM policy_manager p") || String(sql).includes("SELECT")
        ? [{ id: 10, assigned_reviewer_ids: [] }]
        : []) as any);

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
});
