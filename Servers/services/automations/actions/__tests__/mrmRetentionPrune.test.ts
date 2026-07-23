import {
  PRUNE_BATCH_SIZE,
  PRUNE_MAX_BATCHES,
  runRetentionPrune,
  runRetentionPruneAllOrgs,
} from "../mrmRetentionPrune";
import { getMrmOrgSettings } from "../../../../utils/mrmSettings.utils";
import {
  getRetentionCutoffQuery,
  pruneMetricsBatchQuery,
} from "../../../../utils/mrmRetention.utils";
import { getAllOrganizationsQuery } from "../../../../utils/organization.utils";

jest.mock("../../../../utils/mrmSettings.utils", () => ({
  getMrmOrgSettings: jest.fn(),
}));
jest.mock("../../../../utils/mrmRetention.utils", () => ({
  getRetentionCutoffQuery: jest.fn(),
  pruneMetricsBatchQuery: jest.fn(),
}));
jest.mock("../../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

const mockSettings = getMrmOrgSettings as jest.Mock;
const mockCutoff = getRetentionCutoffQuery as jest.Mock;
const mockPruneBatch = pruneMetricsBatchQuery as jest.Mock;
const mockAllOrgs = getAllOrganizationsQuery as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.mockResolvedValue({ organization_id: 1, retention_months: 25 });
  mockCutoff.mockResolvedValue("2024-06-10 00:00:00+00");
});

describe("runRetentionPrune", () => {
  it("stops after one batch when fewer than batchSize rows were deleted", async () => {
    mockPruneBatch.mockResolvedValueOnce(42);
    const summary = await runRetentionPrune(1);
    expect(mockPruneBatch).toHaveBeenCalledTimes(1);
    expect(mockPruneBatch).toHaveBeenCalledWith(1, 25, PRUNE_BATCH_SIZE);
    expect(summary).toEqual({
      organization_id: 1,
      cutoff: "2024-06-10 00:00:00+00",
      deleted: 42,
      batches: 1,
      capped: false,
    });
  });

  it("loops full batches and sums deletions until a short batch", async () => {
    mockPruneBatch
      .mockResolvedValueOnce(PRUNE_BATCH_SIZE)
      .mockResolvedValueOnce(PRUNE_BATCH_SIZE)
      .mockResolvedValueOnce(7);
    const summary = await runRetentionPrune(1);
    expect(mockPruneBatch).toHaveBeenCalledTimes(3);
    expect(summary.deleted).toBe(PRUNE_BATCH_SIZE * 2 + 7);
    expect(summary.batches).toBe(3);
    expect(summary.capped).toBe(false);
  });

  it("caps at PRUNE_MAX_BATCHES and reports capped: true", async () => {
    mockPruneBatch.mockResolvedValue(PRUNE_BATCH_SIZE); // every batch full
    const summary = await runRetentionPrune(1);
    expect(mockPruneBatch).toHaveBeenCalledTimes(PRUNE_MAX_BATCHES);
    expect(summary.batches).toBe(PRUNE_MAX_BATCHES);
    expect(summary.deleted).toBe(PRUNE_BATCH_SIZE * PRUNE_MAX_BATCHES);
    expect(summary.capped).toBe(true);
  });

  it("uses the org's configured retention_months", async () => {
    mockSettings.mockResolvedValue({ organization_id: 9, retention_months: 36 });
    mockPruneBatch.mockResolvedValueOnce(0);
    await runRetentionPrune(9);
    expect(mockCutoff).toHaveBeenCalledWith(36);
    expect(mockPruneBatch).toHaveBeenCalledWith(9, 36, PRUNE_BATCH_SIZE);
  });
});

describe("runRetentionPruneAllOrgs", () => {
  it("prunes every org and isolates a failing org", async () => {
    mockAllOrgs.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    mockSettings.mockImplementation(async (orgId: number) => {
      if (orgId === 2) throw new Error("boom");
      return { organization_id: orgId, retention_months: 25 };
    });
    mockPruneBatch.mockResolvedValue(0);
    await expect(runRetentionPruneAllOrgs()).resolves.toBeUndefined();
    // org 1 and 3 still pruned despite org 2 failing
    expect(mockPruneBatch).toHaveBeenCalledWith(1, 25, PRUNE_BATCH_SIZE);
    expect(mockPruneBatch).toHaveBeenCalledWith(3, 25, PRUNE_BATCH_SIZE);
  });

  it("skips orgs with undefined/null ids", async () => {
    mockAllOrgs.mockResolvedValue([{ id: undefined }, { id: 5 }]);
    mockPruneBatch.mockResolvedValue(0);
    await runRetentionPruneAllOrgs();
    expect(mockPruneBatch).toHaveBeenCalledTimes(1);
    expect(mockPruneBatch).toHaveBeenCalledWith(5, 25, PRUNE_BATCH_SIZE);
  });
});
