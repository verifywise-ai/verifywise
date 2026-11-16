jest.mock("../../../../utils/risk.utils", () => ({
  archiveRiskQuery: jest.fn(),
}));

jest.mock("../../../../utils/riskVisibility.utils", () => ({
  riskViewerForUserQuery: jest.fn().mockResolvedValue({ userId: 9, role: "Editor" }),
}));

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
  });

  it("answers a risk the requester cannot see like a missing one", async () => {
    // The archive matches no row for a hidden risk, as for a missing one.
    mockArchive.mockResolvedValue(null);
    await expect(run()).rejects.toThrow("could not be deleted");
    expect(mockArchive).toHaveBeenCalledWith(7, 4, 9, TX, {
      viewer: { userId: 9, role: "Editor" },
    });
  });

  it("archives through the shared path with the requester as the actor", async () => {
    mockArchive.mockResolvedValue(true);
    await expect(run()).resolves.toEqual({ entityId: 7 });
    expect(mockArchive).toHaveBeenCalledWith(7, 4, 9, TX, {
      viewer: { userId: 9, role: "Editor" },
    });
  });

  it("throws when no active risk matched", async () => {
    mockArchive.mockResolvedValue(false);
    await expect(run()).rejects.toThrow("could not be deleted");
  });
});
