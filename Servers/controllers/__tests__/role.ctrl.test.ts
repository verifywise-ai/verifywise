import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/role.utils", () => ({
  getAllRolesQuery: jest.fn(),
  getRoleByIdQuery: jest.fn(),
  createNewRoleQuery: jest.fn(),
  updateRoleByIdQuery: jest.fn(),
  deleteRoleByIdQuery: jest.fn(),
}));

jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn().mockResolvedValue(undefined),
  logFailure: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    201: (data: any) => ({ message: "Created", data }),
    202: (data: any) => ({ message: "Accepted", data }),
    204: (data: any) => ({ message: "No Content", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    404: (data: any) => ({ message: "Not Found", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
    503: (data: any) => ({ message: "Service Unavailable", data }),
  },
}));

jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn().mockResolvedValue({
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

jest.mock("../../domain.layer/models/role/role.model", () => ({
  RoleModel: {
    createRole: jest.fn(),
  },
}));

jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: any, error: any) => (error as Error).message),
}));

import { getAllRoles, getRoleById, createRole, updateRoleById, deleteRoleById } from "../role.ctrl";
import {
  getAllRolesQuery,
  getRoleByIdQuery,
  createNewRoleQuery,
  updateRoleByIdQuery,
  deleteRoleByIdQuery,
} from "../../utils/role.utils";
import { RoleModel } from "../../domain.layer/models/role/role.model";
import { sequelize } from "../../database/db";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

const mockGetAll = getAllRolesQuery as jest.MockedFunction<typeof getAllRolesQuery>;
const mockGetById = getRoleByIdQuery as jest.MockedFunction<typeof getRoleByIdQuery>;
const mockCreate = createNewRoleQuery as jest.MockedFunction<typeof createNewRoleQuery>;
const mockUpdate = updateRoleByIdQuery as jest.MockedFunction<typeof updateRoleByIdQuery>;
const mockDelete = deleteRoleByIdQuery as jest.MockedFunction<typeof deleteRoleByIdQuery>;
const mockRoleModel = RoleModel as jest.Mocked<typeof RoleModel>;
const mockTransaction = sequelize.transaction as jest.MockedFunction<typeof sequelize.transaction>;

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
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("role.ctrl", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  describe("getAllRoles", () => {
    it("should return 200 with roles", async () => {
      mockGetAll.mockResolvedValue([{ id: 1, name: "Admin" }] as any);
      const req = createReq();
      const res = createRes();
      await getAllRoles(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: [{ id: 1, name: "Admin" }],
      });
    });

    it("should return 204 when no roles", async () => {
      mockGetAll.mockResolvedValue(null as any);
      const req = createReq();
      const res = createRes();
      await getAllRoles(req, res);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.json).toHaveBeenCalledWith({ message: "No Content", data: null });
    });

    it("should return 500 on error", async () => {
      mockGetAll.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getAllRoles(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        data: "DB error",
      });
    });
  });

  describe("getRoleById", () => {
    it("should return 200 when role is found", async () => {
      mockGetById.mockResolvedValue({ id: 1, name: "Admin" } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getRoleById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { id: 1, name: "Admin" },
      });
    });

    it("should return 404 when role is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getRoleById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Not Found", data: null });
    });

    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getRoleById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        data: "DB error",
      });
    });
  });

  describe("createRole", () => {
    it("should return 201 when role is created", async () => {
      mockRoleModel.createRole.mockResolvedValue({
        name: "Admin",
        description: "Full access",
      } as any);
      mockCreate.mockResolvedValue({ id: 1 } as any);
      const req = createReq({ body: { name: "Admin", description: "Full access" } });
      const res = createRes();
      await createRole(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ message: "Created", data: { id: 1 } });
    });

    it("should return 503 when creation returns null", async () => {
      mockRoleModel.createRole.mockResolvedValue({
        name: "Admin",
        description: "Full access",
      } as any);
      mockCreate.mockResolvedValue(null as any);
      const req = createReq({ body: { name: "Admin", description: "Full access" } });
      const res = createRes();
      await createRole(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ message: "Service Unavailable", data: {} });
    });

    it("should return 400 on validation error", async () => {
      mockRoleModel.createRole.mockRejectedValue(new ValidationException("Invalid name"));
      const req = createReq({ body: { name: "", description: "Full access" } });
      const res = createRes();
      await createRole(req, res);
      const tx = await mockTransaction.mock.results[0].value;
      expect(tx.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "Invalid name",
      });
    });

    it("should return 500 on error", async () => {
      mockRoleModel.createRole.mockResolvedValue({
        name: "Admin",
        description: "Full access",
      } as any);
      mockCreate.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: { name: "Admin", description: "Full access" } });
      const res = createRes();
      await createRole(req, res);
      const tx = await mockTransaction.mock.results[0].value;
      expect(tx.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        data: "DB error",
      });
    });
  });

  describe("updateRoleById", () => {
    it("should return 202 when role is updated", async () => {
      mockUpdate.mockResolvedValue({ id: 1, name: "Admin" } as any);
      const req = createReq({ params: { id: "1" }, body: { name: "Admin" } });
      const res = createRes();
      await updateRoleById(req, res);
      const tx = await mockTransaction.mock.results[0].value;
      expect(tx.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({
        message: "Accepted",
        data: { id: 1, name: "Admin" },
      });
    });

    it("should return 404 when role is not found", async () => {
      mockUpdate.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" }, body: { name: "Admin" } });
      const res = createRes();
      await updateRoleById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Not Found", data: {} });
    });

    it("should return 500 on error", async () => {
      mockUpdate.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { name: "Admin" } });
      const res = createRes();
      await updateRoleById(req, res);
      const tx = await mockTransaction.mock.results[0].value;
      expect(tx.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        data: "DB error",
      });
    });
  });

  describe("deleteRoleById", () => {
    it("should return 202 when role is deleted", async () => {
      mockDelete.mockResolvedValue({ id: 1 } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteRoleById(req, res);
      const tx = await mockTransaction.mock.results[0].value;
      expect(tx.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({
        message: "Accepted",
        data: { id: 1 },
      });
    });

    it("should return 404 when role is not found", async () => {
      mockDelete.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteRoleById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Not Found", data: {} });
    });

    it("should return 500 on error", async () => {
      mockDelete.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteRoleById(req, res);
      const tx = await mockTransaction.mock.results[0].value;
      expect(tx.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        data: "DB error",
      });
    });
  });
});
