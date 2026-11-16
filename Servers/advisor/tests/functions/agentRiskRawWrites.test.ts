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

describe.each([
  ["agent_assign_risk_owner", { risk_id: 7, owner_user_id: 3 }],
  ["agent_change_risk_status", { risk_id: 7, status: "Completed" }],
  ["agent_bulk_update_risk_status", { risk_ids: [7, 8], status: "Completed" }],
])("%s", (toolName, params) => {
  const execute = writeToolExecutors.get(toolName)!;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([[], 0]);
  });

  it("leaves risks the acting user cannot see alone, as missing ones", async () => {
    mockViewer.mockResolvedValue({ userId: 9, role: "Editor" });
    await execute({ ...params, _userId: 9 }, 4);

    expect(mockViewer).toHaveBeenCalledWith(9, 4, undefined);
    const [sql, { replacements }] = updateCall();
    expect(sql).toContain("organization_id = :organizationId");
    expect(sql).toContain("prv.risk_id = risks.id");
    expect(sql).toContain("risks.risk_owner = :visibilityUserId");
    expect(replacements).toMatchObject({ organizationId: 4, visibilityUserId: 9 });
  });

  it("does not narrow the update for an Admin", async () => {
    mockViewer.mockResolvedValue({ userId: 9, role: "Admin" });
    await execute({ ...params, _userId: 9 }, 4);

    const [sql, { replacements }] = updateCall();
    expect(sql).not.toContain("visibilityUserId");
    expect(replacements.organizationId).toBe(4);
  });

  it("acts as before when the gateway sent no user", async () => {
    await execute({ ...params }, 4);

    expect(mockViewer).not.toHaveBeenCalled();
    expect(updateCall()[0]).not.toContain("visibilityUserId");
  });

  it("reports the same result whether or not a risk was visible", async () => {
    mockViewer.mockResolvedValue({ userId: 9, role: "Editor" });
    const hidden = await execute({ ...params, _userId: 9 }, 4);
    mockViewer.mockResolvedValue({ userId: 9, role: "Admin" });
    const shown = await execute({ ...params, _userId: 9 }, 4);
    expect(hidden).toEqual(shown);
  });
});
