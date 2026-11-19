const mockQuery = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import { notifyUserAssigned } from "../inAppNotification.service";

const assignment = {
  entityType: "Model Inventory",
  entityId: 3,
  entityName: "GPT",
  roleType: "Approver" as const,
  entityUrl: "/model-inventory?modelId=3",
};

describe("notifyUserAssigned looks the assignee up in the organization", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends nothing to a user who is not a member of the organization", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await notifyUserAssigned(1, 77, assignment, "Ada", "http://x");

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/organization_members/);
    expect(options.replacements).toEqual({ userId: 77, organizationId: 1 });
  });
});
