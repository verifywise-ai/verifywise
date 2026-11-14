import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/risk.utils", () => ({
  archiveRiskQuery: jest.fn<any>().mockResolvedValue(true),
  recordRiskSnapshots: jest.fn<any>().mockResolvedValue(undefined),
  assertRiskReferencesInOrganization: jest.fn<any>().mockResolvedValue(undefined),
  getActiveRisksByIdsQuery: jest.fn<any>().mockResolvedValue([]),
  getProjectTitlesByRiskIdsQuery: jest.fn<any>().mockResolvedValue(new Map()),
  enqueueBulkRiskAutomation: jest.fn<any>().mockResolvedValue(undefined),
  // The real comparison, so the skip rules are exercised end to end.
  sameRiskCategories: (stored: unknown, next: string[]) =>
    jest
      .requireActual<typeof import("../../utils/risk.utils")>("../../utils/risk.utils")
      .sameRiskCategories(stored, next),
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
  notifyUserAssignedMany: jest.fn<any>().mockResolvedValue(undefined),
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
  recordRiskSnapshots,
  assertRiskReferencesInOrganization,
  getActiveRisksByIdsQuery,
  getProjectTitlesByRiskIdsQuery,
  enqueueBulkRiskAutomation,
} from "../../utils/risk.utils";
import { parseBulkIds, assertOrgOwnsIds, withBulkTransaction } from "../../utils/bulkAction.utils";
import { updateRiskService } from "../../services/risk.service";
import {
  notifyUserAssigned,
  notifyUserAssignedMany,
} from "../../services/inAppNotification.service";
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
const mockSnapshots = recordRiskSnapshots as jest.MockedFunction<typeof recordRiskSnapshots>;
const mockUpdateService = updateRiskService as jest.MockedFunction<typeof updateRiskService>;
const mockNotify = notifyUserAssigned as jest.MockedFunction<typeof notifyUserAssigned>;
const mockEnqueue = enqueueRiskLinkRecompute as jest.MockedFunction<
  typeof enqueueRiskLinkRecompute
>;
const mockQuery = sequelize.query as unknown as jest.Mock<any>;
const mockGetActive = getActiveRisksByIdsQuery as unknown as jest.Mock<any>;
const mockTitles = getProjectTitlesByRiskIdsQuery as unknown as jest.Mock<any>;
const mockBulkAutomation = enqueueBulkRiskAutomation as unknown as jest.Mock<any>;
const mockNotifyMany = notifyUserAssignedMany as unknown as jest.Mock<any>;

const TX = { id: "tx" };
let committed = false;

/** Active rows the bulk read returns; notification look-ups get a user and a project. */
function arrangeRows(rows: Array<Record<string, unknown>>) {
  mockGetActive.mockResolvedValue(rows);
  mockTitles.mockImplementation(
    async (riskIds: number[]) => new Map(riskIds.map((id) => [id, "Use case A"])),
  );
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM users")) return [{ name: "Ada", surname: "Admin" }];
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
    mockArchive.mockResolvedValue({ id: 1, risk_name: "R1" } as any);
    mockUpdateService.mockImplementation(async (id: number, input: any, existing: any) => {
      return { ...existing, ...input, id } as any;
    });
    arrangeRows([]);
  });

  describe("set_owner", () => {
    it("updates only active risks whose owner changes, and notifies them after commit", async () => {
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
      // The active rows are read in the transaction (archived risks are left out there).
      expect(mockGetActive).toHaveBeenCalledWith([1, 2, 5], 4, TX);

      // Risk 2 already belongs to user 7: no write, no automation, no recompute.
      expect(mockUpdateService).toHaveBeenCalledTimes(1);
      expect(mockUpdateService).toHaveBeenCalledWith(
        1,
        { risk_owner: 7 },
        expect.objectContaining({ id: 1, risk_owner: 3 }),
        { userId: 9, organizationId: 4 },
        TX,
        { recordSnapshots: false, runAutomations: false },
      );
      // History snapshots are recorded once for the batch, in the transaction.
      expect(mockSnapshots).toHaveBeenCalledTimes(1);
      expect(mockSnapshots).toHaveBeenCalledWith(4, TX);
      // The org automation runs once for the batch, with only the changed risk.
      expect(mockBulkAutomation).toHaveBeenCalledTimes(1);
      expect(mockBulkAutomation).toHaveBeenCalledWith(
        "risk_updated",
        [
          {
            before: expect.objectContaining({ id: 1, risk_owner: 3 }),
            after: expect.objectContaining({ id: 1, risk_owner: 7 }),
          },
        ],
        4,
        TX,
      );
      // A single assigned risk keeps the single-risk notice.
      expect(mockNotifyMany).not.toHaveBeenCalled();
      // One project-title lookup for every notified risk.
      expect(mockTitles).toHaveBeenCalledTimes(1);
      expect(mockTitles).toHaveBeenCalledWith([1], 4);

      // Only risk 1 notifies, after commit.
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
      expect(mockEnqueue.mock.calls.map((c) => c[1])).toEqual([1]);
      expect(mockArchive).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      // `updated` is the ids sent; risk 2 was unchanged and risk 5 is archived,
      // so neither is in `changed`.
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { updated: 3, changed: 1, action: "set_owner" },
      });
    });

    it("sends the new owner one notice listing every changed risk, after commit", async () => {
      arrangeRows([
        { id: 1, risk_owner: 3, risk_name: "R1" },
        { id: 2, risk_owner: 7, risk_name: "R2" },
        { id: 4, risk_owner: null, risk_name: "R4" },
        { id: 6, risk_owner: 5, risk_name: "R6" },
      ]);
      const committedAtNotify: boolean[] = [];
      mockNotifyMany.mockImplementation(async () => {
        committedAtNotify.push(committed);
      });
      const req = createReq({ ids: [1, 2, 4, 6], action: "set_owner", ownerId: 7 });
      const res = createRes();

      await bulkUpdateProjectRisks(req as Request, res as Response);
      await flush();

      expect(mockNotifyMany).toHaveBeenCalledTimes(1);
      expect(committedAtNotify).toEqual([true]);
      // Risk 2 already belonged to user 7, so it is not listed.
      expect(mockNotifyMany).toHaveBeenCalledWith(
        4,
        7,
        {
          entityType: "project_risk",
          items: [
            { id: 1, name: "R1" },
            { id: 4, name: "R4" },
            { id: 6, name: "R6" },
          ],
          roleType: "Risk Owner",
          entityUrl: "/risk-management",
          texts: {
            titleKey: "{count} risks were assigned to you",
            messageKey: "{assigner} assigned you as Risk Owner for {count} risks: {names}",
            messageMoreKey:
              "{assigner} assigned you as Risk Owner for {count} risks: {names} and {more} more",
            itemsLabel: "risks",
            roleDescription:
              "As the Risk Owner, you are responsible for managing and mitigating these risks.",
          },
        },
        "Ada Admin",
        expect.any(String),
      );
      expect(mockNotify).not.toHaveBeenCalled();
      // No per-risk project lookup for the combined notice.
      expect(mockTitles).not.toHaveBeenCalled();
      // One automation for the three changed risks.
      expect(mockBulkAutomation).toHaveBeenCalledTimes(1);
      expect(mockBulkAutomation.mock.calls[0][1].map((c: any) => c.after.id)).toEqual([1, 4, 6]);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { updated: 4, changed: 3, action: "set_owner" },
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
      expect(mockNotifyMany).not.toHaveBeenCalled();
      expect(mockEnqueue).not.toHaveBeenCalled();
      expect(mockBulkAutomation).not.toHaveBeenCalled();
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
        { recordSnapshots: false, runAutomations: false },
      );
      expect(mockSnapshots).toHaveBeenCalledTimes(1);
      expect(mockBulkAutomation).toHaveBeenCalledWith(
        "risk_updated",
        [
          {
            before: expect.objectContaining({ id: 1, risk_category: ["Strategic risk"] }),
            after: expect.objectContaining({
              id: 1,
              risk_category: ["Strategic risk", "Operational risk"],
            }),
          },
        ],
        4,
        TX,
      );
      expect(assertRiskReferencesInOrganization).not.toHaveBeenCalled();
      expect(mockEnqueue).toHaveBeenCalledWith(4, 1);
      expect(mockNotify).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { updated: 1, changed: 1, action: "set_category" },
      });
    });

    it("skips risks whose categories already match, in any order or stored as a literal", async () => {
      arrangeRows([
        { id: 1, risk_category: ["Operational risk", "Strategic risk"] },
        { id: 2, risk_category: '{"Operational risk","Strategic risk"}' },
        { id: 3, risk_category: "{}" },
      ]);
      const req = createReq({
        ids: [1, 2, 3],
        action: "set_category",
        categories: ["Strategic risk", "Operational risk"],
      });
      const res = createRes();

      await bulkUpdateProjectRisks(req as Request, res as Response);
      await flush();

      expect(mockUpdateService).toHaveBeenCalledTimes(1);
      expect(mockUpdateService.mock.calls[0][0]).toBe(3);
      expect(mockEnqueue.mock.calls.map((c) => c[1])).toEqual([3]);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { updated: 3, changed: 1, action: "set_category" },
      });
    });

    it("updates nothing and counts nothing when every risk already matches", async () => {
      arrangeRows([{ id: 1, risk_category: ["Strategic risk"] }]);
      const req = createReq({ ids: [1], action: "set_category", categories: ["Strategic risk"] });
      const res = createRes();

      await bulkUpdateProjectRisks(req as Request, res as Response);
      await flush();

      expect(mockUpdateService).not.toHaveBeenCalled();
      expect(mockEnqueue).not.toHaveBeenCalled();
      expect(mockSnapshots).not.toHaveBeenCalled();
      expect(mockBulkAutomation).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { updated: 1, changed: 0, action: "set_category" },
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
      // Risk 11 was already archived; the others come back as archived rows.
      mockArchive.mockImplementation(
        async (id: number) => (id === 11 ? null : { id, risk_name: `R${id}` }) as any,
      );
      const req = createReq({ ids: [10, 11, 12], action: "archive" });
      const res = createRes();

      await bulkUpdateProjectRisks(req as Request, res as Response);
      await flush();

      expect(mockArchive).toHaveBeenCalledTimes(3);
      for (const id of [10, 11, 12]) {
        expect(mockArchive).toHaveBeenCalledWith(id, 4, 9, TX, {
          recordSnapshots: false,
          runAutomations: false,
        });
      }
      expect(mockSnapshots).toHaveBeenCalledTimes(1);
      expect(mockSnapshots).toHaveBeenCalledWith(4, TX);
      // One risk_deleted automation for the batch, listing the archived risks.
      // The archived rows feed the summary: no extra read of the risks.
      expect(mockGetActive).not.toHaveBeenCalled();
      expect(mockBulkAutomation).toHaveBeenCalledTimes(1);
      expect(mockBulkAutomation).toHaveBeenCalledWith(
        "risk_deleted",
        [
          { before: { id: 10, risk_name: "R10" }, after: { id: 10, risk_name: "R10" } },
          { before: { id: 12, risk_name: "R12" }, after: { id: 12, risk_name: "R12" } },
        ],
        4,
        TX,
      );
      expect(mockUpdateService).not.toHaveBeenCalled();
      expect(mockEnqueue).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { updated: 3, changed: 2, action: "archive" },
      });
    });

    it("records no snapshots when nothing was archived", async () => {
      mockArchive.mockResolvedValue(null);
      const req = createReq({ ids: [10], action: "archive" });
      const res = createRes();

      await bulkUpdateProjectRisks(req as Request, res as Response);

      expect(mockSnapshots).not.toHaveBeenCalled();
      expect(mockBulkAutomation).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { updated: 1, changed: 0, action: "archive" },
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
