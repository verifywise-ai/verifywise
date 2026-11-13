/**
 * @fileoverview Tests for recording what was done with a scan's suggested risks.
 */

jest.mock("../../../utils/aiDetection.utils", () => ({
  getScanByIdQuery: jest.fn(),
}));

jest.mock("../../../utils/aiDetectionDecisions.utils", () => ({
  suggestionKey: (name: string) => name.trim().toLowerCase(),
  getSuggestedRiskActionQuery: jest.fn(),
  listSuggestedRiskActionsQuery: jest.fn(),
  riskExistsInOrganizationQuery: jest.fn(),
  upsertSuggestedRiskActionQuery: jest.fn(),
  deleteSuggestedRiskActionQuery: jest.fn(),
}));

import {
  deleteSuggestedRiskAction,
  listSuggestedRiskActions,
  recordSuggestedRiskAction,
} from "../../aiDetectionSuggestedRisks.service";
import { getScanByIdQuery } from "../../../utils/aiDetection.utils";
import {
  deleteSuggestedRiskActionQuery,
  getSuggestedRiskActionQuery,
  listSuggestedRiskActionsQuery,
  riskExistsInOrganizationQuery,
  upsertSuggestedRiskActionQuery,
} from "../../../utils/aiDetectionDecisions.utils";
import {
  BusinessLogicException,
  NotFoundException,
  ValidationException,
} from "../../../domain.layer/exceptions/custom.exception";
import { ISuggestedRiskAction } from "../../../domain.layer/interfaces/i.aiDetection";

const ctx = { userId: 7, role: "Admin", organizationId: 3 };
const mockScan = getScanByIdQuery as jest.Mock;
const mockGet = getSuggestedRiskActionQuery as jest.Mock;
const mockList = listSuggestedRiskActionsQuery as jest.Mock;
const mockRiskExists = riskExistsInOrganizationQuery as jest.Mock;
const mockUpsert = upsertSuggestedRiskActionQuery as jest.Mock;
const mockDelete = deleteSuggestedRiskActionQuery as jest.Mock;

function action(overrides: Partial<ISuggestedRiskAction>): ISuggestedRiskAction {
  return {
    id: 1,
    scan_id: 10,
    suggestion_key: "prompt injection",
    risk_name: "Prompt injection",
    action: "added",
    risk_id: 42,
    ignore_reason: null,
    acted_by: 7,
    acted_by_name: "Ada Lovelace",
    acted_at: "2026-11-03T10:00:00.000Z",
    risk_deleted: false,
    ...overrides,
  };
}

describe("aiDetectionSuggestedRisks.service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockScan.mockResolvedValue({ id: 10 });
    mockGet.mockResolvedValue(null);
    mockList.mockResolvedValue([]);
    mockRiskExists.mockResolvedValue(true);
  });

  it("lists actions only for a scan in the caller's organization", async () => {
    mockScan.mockResolvedValue(null);
    await expect(listSuggestedRiskActions(10, ctx)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockScan).toHaveBeenCalledWith(10, 3);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("records an added suggestion with the created risk id", async () => {
    await recordSuggestedRiskAction(
      10,
      { risk_name: " Prompt injection ", action: "added", risk_id: 42 },
      ctx,
    );
    expect(mockRiskExists).toHaveBeenCalledWith(42, 3);
    expect(mockUpsert).toHaveBeenCalledWith(
      { scanId: 10, riskName: "Prompt injection", action: "added", riskId: 42, ignoreReason: null },
      7,
      3,
    );
  });

  it("refuses to add a suggestion that is already linked to a live risk", async () => {
    mockGet.mockResolvedValue(action({ risk_id: 42 }));
    await expect(
      recordSuggestedRiskAction(
        10,
        { risk_name: "Prompt injection", action: "added", risk_id: 43 },
        ctx,
      ),
    ).rejects.toBeInstanceOf(BusinessLogicException);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("allows adding again when the earlier risk was deleted", async () => {
    mockGet.mockResolvedValue(action({ risk_id: null, risk_deleted: true }));
    await recordSuggestedRiskAction(
      10,
      { risk_name: "Prompt injection", action: "added", risk_id: 43 },
      ctx,
    );
    expect(mockUpsert).toHaveBeenCalled();
  });

  it("refuses a risk from another organization", async () => {
    mockRiskExists.mockResolvedValue(false);
    await expect(
      recordSuggestedRiskAction(
        10,
        { risk_name: "Prompt injection", action: "added", risk_id: 99 },
        ctx,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("stores the ignore reason", async () => {
    await recordSuggestedRiskAction(
      10,
      { risk_name: "Prompt injection", action: "ignored", reason: "not_real_risk" },
      ctx,
    );
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        scanId: 10,
        riskName: "Prompt injection",
        action: "ignored",
        riskId: null,
        ignoreReason: "not_real_risk",
      },
      7,
      3,
    );
  });

  it.each([
    [{ action: "ignored", reason: "not_real_risk" }],
    [{ risk_name: "  ", action: "ignored", reason: "not_real_risk" }],
    [{ risk_name: "X", action: "deleted" }],
    [{ risk_name: "X", action: "ignored", reason: "because" }],
    [{ risk_name: "X", action: "added", risk_id: "abc" }],
  ])("rejects invalid input %j", async (input) => {
    await expect(recordSuggestedRiskAction(10, input, ctx)).rejects.toBeInstanceOf(
      ValidationException,
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("restores an ignored suggestion", async () => {
    mockList.mockResolvedValue([action({ id: 5, action: "ignored", risk_id: null })]);
    await deleteSuggestedRiskAction(10, 5, ctx);
    expect(mockDelete).toHaveBeenCalledWith(5, 10, 3);
  });

  it("does not restore a suggestion that was added to the register", async () => {
    mockList.mockResolvedValue([action({ id: 5 })]);
    await expect(deleteSuggestedRiskAction(10, 5, ctx)).rejects.toBeInstanceOf(
      BusinessLogicException,
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
