const mockQuery = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));
jest.mock("../../utils/risk.utils", () => ({
  getProjectTitlesByRiskIdsQuery: jest.fn(async () => new Map()),
}));
const mockAssigned = jest.fn();
const mockAssignedMany = jest.fn();
jest.mock("../inAppNotification.service", () => ({
  notifyUserAssigned: (...args: unknown[]) => mockAssigned(...args),
  notifyUserAssignedMany: (...args: unknown[]) => mockAssignedMany(...args),
}));
const mockLogError = jest.fn();
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: (...args: unknown[]) => mockLogError(...args) },
}));

import { notifyRiskApprovers } from "../riskApproverNotification.service";

const risk = (id: number, approver: number) => ({
  id,
  risk_name: `Risk ${id}`,
  risk_description: "d",
  risk_approval: approver,
});

describe("notifyRiskApprovers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([{ name: "Ada", surname: "Lovelace" }]);
    mockAssigned.mockResolvedValue(undefined);
    mockAssignedMany.mockResolvedValue(undefined);
  });

  it("sends one notice per approver, listing their risks", async () => {
    await notifyRiskApprovers(1, 5, [risk(10, 8), risk(11, 8), risk(12, 9), risk(13, 8)]);

    expect(mockAssignedMany).toHaveBeenCalledTimes(1);
    const [org, approver, assignment, assigner] = mockAssignedMany.mock.calls[0];
    expect(org).toBe(1);
    expect(approver).toBe(8);
    expect(assigner).toBe("Ada Lovelace");
    expect(assignment).toMatchObject({
      roleType: "Risk Approver",
      entityUrl: "/risk-management",
      items: [
        { id: 10, name: "Risk 10" },
        { id: 11, name: "Risk 11" },
        { id: 13, name: "Risk 13" },
      ],
    });

    // A single risk gets the usual single-risk notice.
    expect(mockAssigned).toHaveBeenCalledTimes(1);
    expect(mockAssigned.mock.calls[0][1]).toBe(9);
    expect(mockAssigned.mock.calls[0][2]).toMatchObject({
      entityId: 12,
      roleType: "Risk Approver",
    });
  });

  it("never notifies the importing user about themself", async () => {
    await notifyRiskApprovers(1, 5, [risk(10, 5), risk(11, 5)]);
    expect(mockAssigned).not.toHaveBeenCalled();
    expect(mockAssignedMany).not.toHaveBeenCalled();
  });

  it("keeps going when one approver's notice fails", async () => {
    mockAssignedMany.mockRejectedValueOnce(new Error("smtp down"));
    await notifyRiskApprovers(1, 5, [risk(10, 8), risk(11, 8), risk(12, 9)]);
    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockAssigned).toHaveBeenCalledTimes(1);
  });
});
