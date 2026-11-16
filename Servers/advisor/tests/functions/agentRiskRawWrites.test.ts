import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../utils/risk.utils");
jest.mock("../../../utils/riskVisibility.utils", () => ({
  ...(jest.requireActual("../../../utils/riskVisibility.utils") as object),
  riskViewerForUserQuery: jest.fn(),
}));
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));

import * as visibility from "../../../utils/riskVisibility.utils";
import { sequelize } from "../../../database/db";
import "../../functions/riskFunctions";
import { writeToolExecutors } from "../../confirmation/createWriteTool";

const mockQuery = sequelize.query as unknown as jest.Mock<any>;
const mockViewer = visibility.riskViewerForUserQuery as jest.Mock<any>;

const updateCall = () => {
  const call = mockQuery.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE risks"));
  return call as [string, { replacements: Record<string, unknown> }];
};

/** The UPDATE ... RETURNING id answers with these rows. */
const returning = (ids: number[]) =>
  mockQuery.mockImplementation(async (sql: any) =>
    String(sql).startsWith("UPDATE risks") ? ids.map((id) => ({ id })) : [],
  );

describe.each([
  ["agent_assign_risk_owner", { risk_id: 7, owner_user_id: 3 }],
  ["agent_change_risk_status", { risk_id: 7, status: "Completed" }],
  ["agent_bulk_update_risk_status", { risk_ids: [7], status: "Completed" }],
])("%s", (toolName, params) => {
  const execute = writeToolExecutors.get(toolName)!;

  beforeEach(() => {
    jest.clearAllMocks();
    returning([7]);
  });

  it("leaves risks the acting user cannot see alone, as missing ones", async () => {
    mockViewer.mockResolvedValue({ userId: 9, role: "Editor" });
    await execute({ ...params, _userId: 9 }, 4);

    expect(mockViewer).toHaveBeenCalledWith(9, 4);
    const [sql, { replacements }] = updateCall();
    expect(sql).toContain("organization_id = :organizationId");
    expect(sql).toContain("prv.risk_id = risks.id");
    expect(sql).toContain("risks.risk_owner = :visibilityUserId");
    expect(sql).toContain("RETURNING id");
    expect(replacements).toMatchObject({ organizationId: 4, visibilityUserId: 9 });
  });

  it("runs as the requester after an approval, not as the approver", async () => {
    mockViewer.mockResolvedValue({ userId: 5, role: "Editor" });
    await execute({ ...params, _userId: 9, _requesterId: 5 }, 4);

    expect(mockViewer).toHaveBeenCalledWith(5, 4);
    expect(updateCall()[1].replacements).toMatchObject({ visibilityUserId: 5 });
  });

  it("does not narrow the update for an Admin", async () => {
    mockViewer.mockResolvedValue({ userId: 9, role: "Admin" });
    await execute({ ...params, _userId: 9 }, 4);

    const [sql, { replacements }] = updateCall();
    expect(sql).not.toContain("visibilityUserId");
    expect(replacements.organizationId).toBe(4);
  });

  it("fails closed when the gateway sent no user: only unlinked risks match", async () => {
    await execute({ ...params }, 4);

    expect(mockViewer).not.toHaveBeenCalled();
    const [sql, { replacements }] = updateCall();
    expect(sql).toContain("prv.risk_id = risks.id");
    expect(replacements).toMatchObject({ visibilityUserId: 0 });
  });
});

describe.each([
  ["agent_assign_risk_owner", { risk_id: 7, owner_user_id: 3 }],
  ["agent_change_risk_status", { risk_id: 7, status: "Completed" }],
])("%s when nothing was written", (toolName, params) => {
  const execute = writeToolExecutors.get(toolName)!;

  beforeEach(() => {
    jest.clearAllMocks();
    mockViewer.mockResolvedValue({ userId: 9, role: "Editor" });
  });

  it("reports the risk as not found, hidden or missing alike", async () => {
    returning([]);
    await expect(execute({ ...params, _userId: 9 }, 4)).rejects.toThrow("Risk not found");
  });
});

describe("agent_bulk_update_risk_status results", () => {
  const execute = writeToolExecutors.get("agent_bulk_update_risk_status")!;

  beforeEach(() => {
    jest.clearAllMocks();
    mockViewer.mockResolvedValue({ userId: 9, role: "Editor" });
  });

  it("reports only the ids it updated and names the rest as not found", async () => {
    returning([7]);
    const result = await execute({ risk_ids: [7, 8], status: "Completed", _userId: 9 }, 4);

    expect(result).toEqual({
      updated_ids: [7],
      not_found_ids: [8],
      mitigation_status: "Completed",
      message: "1 risk(s) updated successfully. Not found: #8",
    });
  });

  it("reports every id when all were updated", async () => {
    returning([7, 8]);
    const result = (await execute({ risk_ids: [7, 8], status: "Completed", _userId: 9 }, 4)) as {
      updated_ids: number[];
      not_found_ids: number[];
      message: string;
    };

    expect(result.updated_ids).toEqual([7, 8]);
    expect(result.not_found_ids).toEqual([]);
    expect(result.message).toBe("2 risk(s) updated successfully");
  });
});
