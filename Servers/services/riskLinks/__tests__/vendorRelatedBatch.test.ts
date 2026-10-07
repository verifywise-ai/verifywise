jest.mock("../../../utils/vendorRiskLink.utils");
jest.mock("../../../utils/riskLink.utils");
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn() },
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { sequelize } from "../../../database/db";
import * as vendorUtils from "../../../utils/vendorRiskLink.utils";
import { VendorRiskScoringRow } from "../../../utils/vendorRiskLink.utils";
import { recomputeVendorRiskLinksBatch } from "../vendorRelated";

const mockVendorUtils = vendorUtils as jest.Mocked<typeof vendorUtils>;
const commit = jest.fn();
const rollback = jest.fn();

const row = (id: number): VendorRiskScoringRow => ({
  id,
  vendor_id: 10,
  risk_description: null,
  impact_description: null,
  frameworks: [],
  use_cases: [],
});

beforeEach(() => {
  jest.resetAllMocks();
  (sequelize.transaction as jest.Mock).mockResolvedValue({ commit, rollback });
  mockVendorUtils.getRecomputeOwnedVendorLinksQuery.mockResolvedValue([]);
});

describe("recomputeVendorRiskLinksBatch", () => {
  it("reads the org's vendor risk rows once for the whole batch", async () => {
    mockVendorUtils.getVendorRiskScoringRowsQuery.mockResolvedValue([row(5), row(6)]);
    const failed = await recomputeVendorRiskLinksBatch(1, [5, 6]);
    expect(failed).toEqual([]);
    expect(mockVendorUtils.getVendorRiskScoringRowsQuery).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it("carries on past a vendor risk that fails and reports it for retry", async () => {
    mockVendorUtils.getVendorRiskScoringRowsQuery.mockResolvedValue([row(5), row(6)]);
    mockVendorUtils.getRecomputeOwnedVendorLinksQuery
      .mockRejectedValueOnce(new Error("deadlock detected"))
      .mockResolvedValue([]);
    const failed = await recomputeVendorRiskLinksBatch(1, [5, 6]);
    expect(failed).toEqual([5]);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
