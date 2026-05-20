import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/vendor.utils", () => ({
  getAllVendorsQuery: jest.fn(),
  getVendorByIdQuery: jest.fn(),
  getVendorByProjectIdQuery: jest.fn(),
  createNewVendorQuery: jest.fn(),
  updateVendorByIdQuery: jest.fn(),
  deleteVendorByIdQuery: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    201: (d: any) => ({ message: "Created", data: d }),
    202: (d: any) => ({ message: "Accepted", data: d }),
    204: (d: any) => ({ message: "No Content", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    401: (d: any) => ({ message: "Unauthorized", data: d }),
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
    query: jest.fn().mockResolvedValue([{ name: "Test", surname: "User" }]),
  },
}));
jest.mock("../../domain.layer/models/vendor/vendor.model", () => ({
  VendorModel: Object.assign(
    jest.fn().mockImplementation(function (data: any) {
      Object.assign(this, data);
      this.updateVendor = jest.fn().mockResolvedValue(undefined);
      this.validateVendorData = jest.fn().mockResolvedValue(undefined);
      this.canBeModified = jest.fn().mockReturnValue(undefined);
    }),
    {
      createNewVendor: jest.fn().mockImplementation(() => ({
        validateVendorData: jest.fn().mockResolvedValue(undefined),
        canBeModified: jest.fn().mockReturnValue(undefined),
      })),
    },
  ),
}));
jest.mock("../../utils/vendorChangeHistory.utils", () => ({
  recordVendorCreation: jest.fn().mockResolvedValue(undefined),
  trackVendorChanges: jest.fn().mockResolvedValue([]),
  recordMultipleFieldChanges: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/inAppNotification.service", () => ({
  notifyUserAssigned: jest.fn().mockResolvedValue(undefined),
}));

import {
  getAllVendors,
  getVendorById,
  getVendorByProjectId,
  createVendor,
  updateVendorById,
  deleteVendorById,
} from "../vendor.ctrl";
import {
  getAllVendorsQuery,
  getVendorByIdQuery,
  getVendorByProjectIdQuery,
  createNewVendorQuery,
  updateVendorByIdQuery,
  deleteVendorByIdQuery,
} from "../../utils/vendor.utils";

const mockGetAll = getAllVendorsQuery as jest.MockedFunction<typeof getAllVendorsQuery>;
const mockGetById = getVendorByIdQuery as jest.MockedFunction<typeof getVendorByIdQuery>;
const mockGetByProject = getVendorByProjectIdQuery as jest.MockedFunction<
  typeof getVendorByProjectIdQuery
>;
const mockCreate = createNewVendorQuery as jest.MockedFunction<typeof createNewVendorQuery>;
const mockUpdate = updateVendorByIdQuery as jest.MockedFunction<typeof updateVendorByIdQuery>;
const mockDelete = deleteVendorByIdQuery as jest.MockedFunction<typeof deleteVendorByIdQuery>;

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

describe("vendor.ctrl", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  describe("getAllVendors", () => {
    it("should return 200 with vendors when data exists", async () => {
      const data = [{ id: 1, vendor_name: "V1" }];
      mockGetAll.mockResolvedValue(data as any);
      const req = createReq();
      const res = createRes();
      await getAllVendors(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data }));
    });
    it("should return 200 even when vendors array is empty (truthy check)", async () => {
      mockGetAll.mockResolvedValue([] as any);
      const req = createReq();
      const res = createRes();
      await getAllVendors(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      mockGetAll.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getAllVendors(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getVendorById", () => {
    it("should return 200 when vendor is found", async () => {
      const vendor = { id: 1, vendor_name: "V1" };
      mockGetById.mockResolvedValue(vendor as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getVendorById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: vendor }));
    });
    it("should return 404 when vendor is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await getVendorById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getVendorById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getVendorByProjectId", () => {
    it("should return 200 when vendor is found", async () => {
      const vendor = { id: 1, vendor_name: "V1" };
      mockGetByProject.mockResolvedValue(vendor as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getVendorByProjectId(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 404 when vendor is not found", async () => {
      mockGetByProject.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await getVendorByProjectId(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockGetByProject.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getVendorByProjectId(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createVendor", () => {
    it("should return 201 when vendor is created successfully", async () => {
      const vendor = { id: 1, vendor_name: "V1", assignee: null, reviewer: null };
      mockCreate.mockResolvedValue(vendor as any);
      const req = createReq({
        body: {
          vendor_name: "V1",
          vendor_provides: "P",
          assignee: null,
          website: "",
          vendor_contact_person: "",
          review_result: "",
          review_status: "",
          reviewer: null,
          review_date: "",
          order_no: "",
          is_demo: false,
          projects: [],
          data_sensitivity: "",
          business_criticality: "",
          past_issues: "",
          regulatory_exposure: "",
          risk_score: 0,
        },
      });
      const res = createRes();
      await createVendor(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: vendor }));
    });
    it("should return 503 when creation returns null", async () => {
      mockCreate.mockResolvedValue(null as any);
      const req = createReq({ body: { vendor_name: "V1" } });
      const res = createRes();
      await createVendor(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });
    it("should return 500 on unexpected error", async () => {
      mockCreate.mockRejectedValue(new Error("boom"));
      const req = createReq({ body: { vendor_name: "V1" } });
      const res = createRes();
      await createVendor(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateVendorById", () => {
    it("should return 401 when userId or role is missing", async () => {
      const req = createReq({
        params: { id: "1" },
        body: { vendor_name: "V2" },
        userId: undefined,
        role: undefined,
      });
      const res = createRes();
      await updateVendorById(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should return 404 when vendor is not found", async () => {
      mockGetById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" }, body: { vendor_name: "V2" } });
      const res = createRes();
      await updateVendorById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 202 when vendor is updated", async () => {
      const existing = { id: 1, vendor_name: "V1", assignee: null, reviewer: null };
      const updated = { id: 1, vendor_name: "V2", assignee: null, reviewer: null };
      mockGetById.mockResolvedValue(existing as any);
      mockUpdate.mockResolvedValue(updated as any);
      const req = createReq({ params: { id: "1" }, body: { vendor_name: "V2" } });
      const res = createRes();
      await updateVendorById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: updated }));
    });
    it("should return 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" }, body: { vendor_name: "V2" } });
      const res = createRes();
      await updateVendorById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteVendorById", () => {
    it("should return 202 when vendor is deleted", async () => {
      const vendor = { id: 1, vendor_name: "V1" };
      mockDelete.mockResolvedValue(vendor as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteVendorById(req, res);
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: vendor }));
    });
    it("should return 404 when vendor is not found", async () => {
      mockDelete.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      await deleteVendorById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockDelete.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteVendorById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
