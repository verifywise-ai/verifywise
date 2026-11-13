/**
 * @fileoverview Tests for governance status updates and stored decisions in
 * the AI Detection service.
 */

jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));

jest.mock("../../../database/redis", () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock("../../../utils/aiDetection.utils", () => ({
  getScanByIdQuery: jest.fn(),
  updateFindingGovernanceStatusQuery: jest.fn(),
}));

jest.mock("../../../utils/aiDetectionDecisions.utils", () => ({
  applyGovernanceDecisionsToScanQuery: jest.fn(),
  beginOrganizationTransaction: jest.fn(),
  getScanDecisionScopeQuery: jest.fn(),
  writeGovernanceDecisionQuery: jest.fn(),
}));

import {
  applyStoredGovernanceDecisions,
  updateFindingGovernanceStatus,
} from "../../aiDetection.service";
import {
  getScanByIdQuery,
  updateFindingGovernanceStatusQuery,
} from "../../../utils/aiDetection.utils";
import {
  applyGovernanceDecisionsToScanQuery,
  beginOrganizationTransaction,
  writeGovernanceDecisionQuery,
} from "../../../utils/aiDetectionDecisions.utils";
import { sequelize } from "../../../database/db";
import logger from "../../../utils/logger/fileLogger";
import { NotFoundException } from "../../../domain.layer/exceptions/custom.exception";

const ctx = { userId: 7, role: "Admin", organizationId: 3 };
const tx = { commit: jest.fn(), rollback: jest.fn() };

describe("updateFindingGovernanceStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getScanByIdQuery as jest.Mock).mockResolvedValue({ id: 10 });
    (beginOrganizationTransaction as jest.Mock).mockResolvedValue(tx);
    (updateFindingGovernanceStatusQuery as jest.Mock).mockResolvedValue({
      id: 5,
      governance_updated_at: new Date("2026-11-03T10:00:00Z"),
      governance_updated_by_name: "Ada Lovelace",
    });
  });

  it("writes the finding and the stored decision in one transaction bound to the organization", async () => {
    (writeGovernanceDecisionQuery as jest.Mock).mockResolvedValue(true);
    const result = await updateFindingGovernanceStatus(10, 5, "approved", ctx);

    expect(beginOrganizationTransaction).toHaveBeenCalledWith(3);
    // Never a bare transaction, which would skip the RLS organization
    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(updateFindingGovernanceStatusQuery).toHaveBeenCalledWith(5, 10, "approved", 7, 3, tx);
    expect(writeGovernanceDecisionQuery).toHaveBeenCalledWith(5, 10, "approved", 7, 3, tx);
    expect(tx.commit).toHaveBeenCalled();
    expect(result).toEqual({
      id: 5,
      governance_status: "approved",
      governance_updated_at: "2026-11-03T10:00:00.000Z",
      governance_updated_by: 7,
      governance_updated_by_name: "Ada Lovelace",
      decision_scope: "repository",
    });
  });

  it("reports a change on an older scan as applying to that scan only", async () => {
    (writeGovernanceDecisionQuery as jest.Mock).mockResolvedValue(false);
    const result = await updateFindingGovernanceStatus(10, 5, null, ctx);
    expect(result).toMatchObject({
      governance_status: null,
      governance_updated_at: null,
      governance_updated_by: null,
      governance_updated_by_name: null,
      decision_scope: "scan",
    });
  });

  it("rolls back and stores nothing when the finding is not in the scan", async () => {
    (updateFindingGovernanceStatusQuery as jest.Mock).mockResolvedValue(null);
    await expect(updateFindingGovernanceStatus(10, 5, "approved", ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(writeGovernanceDecisionQuery).not.toHaveBeenCalled();
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
  });
});

describe("applyStoredGovernanceDecisions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("applies the stored decisions to the completed scan", async () => {
    (applyGovernanceDecisionsToScanQuery as jest.Mock).mockResolvedValue(2);
    await applyStoredGovernanceDecisions(10, 3);
    expect(applyGovernanceDecisionsToScanQuery).toHaveBeenCalledWith(10, 3);
  });

  it("logs a failure instead of failing the scan", async () => {
    (applyGovernanceDecisionsToScanQuery as jest.Mock).mockRejectedValue(new Error("db down"));
    await expect(applyStoredGovernanceDecisions(10, 3)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
