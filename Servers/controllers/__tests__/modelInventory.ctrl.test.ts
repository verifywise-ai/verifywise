import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/modelInventory.utils", () => ({
  getAllModelInventoriesQuery: jest.fn(),
  getModelInventoryByIdQuery: jest.fn(),
  createNewModelInventoryQuery: jest.fn(),
  updateModelInventoryByIdQuery: jest.fn(),
  deleteModelInventoryByIdQuery: jest.fn(),
  getModelByProjectIdQuery: jest.fn(),
  getModelByFrameworkIdQuery: jest.fn(),
}));
jest.mock("../../utils/modelInventoryChangeHistory.utils", () => ({
  recordModelInventoryCreation: jest.fn().mockResolvedValue(undefined),
  recordModelInventoryDeletion: jest.fn().mockResolvedValue(undefined),
  trackModelInventoryChanges: jest.fn().mockResolvedValue([]),
  recordMultipleFieldChanges: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
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
    404: (d: any) => ({ message: "Not Found", data: d }),
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
  getModelByProjectIdQuery,
  getModelByFrameworkIdQuery,
} from "../../utils/modelInventory.utils";

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
  return { ...data, toSafeJSON: () => data };
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
    it("should return 204 when model is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await getModelInventoryById(req, res);
      expect(res.status).toHaveBeenCalledWith(204);
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
  });

  describe("deleteModelInventoryById", () => {
    it("should return 404 when model is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await deleteModelInventoryById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 200 when model is deleted", async () => {
      mockGetById.mockResolvedValue(mockModel({ id: 1, model: "M1" }) as any);
      mockDelete.mockResolvedValue(undefined);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteModelInventoryById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteModelInventoryById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
