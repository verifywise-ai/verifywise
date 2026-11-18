import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/modelInventory.utils", () => ({
  getAllModelInventoriesQuery: jest.fn(),
  getModelInventoryByIdQuery: jest.fn(),
  createNewModelInventoryQuery: jest.fn(),
  updateModelInventoryByIdQuery: jest.fn(),
  deleteModelInventoryByIdQuery: jest.fn(),
  lockModelInventoryQuery: jest.fn(),
  getModelByProjectIdQuery: jest.fn(),
  getModelByFrameworkIdQuery: jest.fn(),
}));
jest.mock("../../utils/mrm.utils", () => ({
  modelHasMrmHistoryQuery: jest.fn(),
}));
jest.mock("../../utils/changeHistory.base.utils", () => ({
  recordEntityCreation: jest.fn().mockResolvedValue(undefined),
  recordEntityDeletion: jest.fn().mockResolvedValue(undefined),
  trackEntityChanges: jest.fn().mockResolvedValue([]),
  recordMultipleFieldChanges: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/rolePermissions.utils", () => ({
  roleHasPermission: jest.fn(async () => true),
}));
jest.mock("../../services/riskApproverNotification.service", () => ({
  getUserNameById: jest.fn(async () => "Test User"),
}));
jest.mock("../../services/proactiveNotify", () => ({
  notifyProactive: jest.fn(async () => undefined),
}));
jest.mock("../../services/workflows/triggers", () => ({
  triggerModelDeployment: jest.fn(async () => undefined),
}));
// afterCommit runs its hook at once: the mocked commit has nothing to wait for.
const mockTransaction = () => ({
  commit: jest.fn(),
  rollback: jest.fn(),
  afterCommit: jest.fn((fn: () => void) => fn()),
});
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(async () => mockTransaction()),
    query: jest.fn().mockResolvedValue([{ name: "Test", surname: "User" }]),
  },
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    201: (d: any) => ({ message: "Created", data: d }),
    202: (d: any) => ({ message: "Accepted", data: d }),
    204: (d: any) => ({ message: "No Content", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    403: (d: any) => ({ message: "Forbidden", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    409: (d: any) => ({ message: "Conflict", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
    503: (d: any) => ({ message: "Service Unavailable", data: d }),
  },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_, err) => (err as Error).message),
}));
jest.mock("../../services/inAppNotification.service", () => ({
  notifyUserAssigned: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/riskLinks/modelCandidates", () => ({
  notifyModelRiskCandidates: jest.fn(async () => undefined),
}));
jest.mock("../../domain.layer/models/modelInventory/modelInventory.model", () => ({
  ModelInventoryModel: {
    createNewModelInventory: jest.fn().mockReturnValue({ provider_model: "pm" }),
    updateModelInventory: jest.fn().mockReturnValue({ provider_model: "pm" }),
  },
}));

import {
  getAllModelInventories,
  getModelInventoryById,
  getModelByProjectId,
  getModelByFrameworkId,
  createNewModelInventory,
  updateModelInventoryById,
  deleteModelInventoryById,
} from "../modelInventory.ctrl";
import {
  getAllModelInventoriesQuery,
  getModelInventoryByIdQuery,
  createNewModelInventoryQuery,
  updateModelInventoryByIdQuery,
  deleteModelInventoryByIdQuery,
  lockModelInventoryQuery,
  getModelByProjectIdQuery,
  getModelByFrameworkIdQuery,
} from "../../utils/modelInventory.utils";
import { modelHasMrmHistoryQuery } from "../../utils/mrm.utils";
import { sequelize } from "../../database/db";
import { notifyModelRiskCandidates } from "../../services/riskLinks/modelCandidates";

const mockGetAll = getAllModelInventoriesQuery as jest.MockedFunction<
  typeof getAllModelInventoriesQuery
>;
const mockGetById = getModelInventoryByIdQuery as jest.MockedFunction<
  typeof getModelInventoryByIdQuery
>;
const mockCreate = createNewModelInventoryQuery as jest.MockedFunction<
  typeof createNewModelInventoryQuery
>;
const mockUpdate = updateModelInventoryByIdQuery as jest.MockedFunction<
  typeof updateModelInventoryByIdQuery
>;
const mockDelete = deleteModelInventoryByIdQuery as jest.MockedFunction<
  typeof deleteModelInventoryByIdQuery
>;
const mockLock = lockModelInventoryQuery as jest.MockedFunction<typeof lockModelInventoryQuery>;
const mockMrmHistory = modelHasMrmHistoryQuery as jest.MockedFunction<
  typeof modelHasMrmHistoryQuery
>;
const mockGetByProject = getModelByProjectIdQuery as jest.MockedFunction<
  typeof getModelByProjectIdQuery
>;
const mockGetByFramework = getModelByFrameworkIdQuery as jest.MockedFunction<
  typeof getModelByFrameworkIdQuery
>;

function createReq(overrides?: Partial<Request>): any {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    t: (k: string) => k,
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}
function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

function mockModel(data: any) {
  return { ...data, toSafeJSON: () => data, get: () => ({ ...data }) };
}

describe("modelInventory.ctrl", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  describe("getAllModelInventories", () => {
    it("should return 200 with model inventories", async () => {
      const models = [mockModel({ id: 1, model: "M1" })];
      mockGetAll.mockResolvedValue(models as any);
      const req = createReq();
      const res = createRes();
      await getAllModelInventories(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 200 even when empty", async () => {
      mockGetAll.mockResolvedValue([] as any);
      const req = createReq();
      const res = createRes();
      await getAllModelInventories(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      mockGetAll.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getAllModelInventories(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getModelInventoryById", () => {
    it("should return 200 when model is found", async () => {
      mockGetById.mockResolvedValue(mockModel({ id: 1, model: "M1" }) as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getModelInventoryById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 404 when model is not found (M-L1)", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await getModelInventoryById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getModelInventoryById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getModelByProjectId", () => {
    it("should return 200 with empty array for non-numeric projectId", async () => {
      const req = createReq({ params: { projectId: "plugin-1" } });
      const res = createRes();
      await getModelByProjectId(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
    });
    it("should return 200 with models", async () => {
      mockGetByProject.mockResolvedValue([mockModel({ id: 1, model: "M1" })] as any);
      const req = createReq({ params: { projectId: "1" } });
      const res = createRes();
      await getModelByProjectId(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      mockGetByProject.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { projectId: "1" } });
      const res = createRes();
      await getModelByProjectId(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getModelByFrameworkId", () => {
    it("should return 200 with models", async () => {
      mockGetByFramework.mockResolvedValue([mockModel({ id: 1, model: "M1" })] as any);
      const req = createReq({ params: { frameworkId: "1" } });
      const res = createRes();
      await getModelByFrameworkId(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      mockGetByFramework.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { frameworkId: "1" } });
      const res = createRes();
      await getModelByFrameworkId(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createNewModelInventory", () => {
    it("should return 201 when model is created", async () => {
      mockCreate.mockResolvedValue(mockModel({ id: 1, model: "M1" }) as any);
      const req = createReq({
        body: { provider_model: "pm", provider: "p", model: "M1", version: "1", approver: null },
      });
      const res = createRes();
      await createNewModelInventory(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });
    it("should return 500 on error", async () => {
      mockCreate.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: { provider_model: "pm" } });
      const res = createRes();
      await createNewModelInventory(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
    it("should return 409 when external key violates the unique index (issue #4755)", async () => {
      const conflictError = Object.assign(new Error("duplicate key value"), {
        parent: { code: "23505" },
      });
      mockCreate.mockRejectedValue(conflictError);
      const req = createReq({
        body: { provider: "p", model: "M1", version: "1", external_key: "key-1" },
      });
      const res = createRes();
      await createNewModelInventory(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Conflict" }));
    });
  });

  describe("refused writes", () => {
    it("answers 403 with the approval message for a refused approval change", async () => {
      mockGetById.mockResolvedValue(
        mockModel({ id: 1, model: "M1", status: "Pending", approver: 5 }) as any,
      );
      const { roleHasPermission } = jest.requireMock("../../utils/rolePermissions.utils") as {
        roleHasPermission: jest.Mock<any>;
      };
      roleHasPermission.mockResolvedValueOnce(false);
      const req = createReq({ role: "Editor", params: { id: "1" }, body: { status: "Approved" } });
      const res = createRes();
      await updateModelInventoryById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Forbidden",
        data: "Only the model's approver or an Admin can change its approval.",
      });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("answers 400, not 500, for a value the database cannot store", async () => {
      mockCreate.mockRejectedValue(
        Object.assign(new Error("invalid input value for enum"), { parent: { code: "22P02" } }),
      );
      const res = createRes();
      await createNewModelInventory(createReq({ body: { status: "Bogus" } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("updateModelInventoryById", () => {
    it("should return 404 when model is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" }, body: { model: "M2" } });
      const res = createRes();
      await updateModelInventoryById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 200 when model is updated", async () => {
      mockGetById.mockResolvedValue(mockModel({ id: 1, model: "M1" }) as any);
      mockUpdate.mockResolvedValue(mockModel({ id: 1, model: "M2" }) as any);
      const req = createReq({ params: { id: "1" }, body: { model: "M2" } });
      const res = createRes();
      await updateModelInventoryById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { model: "M2" } });
      const res = createRes();
      await updateModelInventoryById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
    // The update query reports the use cases it added; the controller no
    // longer reads the links a second time to work them out.
    it("notifies only the use cases the update query added", async () => {
      (notifyModelRiskCandidates as jest.Mock).mockClear();
      mockGetById.mockResolvedValue(mockModel({ id: 1, model: "M1" }) as any);
      mockUpdate.mockResolvedValue({
        ...mockModel({ id: 1, model: "M2" }),
        addedProjectIds: [4],
      } as any);
      const req = createReq({ params: { id: "1" }, body: { model: "M2", projects: [3, 4] } });
      await updateModelInventoryById(req, createRes());
      expect(notifyModelRiskCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ modelInventoryId: 1, projectIds: [4] }),
      );
    });
    it("sends no use case notice when the update added none", async () => {
      (notifyModelRiskCandidates as jest.Mock).mockClear();
      mockGetById.mockResolvedValue(mockModel({ id: 1, model: "M1" }) as any);
      mockUpdate.mockResolvedValue({
        ...mockModel({ id: 1, model: "M2" }),
        addedProjectIds: [],
      } as any);
      const req = createReq({ params: { id: "1" }, body: { model: "M2" } });
      await updateModelInventoryById(req, createRes());
      expect(notifyModelRiskCandidates).not.toHaveBeenCalled();
    });
    it("should return 409 when external key violates the unique index (issue #4755)", async () => {
      const conflictError = Object.assign(new Error("duplicate key value"), {
        parent: { code: "23505" },
      });
      mockGetById.mockResolvedValue(mockModel({ id: 1, model: "M1" }) as any);
      mockUpdate.mockRejectedValue(conflictError);
      const req = createReq({ params: { id: "1" }, body: { external_key: "key-1" } });
      const res = createRes();
      await updateModelInventoryById(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Conflict" }));
    });
  });

  describe("deleteModelInventoryById", () => {
    const tx = { commit: jest.fn(), rollback: jest.fn(), afterCommit: jest.fn() };
    beforeEach(() => {
      (sequelize.transaction as jest.Mock<any>).mockResolvedValue(tx);
      mockLock.mockResolvedValue(true);
      mockMrmHistory.mockResolvedValue(false);
    });

    it("should return 404 when model is not found", async () => {
      mockLock.mockResolvedValue(false);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await deleteModelInventoryById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(tx.rollback).toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });
    it("should return 200 when model is deleted", async () => {
      mockDelete.mockResolvedValue(undefined);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteModelInventoryById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(tx.commit).toHaveBeenCalled();
    });
    it("locks the model row, then checks MRM history in the same transaction", async () => {
      mockDelete.mockResolvedValue(undefined);
      await deleteModelInventoryById(createReq({ params: { id: "1" } }), createRes());
      expect(mockLock).toHaveBeenCalledWith(1, 1, tx);
      expect(mockMrmHistory).toHaveBeenCalledWith(1, 1, tx);
      expect(mockLock.mock.invocationCallOrder[0]).toBeLessThan(
        mockMrmHistory.mock.invocationCallOrder[0],
      );
    });
    it("answers 409 for a model with MRM history, rolling back without deleting", async () => {
      mockMrmHistory.mockResolvedValue(true);
      const res = createRes();
      await deleteModelInventoryById(createReq({ params: { id: "1" } }), res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(tx.rollback).toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });
    it("should return 500 on error", async () => {
      mockLock.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteModelInventoryById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(tx.rollback).toHaveBeenCalled();
    });
  });
});
