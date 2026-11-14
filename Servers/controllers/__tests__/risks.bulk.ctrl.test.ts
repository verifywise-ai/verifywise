import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/risk.utils", () => ({
  archiveRiskQuery: jest.fn<any>().mockResolvedValue(true),
  recordRiskDeletionSnapshots: jest.fn<any>().mockResolvedValue(undefined),
  assertRiskReferencesInOrganization: jest.fn<any>().mockResolvedValue(undefined),
  PROJECT_RISK_CATEGORIES: ["Strategic risk", "Operational risk"],
  PROJECT_RISK_CATEGORIES_SET: new Set(["Strategic risk", "Operational risk"]),
  // Other exports used by risks.ctrl — provide noop mocks.
  getAllRisksQuery: jest.fn(),
  getRiskByIdQuery: jest.fn(),
  getRisksByFrameworkQuery: jest.fn(),
  getRisksByProjectQuery: jest.fn(),
  updateRiskByIdQuery: jest.fn(),
}));

jest.mock("../../utils/bulkAction.utils", () => ({
  parseBulkIds: jest.fn<any>(),
  assertOrgOwnsIds: jest.fn<any>().mockResolvedValue(undefined),
  withBulkTransaction: jest.fn<any>(),
}));

jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn<any>(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    403: (data: any) => ({ message: "Forbidden", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
  },
}));

// Other module-level imports the controller pulls in.
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/logger/dbLogger", () => ({
  logEvent: jest.fn(),
}));
jest.mock("../../services/inAppNotification.service", () => ({
  notifyUserAssigned: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/quantitativeRisk.utils", () => ({
  computeDerivedFields: jest.fn(),
  recordPortfolioSnapshot: jest.fn(),
}));
jest.mock("../../services/risk.service", () => ({
  createRiskService: jest.fn(),
  updateRiskService: jest.fn<any>(),
  QuantitativeRiskValidationError: class extends Error {},
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueRiskLinkRecompute: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn<any>(), transaction: jest.fn() },
}));

import { bulkUpdateProjectRisks } from "../risks.ctrl";
import {
  archiveRiskQuery,
  recordRiskDeletionSnapshots,
  assertRiskReferencesInOrganization,
} from "../../utils/risk.utils";
import { parseBulkIds, assertOrgOwnsIds, withBulkTransaction } from "../../utils/bulkAction.utils";
import { updateRiskService } from "../../services/risk.service";
import { notifyUserAssigned } from "../../services/inAppNotification.service";
import { enqueueRiskLinkRecompute } from "../../services/automations/automationProducer";
import { sequelize } from "../../database/db";
import {
  ForbiddenException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";

const mockParseBulkIds = parseBulkIds as jest.MockedFunction<typeof parseBulkIds>;
const mockAssertOrgOwnsIds = assertOrgOwnsIds as jest.MockedFunction<typeof assertOrgOwnsIds>;
const mockWithBulkTransaction = withBulkTransaction as jest.MockedFunction<
  typeof withBulkTransaction
>;
const mockArchive = archiveRiskQuery as jest.MockedFunction<typeof archiveRiskQuery>;
const mockSnapshots = recordRiskDeletionSnapshots as jest.MockedFunction<
  typeof recordRiskDeletionSnapshots
>;
const mockUpdateService = updateRiskService as jest.MockedFunction<typeof updateRiskService>;
const mockNotify = notifyUserAssigned as jest.MockedFunction<typeof notifyUserAssigned>;
const mockEnqueue = enqueueRiskLinkRecompute as jest.MockedFunction<
  typeof enqueueRiskLinkRecompute
>;
const mockQuery = sequelize.query as unknown as jest.Mock<any>;

const TX = { id: "tx" };
let committed = false;

/** Active rows the bulk SELECT returns; notification look-ups get a user and a project. */
function arrangeRows(rows: Array<Record<string, unknown>>) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM risks WHERE")) return rows;
    if (sql.includes("FROM users")) return [{ name: "Ada", surname: "Admin" }];
    if (sql.includes("project_title")) return [{ project_title: "Use case A" }];
    return [];
  });
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function createReq(body: any): Partial<Request> {
  return {
    userId: 9,
    organizationId: 4,
    role: "Editor",
    body,
  } as any;
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("bulkUpdateProjectRisks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    committed = false;
    mockParseBulkIds.mockImplementation((input: any) => {
      if (!Array.isArray(input) || input.length === 0) {
        throw new ValidationException("ids must be a non-empty array", "ids", input);
      }
      return input.map((n: any) => Number(n));
    });
    mockWithBulkTransaction.mockImplementation(async (_options: any, handler: any) => {
      const result = await handler(TX);
      committed = true;
      return result;
    });
    mockArchive.mockResolvedValue(true);
    mockUpdateService.mockImplementation(async (id: number, input: any, existing: any) => {
      return { ...existing, ...input, id } as any;
    });
    arrangeRows([]);
  });

  describe("set_owner", () => {
    it("updates each active risk through updateRiskService and notifies only changed owners after commit", async () => {
      arrangeRows([
        { id: 1, risk_owner: 3, risk_name: "R1", risk_description: "d1" },
        { id: 2, risk_owner: 7, risk_name: "R2", risk_description: "d2" },
      ]);
      const committedAtNotify: boolean[] = [];
      mockNotify.mockImplementation(async () => {
        committedAtNotify.push(committed);
        return undefined as any;
      });
      const req = createReq({ ids: [1, 2, 5], action: "set_owner", ownerId: 7 });
      const res = createRes();

      await bulkUpdateProjectRisks(req as Request, res as Response);
      await flush();

      expect(mockAssertOrgOwnsIds).toHaveBeenCalledWith(
        expect.objectContaining({ table: "risks", ids: [1, 2, 5], organizationId: 4 }),
      );
      // The active-row read is org-scoped, skips archived risks and runs in the transaction.
      const select = mockQuery.mock.calls.find(([sql]) => String(sql).includes("FROM risks WHERE"));
      expect(select?.[0]).toContain("organization_id = :organizationId");
      expect(select?.[0]).toContain("is_deleted = false");
      expect(select?.[1]).toEqual(
        expect.objectContaining({
          replacements: { organizationId: 4, ids: [1, 2, 5] },
          transaction: TX,
        }),
      );

      expect(mockUpdateService).toHaveBeenCalledTimes(2);
      expect(mockUpdateService).toHaveBeenCalledWith(
        1,
        { risk_owner: 7 },
        expect.objectContaining({ id: 1, risk_owner: 3 }),
        { userId: 9, organizationId: 4 },
        TX,
      );
      expect(mockUpdateService).toHaveBeenCalledWith(
        2,
        { risk_owner: 7 },
        expect.objectContaining({ id: 2 }),
        { userId: 9, organizationId: 4 },
        TX,
      );

      // Risk 2 already belonged to user 7, so only risk 1 notifies, after commit.
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(committedAtNotify).toEqual([true]);
      expect(mockNotify).toHaveBeenCalledWith(
        4,
        7,
        expect.objectContaining({
          entityType: "project_risk",
          entityId: 1,
          entityName: "R1",
          roleType: "Risk Owner",
          entityUrl: "/risk-management?riskId=1",
        }),
        "Ada Admin",
        expect.any(String),
        { projectName: "Use case A", description: "d1" },
      );

      // The single edit enqueues a link recompute on every update; so does bulk.
      expect(mockEnqueue.mock.calls.map((c) => c[1])).toEqual([1, 2]);
      expect(mockArchive).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      // Risk 5 is archived (not in the active rows), so it is not counted.
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { updated: 2, action: "set_owner" },
      });
    });

    it("returns 400 and writes nothing when the new owner is outside the organization", async () => {
      (assertRiskReferencesInOrganization as jest.Mock<any>).mockRejectedValueOnce(
        new ValidationException("The risk owner must be a member of this organization"),
      );
      const req = createReq({ ids: [1], action: "set_owner", ownerId: 99 });
      const res = createRes();

      await bulkUpdateProjectRisks(req as Request, res as Response);

      expect(assertRiskReferencesInOrganization).toHaveBeenCalledWith({ risk_owner: 99 }, 4, TX);
      expect(mockUpdateService).not.toHaveBeenCalled();
      expect(mockNotify).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("sends no notification and enqueues nothing when the transaction fails", async () => {
      arrangeRows([{ id: 1, risk_owner: 3, risk_name: "R1" }]);
      mockUpdateService.mockRejectedValueOnce(new Error("write failed"));
      const req = createReq({ ids: [1], action: "set_owner", ownerId: 7 });
      const res = createRes();

      await bulkUpdateProjectRisks(req as Request, res as Response);
      await flush();

      expect(res.status).toHaveBeenCalledWith(500);
      expect(mockNotify).not.toHaveBeenCalled();
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it("returns 400 when set_owner is missing ownerId", async () => {
      const req = createReq({ ids: [1], action: "set_owner" });
      const res = createRes();

      await bulkUpdateProjectRisks(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockUpdateService).not.toHaveBeenCalled();
    });

    it("returns 400 when ownerId is non-positive", async () => {
      const req = createReq({ ids: [1], action: "set_owner", ownerId: -3 });
      const res = createRes();

      await bulkUpdateProjectRisks(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("set_category", () => {
    it("updates each active risk through updateRiskService and enqueues a recompute for each", async () => {
      arrangeRows([{ id: 1, risk_category: ["Strategic risk"] }]);
      const req = createReq({
        ids: [1],
        action: "set_category",
        categories: ["Strategic risk", "Operational risk"],
      });
      const res = createRes();

      await bulkUpdateProjectRisks(req as Request, res as Response);
      await flush();

      expect(mockUpdateService).toHaveBeenCalledWith(
        1,
        { risk_category: ["Strategic risk", "Operational risk"] },
        expect.objectContaining({ id: 1 }),
        { userId: 9, organizationId: 4 },
        TX,
      );
      expect(assertRiskReferencesInOrganization).not.toHaveBeenCalled();
      expect(mockEnqueue).toHaveBeenCalledWith(4, 1);
      expect(mockNotify).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { updated: 1, action: "set_category" },
      });
    });

    it("returns 400 when set_category receives an unknown category", async () => {
      const req = createReq({
        ids: [1],
        action: "set_category",
        categories: ["Imaginary risk"],
      });
      const res = createRes();

      await bulkUpdateProjectRisks(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockUpdateService).not.toHaveBeenCalled();
    });

    it("returns 400 when set_category receives a non-array", async () => {
      const req = createReq({
        ids: [1],
        action: "set_category",
        categories: "Strategic risk",
      });
      const res = createRes();

      await bulkUpdateProjectRisks(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("archive", () => {
    it("archives each risk through the shared path and records the snapshots once", async () => {
      // Risk 11 was already archived.
      mockArchive.mockImplementation(async (id: number) => id !== 11);
      const req = createReq({ ids: [10, 11, 12], action: "archive" });
      const res = createRes();

      await bulkUpdateProjectRisks(req as Request, res as Response);
      await flush();

      expect(mockArchive).toHaveBeenCalledTimes(3);
      for (const id of [10, 11, 12]) {
        expect(mockArchive).toHaveBeenCalledWith(id, 4, 9, TX, { recordSnapshots: false });
      }
      expect(mockSnapshots).toHaveBeenCalledTimes(1);
      expect(mockSnapshots).toHaveBeenCalledWith(4, TX);
      expect(mockUpdateService).not.toHaveBeenCalled();
      expect(mockEnqueue).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { updated: 2, action: "archive" },
      });
    });

    it("records no snapshots when nothing was archived", async () => {
      mockArchive.mockResolvedValue(false);
      const req = createReq({ ids: [10], action: "archive" });
      const res = createRes();

      await bulkUpdateProjectRisks(req as Request, res as Response);

      expect(mockSnapshots).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { updated: 0, action: "archive" },
      });
    });
  });

  it("returns 400 for an unknown action", async () => {
    const req = createReq({ ids: [1], action: "rename" });
    const res = createRes();

    await bulkUpdateProjectRisks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockWithBulkTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 when ids is empty", async () => {
    const req = createReq({ ids: [], action: "archive" });
    const res = createRes();

    await bulkUpdateProjectRisks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 403 when the tenant guard rejects (cross-org access)", async () => {
    mockAssertOrgOwnsIds.mockRejectedValueOnce(
      new ForbiddenException("Cross-tenant access", "risks", "bulk_action"),
    );

    const req = createReq({ ids: [99], action: "archive" });
    const res = createRes();

    await bulkUpdateProjectRisks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockArchive).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected errors", async () => {
    mockWithBulkTransaction.mockImplementationOnce(async () => {
      throw new Error("db exploded");
    });

    const req = createReq({ ids: [1], action: "archive" });
    const res = createRes();

    await bulkUpdateProjectRisks(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
