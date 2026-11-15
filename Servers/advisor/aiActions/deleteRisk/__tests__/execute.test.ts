jest.mock("../../../../utils/risk.utils", () => ({
  archiveRiskQuery: jest.fn(),
}));

jest.mock("../../../../utils/riskVisibility.utils", () => ({
  isRiskVisibleQuery: jest.fn(),
  riskViewerForUserQuery: jest.fn().mockResolvedValue({ userId: 9, role: "Editor" }),
}));

import { isRiskVisibleQuery } from "../../../../utils/riskVisibility.utils";
import { archiveRiskQuery } from "../../../../utils/risk.utils";
import { executeDeleteRisk } from "../execute";

const mockArchive = archiveRiskQuery as jest.Mock;
const TX = { id: "tx" };

const run = () =>
  executeDeleteRisk({
    inputParams: { risk_id: 7 },
    organizationId: 4,
    requesterId: 9,
    transaction: TX,
    approvalRequestId: 1,
  } as never);

describe("executeDeleteRisk", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isRiskVisibleQuery as jest.Mock).mockResolvedValue(true);
  });

  it("answers a risk the requester cannot see like a missing one", async () => {
    (isRiskVisibleQuery as jest.Mock).mockResolvedValue(false);
    await expect(run()).rejects.toThrow("could not be deleted");
    expect(mockArchive).not.toHaveBeenCalled();
  });

  it("archives through the shared path with the requester as the actor", async () => {
    mockArchive.mockResolvedValue(true);
    await expect(run()).resolves.toEqual({ entityId: 7 });
    expect(mockArchive).toHaveBeenCalledWith(7, 4, 9, TX);
  });

  it("throws when no active risk matched", async () => {
    mockArchive.mockResolvedValue(false);
    await expect(run()).rejects.toThrow("could not be deleted");
  });
});
