import { runFileExpirySweep, runFileExpirySweepAllOrgs } from "../fileExpirySweep";
import { sequelize } from "../../../../database/db";
import { getAllOrganizationsQuery } from "../../../../utils/organization.utils";
import { notifyFileExpiring } from "../../../inAppNotification.service";

jest.mock("../../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
}));
jest.mock("../../../inAppNotification.service", () => ({
  notifyFileExpiring: jest.fn(),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

const mockQuery = sequelize.query as jest.Mock;
const mockAllOrgs = getAllOrganizationsQuery as jest.Mock;
const mockNotify = notifyFileExpiring as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("runFileExpirySweep", () => {
  it("notifies uploader for each row returned by the 7-day window query", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 1, filename: "a.pdf", uploaded_by: 42, expiry_date: "2026-01-20", days_remaining: 5 },
      { id: 2, filename: "b.pdf", uploaded_by: 99, expiry_date: "2026-01-15", days_remaining: 0 },
    ]);

    const { summary } = await runFileExpirySweep(7);

    expect(summary).toEqual({ organization_id: 7, candidates: 2, notified: 2 });
    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(mockNotify).toHaveBeenCalledWith(
      7,
      42,
      expect.objectContaining({ id: 1, name: "a.pdf", daysRemaining: 5 }),
      expect.any(String),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      7,
      99,
      expect.objectContaining({ id: 2, name: "b.pdf", daysRemaining: 0 }),
      expect.any(String),
    );
  });

  it("continues past a per-file notification failure", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 1, filename: "a.pdf", uploaded_by: 42, expiry_date: "2026-01-20", days_remaining: 5 },
      { id: 2, filename: "b.pdf", uploaded_by: 99, expiry_date: "2026-01-15", days_remaining: 0 },
    ]);
    mockNotify.mockRejectedValueOnce(new Error("email down")).mockResolvedValueOnce(undefined);

    const { summary } = await runFileExpirySweep(7);
    expect(summary.candidates).toBe(2);
    expect(summary.notified).toBe(1);
  });

  it("issues zero notifications when the window matches nothing", async () => {
    mockQuery.mockResolvedValueOnce([]);
    const { summary } = await runFileExpirySweep(7);
    expect(summary).toEqual({ organization_id: 7, candidates: 0, notified: 0 });
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("runFileExpirySweepAllOrgs", () => {
  it("sweeps each org and isolates a failing org", async () => {
    mockAllOrgs.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    mockQuery.mockImplementation(async (_sql: string, opts: any) => {
      if (opts?.replacements?.organizationId === 2) throw new Error("boom");
      return [];
    });

    await expect(runFileExpirySweepAllOrgs()).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it("skips orgs with undefined ids", async () => {
    mockAllOrgs.mockResolvedValue([{ id: undefined }, { id: 5 }]);
    mockQuery.mockResolvedValue([]);
    await runFileExpirySweepAllOrgs();
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        replacements: expect.objectContaining({ organizationId: 5 }),
      }),
    );
  });
});
