/**
 * @fileoverview Tests for recording what was done with a scan's suggested risks.
 */

jest.mock("../../../utils/aiDetection.utils", () => ({
  getScanByIdQuery: jest.fn(),
}));

jest.mock("../../../utils/aiDetectionDecisions.utils", () => ({
  suggestionKey: (name: string) => name.trim().toLowerCase(),
  beginOrganizationTransaction: jest.fn(),
  lockSuggestedRiskQuery: jest.fn(),
  getSuggestedRiskActionQuery: jest.fn(),
  getSuggestedRiskActionByIdQuery: jest.fn(),
  listSuggestedRiskActionsQuery: jest.fn(),
  upsertSuggestedRiskActionQuery: jest.fn(),
  deleteIgnoredSuggestedRiskActionQuery: jest.fn(),
}));

jest.mock("../../risk.service", () => ({
  createRiskService: jest.fn(),
}));

import {
  addSuggestedRiskToRegister,
  deleteSuggestedRiskAction,
  listSuggestedRiskActions,
  recordSuggestedRiskAction,
} from "../../aiDetectionSuggestedRisks.service";
import { getScanByIdQuery } from "../../../utils/aiDetection.utils";
import {
  beginOrganizationTransaction,
  deleteIgnoredSuggestedRiskActionQuery,
  getSuggestedRiskActionByIdQuery,
  getSuggestedRiskActionQuery,
  listSuggestedRiskActionsQuery,
  lockSuggestedRiskQuery,
  upsertSuggestedRiskActionQuery,
} from "../../../utils/aiDetectionDecisions.utils";
import { createRiskService } from "../../risk.service";
import {
  BusinessLogicException,
  ConflictException,
  NotFoundException,
  ValidationException,
} from "../../../domain.layer/exceptions/custom.exception";
import { ISuggestedRiskAction } from "../../../domain.layer/interfaces/i.aiDetection";

const ctx = { userId: 7, role: "Admin", organizationId: 3 };
const tx = { commit: jest.fn(), rollback: jest.fn() };
const mockScan = getScanByIdQuery as jest.Mock;
const mockGet = getSuggestedRiskActionQuery as jest.Mock;
const mockGetById = getSuggestedRiskActionByIdQuery as jest.Mock;
const mockList = listSuggestedRiskActionsQuery as jest.Mock;
const mockUpsert = upsertSuggestedRiskActionQuery as jest.Mock;
const mockDeleteIgnored = deleteIgnoredSuggestedRiskActionQuery as jest.Mock;
const mockCreateRisk = createRiskService as jest.Mock;

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
    (beginOrganizationTransaction as jest.Mock).mockResolvedValue(tx);
    mockCreateRisk.mockResolvedValue({ id: 55, risk_name: "Prompt injection" });
  });

  it("lists actions only for a scan in the caller's organization", async () => {
    mockScan.mockResolvedValue(null);
    await expect(listSuggestedRiskActions(10, ctx)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockScan).toHaveBeenCalledWith(10, 3);
    expect(mockList).not.toHaveBeenCalled();
  });

  describe("addSuggestedRiskToRegister", () => {
    const riskInput = { risk_name: "Prompt injection (edited)", risk_owner: 3 };

    it("creates the risk and links it in one transaction, under the suggestion's lock", async () => {
      const risk = await addSuggestedRiskToRegister(10, " Prompt injection ", riskInput, ctx);
      expect(risk).toEqual({ id: 55, risk_name: "Prompt injection" });
      expect(beginOrganizationTransaction).toHaveBeenCalledWith(3);
      expect(lockSuggestedRiskQuery).toHaveBeenCalledWith(10, "prompt injection", 3, tx);
      expect(mockGet).toHaveBeenCalledWith(10, "prompt injection", 3, tx);
      expect(mockCreateRisk).toHaveBeenCalledWith(
        { ...riskInput, projects: [], frameworks: [] },
        { userId: 7, organizationId: 3 },
        tx,
      );
      expect(mockUpsert).toHaveBeenCalledWith(
        {
          scanId: 10,
          riskName: "Prompt injection",
          action: "added",
          riskId: 55,
          ignoreReason: null,
        },
        7,
        3,
        tx,
      );
      expect(tx.commit).toHaveBeenCalled();
    });

    it("refuses a suggestion already linked to a live risk, with that risk's id, and creates nothing", async () => {
      mockGet.mockResolvedValue(action({ risk_id: 42 }));
      const error = await addSuggestedRiskToRegister(10, "Prompt injection", riskInput, ctx).catch(
        (e) => e,
      );
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.metadata.riskId).toBe(42);
      expect(mockCreateRisk).not.toHaveBeenCalled();
      expect(mockUpsert).not.toHaveBeenCalled();
      expect(tx.rollback).toHaveBeenCalled();
    });

    it("allows adding again when the earlier risk was deleted", async () => {
      mockGet.mockResolvedValue(action({ risk_id: null, risk_deleted: true }));
      await addSuggestedRiskToRegister(10, "Prompt injection", riskInput, ctx);
      expect(mockCreateRisk).toHaveBeenCalled();
      expect(tx.commit).toHaveBeenCalled();
    });

    it("rolls back the created risk when the link cannot be written", async () => {
      mockUpsert.mockRejectedValue(new Error("write failed"));
      await expect(
        addSuggestedRiskToRegister(10, "Prompt injection", riskInput, ctx),
      ).rejects.toThrow("write failed");
      expect(tx.rollback).toHaveBeenCalled();
      expect(tx.commit).not.toHaveBeenCalled();
    });

    it("lets only one of two concurrent adds through", async () => {
      // The lock serialises the two calls; the second sees the first's link.
      let linked: ISuggestedRiskAction | null = null;
      let release: () => void = () => {};
      let held = false;
      (lockSuggestedRiskQuery as jest.Mock).mockImplementation(async () => {
        while (held) await new Promise<void>((r) => (release = r));
        held = true;
      });
      mockGet.mockImplementation(async () => linked);
      mockUpsert.mockImplementation(async () => {
        linked = action({ risk_id: 55 });
      });
      const unlock = () => {
        held = false;
        release();
      };
      tx.commit.mockImplementation(async () => unlock());
      tx.rollback.mockImplementation(async () => unlock());

      const results = await Promise.allSettled([
        addSuggestedRiskToRegister(10, "Prompt injection", riskInput, ctx),
        addSuggestedRiskToRegister(10, "prompt injection", riskInput, ctx),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(ConflictException);
      expect(mockCreateRisk).toHaveBeenCalledTimes(1);
    });

    it.each([[undefined], [""], ["  "], ["x".repeat(501)]])(
      "rejects a missing or too long suggestion name %j",
      async (name) => {
        await expect(addSuggestedRiskToRegister(10, name, riskInput, ctx)).rejects.toBeInstanceOf(
          ValidationException,
        );
        expect(mockCreateRisk).not.toHaveBeenCalled();
      },
    );
  });

  it("stores the ignore reason under the suggestion's lock", async () => {
    await recordSuggestedRiskAction(
      10,
      { risk_name: "Prompt injection", action: "ignored", reason: "not_real_risk" },
      ctx,
    );
    expect(lockSuggestedRiskQuery).toHaveBeenCalledWith(10, "prompt injection", 3, tx);
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
      tx,
    );
    expect(tx.commit).toHaveBeenCalled();
  });

  it("refuses to ignore a suggestion that is in the risk register", async () => {
    mockGet.mockResolvedValue(action({}));
    await expect(
      recordSuggestedRiskAction(
        10,
        { risk_name: "Prompt injection", action: "ignored", reason: "already_added" },
        ctx,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(tx.rollback).toHaveBeenCalled();
  });

  it.each([
    [{ action: "ignored", reason: "not_real_risk" }],
    [{ risk_name: "  ", action: "ignored", reason: "not_real_risk" }],
    [{ risk_name: "X", action: "deleted" }],
    [{ risk_name: "X", action: "added", risk_id: 3 }],
    [{ risk_name: "X", action: "ignored", reason: "because" }],
  ])("rejects invalid input %j", async (input) => {
    await expect(recordSuggestedRiskAction(10, input, ctx)).rejects.toBeInstanceOf(
      ValidationException,
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("restores an ignored suggestion", async () => {
    mockDeleteIgnored.mockResolvedValue(true);
    await deleteSuggestedRiskAction(10, 5, ctx);
    expect(mockDeleteIgnored).toHaveBeenCalledWith(5, 10, 3);
  });

  it("does not restore a suggestion that was added to the register", async () => {
    mockDeleteIgnored.mockResolvedValue(false);
    mockGetById.mockResolvedValue(action({ id: 5 }));
    await expect(deleteSuggestedRiskAction(10, 5, ctx)).rejects.toBeInstanceOf(
      BusinessLogicException,
    );
  });

  it("answers not found for an unknown action", async () => {
    mockDeleteIgnored.mockResolvedValue(false);
    mockGetById.mockResolvedValue(null);
    await expect(deleteSuggestedRiskAction(10, 5, ctx)).rejects.toBeInstanceOf(NotFoundException);
  });
});
