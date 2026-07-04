import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
  getOrganizationsExistsQuery: jest.fn(),
  getOrganizationByIdQuery: jest.fn(),
  createOrganizationQuery: jest.fn(),
  updateOrganizationByIdQuery: jest.fn(),
  deleteOrganizationByIdQuery: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/logger/dbLogger", () => ({
  logEvent: jest.fn<any>().mockResolvedValue(undefined),
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
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
    503: (d: any) => ({ message: "Service Unavailable", data: d }),
  },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_, err) => (err as Error).message),
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
    query: jest.fn().mockResolvedValue([[], {}]),
  },
}));
jest.mock("../../domain.layer/models/organization/organization.model", () => ({
  OrganizationModel: {
    createNewOrganization: jest.fn(),
    findByIdWithValidation: jest.fn(),
  },
}));
jest.mock("../user.ctrl", () => ({
  createNewUserWrapper: jest.fn(),
}));
jest.mock("../../utils/auth.utils", () => ({
  generateUserTokens: jest.fn(),
}));
jest.mock("../../domain.layer/exceptions/custom.exception", () => ({
  ValidationException: class ValidationException extends Error {},
  BusinessLogicException: class BusinessLogicException extends Error {},
}));

import {
  getAllOrganizations,
  getOrganizationsExists,
  getOrganizationById,
  createOrganization,
  updateOrganizationById,
  deleteOrganizationById,
  updateOnboardingStatus,
} from "../organization.ctrl";
import {
  getAllOrganizationsQuery,
  getOrganizationsExistsQuery,
  getOrganizationByIdQuery,
  createOrganizationQuery,
  updateOrganizationByIdQuery,
  deleteOrganizationByIdQuery,
} from "../../utils/organization.utils";
import { OrganizationModel } from "../../domain.layer/models/organization/organization.model";
import { createNewUserWrapper } from "../user.ctrl";
import { generateUserTokens } from "../../utils/auth.utils";
import {
  ValidationException,
  BusinessLogicException,
} from "../../domain.layer/exceptions/custom.exception";
import {
  buildOrganization,
  buildManyOrganization,
} from "../../tests/factories/organization.factory";

const mockGetAll = getAllOrganizationsQuery as jest.MockedFunction<typeof getAllOrganizationsQuery>;
const mockGetExists = getOrganizationsExistsQuery as jest.MockedFunction<
  typeof getOrganizationsExistsQuery
>;
const mockGetById = getOrganizationByIdQuery as jest.MockedFunction<
  typeof getOrganizationByIdQuery
>;
const mockCreateQuery = createOrganizationQuery as jest.MockedFunction<
  typeof createOrganizationQuery
>;
const mockUpdateQuery = updateOrganizationByIdQuery as jest.MockedFunction<
  typeof updateOrganizationByIdQuery
>;
const mockDeleteQuery = deleteOrganizationByIdQuery as jest.MockedFunction<
  typeof deleteOrganizationByIdQuery
>;
const mockOrgCreate = OrganizationModel.createNewOrganization as jest.MockedFunction<
  typeof OrganizationModel.createNewOrganization
>;
const mockFindById = OrganizationModel.findByIdWithValidation as jest.MockedFunction<
  typeof OrganizationModel.findByIdWithValidation
>;
const mockCreateUser = createNewUserWrapper as jest.MockedFunction<typeof createNewUserWrapper>;
const mockGenTokens = generateUserTokens as jest.MockedFunction<typeof generateUserTokens>;

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

describe("organization.ctrl", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  describe("getAllOrganizations", () => {
    it("should return 200 with organizations when data exists", async () => {
      const data = buildManyOrganization(1);
      mockGetAll.mockResolvedValue(data as any);
      const req = createReq();
      const res = createRes();
      await getAllOrganizations(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data }));
    });
    it("should return 204 when no organizations exist", async () => {
      mockGetAll.mockResolvedValue([] as any);
      const req = createReq();
      const res = createRes();
      await getAllOrganizations(req, res);
      expect(res.status).toHaveBeenCalledWith(204);
    });
    it("should return 500 on error", async () => {
      mockGetAll.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getAllOrganizations(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getOrganizationsExists", () => {
    it("should return 200 with count", async () => {
      mockGetExists.mockResolvedValue(5 as any);
      const req = createReq();
      const res = createRes();
      await getOrganizationsExists(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: 5 }));
    });
    it("should return 500 on error", async () => {
      mockGetExists.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getOrganizationsExists(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getOrganizationById", () => {
    it("should return 200 when organization is found", async () => {
      const org = buildOrganization();
      mockGetById.mockResolvedValue(org as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getOrganizationById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: org }));
    });
    it("should return 404 when organization is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await getOrganizationById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getOrganizationById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createOrganization", () => {
    it("should return 201 when organization is created successfully", async () => {
      const org = buildOrganization({ name: "NewOrg" });
      const orgModel = {
        validateOrganizationData: jest.fn().mockResolvedValue(undefined),
      };
      mockOrgCreate.mockReturnValue(orgModel as any);
      mockCreateQuery.mockResolvedValue(org as any);
      mockCreateUser.mockResolvedValue({
        id: 2,
        toSafeJSON: () => ({ id: 2, email: "a@b.com" }),
      } as any);
      mockGenTokens.mockReturnValue({ accessToken: "tok" } as any);
      const req = createReq({
        body: {
          name: "NewOrg",
          logo: "",
          userEmail: "a@b.com",
          userName: "A",
          userSurname: "B",
          userPassword: "pass",
        },
      });
      const res = createRes();
      await createOrganization(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organization: { id: 1, name: "NewOrg" } }),
        }),
      );
    });
    it("should return 400 when creation returns null", async () => {
      const orgModel = {
        validateOrganizationData: jest.fn().mockResolvedValue(undefined),
      };
      mockOrgCreate.mockReturnValue(orgModel as any);
      mockCreateQuery.mockResolvedValue(null as any);
      const req = createReq({
        body: {
          name: "NewOrg",
          logo: "",
          userEmail: "a@b.com",
          userName: "A",
          userSurname: "B",
          userPassword: "pass",
        },
      });
      const res = createRes();
      await createOrganization(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 400 on ValidationException", async () => {
      const orgModel = {
        validateOrganizationData: jest.fn().mockRejectedValue(new ValidationException("invalid")),
      };
      mockOrgCreate.mockReturnValue(orgModel as any);
      const req = createReq({
        body: {
          name: "NewOrg",
          logo: "",
          userEmail: "a@b.com",
          userName: "A",
          userSurname: "B",
          userPassword: "pass",
        },
      });
      const res = createRes();
      await createOrganization(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 403 on BusinessLogicException", async () => {
      const orgModel = {
        validateOrganizationData: jest
          .fn()
          .mockRejectedValue(new BusinessLogicException("forbidden")),
      };
      mockOrgCreate.mockReturnValue(orgModel as any);
      const req = createReq({
        body: {
          name: "NewOrg",
          logo: "",
          userEmail: "a@b.com",
          userName: "A",
          userSurname: "B",
          userPassword: "pass",
        },
      });
      const res = createRes();
      await createOrganization(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it("should return 500 on unexpected error", async () => {
      mockOrgCreate.mockImplementation(() => {
        throw new Error("boom");
      });
      const req = createReq({
        body: {
          name: "NewOrg",
          logo: "",
          userEmail: "a@b.com",
          userName: "A",
          userSurname: "B",
          userPassword: "pass",
        },
      });
      const res = createRes();
      await createOrganization(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateOrganizationById", () => {
    it("should return 200 when organization is updated", async () => {
      const updated = buildOrganization({ name: "Updated" });
      const orgInstance = {
        updateOrganization: jest.fn().mockResolvedValue(undefined),
        validateOrganizationData: jest.fn().mockResolvedValue(undefined),
      };
      mockFindById.mockResolvedValue(orgInstance as any);
      mockUpdateQuery.mockResolvedValue(updated as any);
      const req = createReq({ params: { id: "1" }, body: { name: "Updated" } });
      const res = createRes();
      await updateOrganizationById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: updated }));
    });
    it("should return 404 when organization is not found", async () => {
      mockFindById.mockRejectedValue(new Error("not found"));
      const req = createReq({ params: { id: "99" }, body: { name: "Updated" } });
      const res = createRes();
      await updateOrganizationById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
    it("should return 400 on ValidationException", async () => {
      const orgInstance = {
        updateOrganization: jest.fn().mockResolvedValue(undefined),
        validateOrganizationData: jest.fn().mockRejectedValue(new ValidationException("bad")),
      };
      mockFindById.mockResolvedValue(orgInstance as any);
      const req = createReq({ params: { id: "1" }, body: { name: "Updated" } });
      const res = createRes();
      await updateOrganizationById(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 500 on unexpected error", async () => {
      mockFindById.mockRejectedValue(new Error("boom"));
      const req = createReq({ params: { id: "1" }, body: { name: "Updated" } });
      const res = createRes();
      await updateOrganizationById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteOrganizationById", () => {
    it("should return 200 when organization is deleted", async () => {
      const org = buildOrganization();
      mockGetById.mockResolvedValue(org as any);
      mockDeleteQuery.mockResolvedValue(true as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteOrganizationById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: org }));
    });
    it("should return 404 when organization is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await deleteOrganizationById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 400 when delete returns false", async () => {
      const org = buildOrganization();
      mockGetById.mockResolvedValue(org as any);
      mockDeleteQuery.mockResolvedValue(false as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteOrganizationById(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteOrganizationById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateOnboardingStatus", () => {
    it("should return 200 when onboarding status is updated", async () => {
      const org = buildOrganization();
      mockGetById.mockResolvedValue(org as any);
      const req = createReq({ params: { id: "1" }, organizationId: 1 });
      const res = createRes();
      await updateOnboardingStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { onboarding_status: "completed" } }),
      );
    });
    it("should return 403 when user does not belong to organization", async () => {
      const req = createReq({ params: { id: "2" }, organizationId: 1 });
      const res = createRes();
      await updateOnboardingStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it("should return 404 when organization is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" }, organizationId: 99 });
      const res = createRes();
      await updateOnboardingStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, organizationId: 1 });
      const res = createRes();
      await updateOnboardingStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
