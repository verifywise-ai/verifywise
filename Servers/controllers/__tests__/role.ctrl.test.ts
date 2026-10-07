import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/role.utils", () => ({
  getAllRolesForOrganizationQuery: jest.fn(),
  getRoleByIdQuery: jest.fn(),
  getRoleByNameInOrganizationQuery: jest.fn(),
  countUsersWithRoleQuery: jest.fn(),
  createNewRoleQuery: jest.fn(),
  updateRoleByIdQuery: jest.fn(),
  deleteRoleByIdQuery: jest.fn(),
}));

jest.mock("../../utils/rolePermissions.utils", () => ({
  deleteRolePermissionsForRoleQuery: jest.fn(),
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
    403: (data: any) => ({ message: "Forbidden", data }),
    404: (data: any) => ({ message: "Not Found", data }),
    409: (data: any) => ({ message: "Conflict", data }),
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
  getAllRolesForOrganizationQuery,
  getRoleByIdQuery,
  getRoleByNameInOrganizationQuery,
  countUsersWithRoleQuery,
  createNewRoleQuery,
  updateRoleByIdQuery,
  deleteRoleByIdQuery,
} from "../../utils/role.utils";
import { deleteRolePermissionsForRoleQuery } from "../../utils/rolePermissions.utils";
import { RoleModel } from "../../domain.layer/models/role/role.model";
import { sequelize } from "../../database/db";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

const mockGetAll = getAllRolesForOrganizationQuery as jest.MockedFunction<
  typeof getAllRolesForOrganizationQuery
>;
const mockGetById = getRoleByIdQuery as jest.MockedFunction<typeof getRoleByIdQuery>;
const mockGetByName = getRoleByNameInOrganizationQuery as jest.MockedFunction<
  typeof getRoleByNameInOrganizationQuery
>;
const mockCountUsers = countUsersWithRoleQuery as jest.MockedFunction<
  typeof countUsersWithRoleQuery
>;
const mockCreate = createNewRoleQuery as jest.MockedFunction<typeof createNewRoleQuery>;
const mockUpdate = updateRoleByIdQuery as jest.MockedFunction<typeof updateRoleByIdQuery>;
const mockDelete = deleteRoleByIdQuery as jest.MockedFunction<typeof deleteRoleByIdQuery>;
const mockDeletePerms = deleteRolePermissionsForRoleQuery as jest.MockedFunction<
  typeof deleteRolePermissionsForRoleQuery
>;
const mockRoleModel = RoleModel as jest.Mocked<typeof RoleModel>;
const mockTransaction = sequelize.transaction as jest.MockedFunction<typeof sequelize.transaction>;

/** A custom (org-scoped) role owned by organization 1. */
const customRole = { id: 1, name: "AI Engineer", organization_id: 1 } as any;

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
      mockGetById.mockResolvedValue({ id: 1, name: "Admin", organization_id: null } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getRoleById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { id: 1, name: "Admin", organization_id: null },
      });
    });

    it("should return the caller's own organization's custom role", async () => {
      mockGetById.mockResolvedValue({ id: 41, name: "Risk Lead", organization_id: 1 } as any);
      const req = createReq({ params: { id: "41" }, organizationId: 1 } as any);
      const res = createRes();
      await getRoleById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should answer another organization's custom role as not found", async () => {
      // Same response as a missing id, so role ids of other organizations
      // cannot be probed.
      mockGetById.mockResolvedValue({ id: 40, name: "Auditor Plus", organization_id: 2 } as any);
      const req = createReq({ params: { id: "40" }, organizationId: 1 } as any);
      const res = createRes();
      await getRoleById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Not Found", data: null });
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
        name: "AI Engineer",
        description: "Custom role",
      } as any);
      mockGetByName.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ id: 5 } as any);
      const req = createReq({ body: { name: "AI Engineer", description: "Custom role" } });
      const res = createRes();
      await createRole(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ message: "Created", data: { id: 5 } });
    });

    it("should return 400 when the name is reserved for a built-in role", async () => {
      const req = createReq({ body: { name: "Admin", description: "Copy" } });
      const res = createRes();
      await createRole(req, res);
      const tx = await mockTransaction.mock.results[0].value;
      expect(tx.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when a role with the name already exists in the org", async () => {
      mockRoleModel.createRole.mockResolvedValue({
        name: "AI Engineer",
        description: "Custom role",
      } as any);
      mockGetByName.mockResolvedValue({ id: 9, name: "AI Engineer" } as any);
      const req = createReq({ body: { name: "AI Engineer", description: "Custom role" } });
      const res = createRes();
      await createRole(req, res);
      const tx = await mockTransaction.mock.results[0].value;
      expect(tx.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 503 when creation returns null", async () => {
      mockRoleModel.createRole.mockResolvedValue({
        name: "AI Engineer",
        description: "Custom role",
      } as any);
      mockGetByName.mockResolvedValue(null);
      mockCreate.mockResolvedValue(null as any);
      const req = createReq({ body: { name: "AI Engineer", description: "Custom role" } });
      const res = createRes();
      await createRole(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ message: "Service Unavailable", data: {} });
    });

    it("should return 400 on validation error", async () => {
      mockRoleModel.createRole.mockRejectedValue(new ValidationException("Invalid name"));
      const req = createReq({ body: { name: "", description: "Custom role" } });
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
        name: "AI Engineer",
        description: "Custom role",
      } as any);
      mockGetByName.mockResolvedValue(null);
      mockCreate.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: { name: "AI Engineer", description: "Custom role" } });
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
      mockGetById.mockResolvedValue(customRole);
      mockUpdate.mockResolvedValue({ id: 1, name: "AI Engineer" } as any);
      const req = createReq({ params: { id: "1" }, body: { description: "Updated" } });
      const res = createRes();
      await updateRoleById(req, res);
      const tx = await mockTransaction.mock.results[0].value;
      expect(tx.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({
        message: "Accepted",
        data: { id: 1, name: "AI Engineer" },
      });
    });

    it("should return 404 when role is not found", async () => {
      mockGetById.mockResolvedValue(null);
      const req = createReq({ params: { id: "1" }, body: { name: "AI Engineer" } });
      const res = createRes();
      await updateRoleById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Not Found", data: {} });
    });

    it("should return 403 when the role is a built-in role", async () => {
      mockGetById.mockResolvedValue({ id: 1, name: "Admin", organization_id: null } as any);
      const req = createReq({ params: { id: "1" }, body: { name: "Renamed" } });
      const res = createRes();
      await updateRoleById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 403 when the role belongs to another organization", async () => {
      mockGetById.mockResolvedValue({ id: 1, name: "AI Engineer", organization_id: 2 } as any);
      const req = createReq({ params: { id: "1" }, body: { name: "Renamed" } });
      const res = createRes();
      await updateRoleById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 500 on error", async () => {
      mockGetById.mockResolvedValue(customRole);
      mockUpdate.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { name: "AI Engineer" } });
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
      mockGetById.mockResolvedValue(customRole);
      mockCountUsers.mockResolvedValue(0);
      mockDelete.mockResolvedValue({ id: 1 } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteRoleById(req, res);
      const tx = await mockTransaction.mock.results[0].value;
      expect(mockDeletePerms).toHaveBeenCalledWith(1, 1, tx);
      expect(tx.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({
        message: "Accepted",
        data: { id: 1 },
      });
    });

    it("should return 404 when role is not found", async () => {
      mockGetById.mockResolvedValue(null);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteRoleById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Not Found", data: {} });
    });

    it("should return 403 when the role is a built-in role", async () => {
      mockGetById.mockResolvedValue({ id: 1, name: "Admin", organization_id: null } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteRoleById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 409 when users are still assigned to the role", async () => {
      mockGetById.mockResolvedValue(customRole);
      mockCountUsers.mockResolvedValue(3);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteRoleById(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("should return 500 on error", async () => {
      mockGetById.mockResolvedValue(customRole);
      mockCountUsers.mockResolvedValue(0);
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
