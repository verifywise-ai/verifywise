import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/vendor.utils", () => ({
  getAllVendorsQuery: jest.fn(),
  getVendorByIdQuery: jest.fn(),
  createNewVendorQuery: jest.fn(),
  updateVendorByIdQuery: jest.fn(),
  deleteVendorByIdQuery: jest.fn(),
  getVendorByProjectIdQuery: jest.fn(),
}));
jest.mock("../../utils/vendorChangeHistory.utils", () => ({
  recordVendorCreation: jest.fn().mockResolvedValue(undefined),
  trackVendorChanges: jest.fn().mockResolvedValue([]),
  recordMultipleFieldChanges: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn().mockResolvedValue(undefined),
  logSuccess: jest.fn().mockResolvedValue(undefined),
  logFailure: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    201: (d: any) => ({ message: "Created", data: d }),
    204: (d: any) => ({ message: "No Content", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req, err) => (err as Error).message),
}));
jest.mock("../../services/inAppNotification.service", () => ({
  notifyUserAssigned: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn().mockResolvedValue([]),
    transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
  },
}));

import { buildVendor, buildManyVendor } from "../../tests/factories/vendor.factory";
import { getAllVendors, getVendorById } from "../vendor.ctrl";
import { getAllVendorsQuery, getVendorByIdQuery } from "../../utils/vendor.utils";

const mockGetAllVendorsQuery = getAllVendorsQuery as jest.MockedFunction<typeof getAllVendorsQuery>;
const mockGetVendorByIdQuery = getVendorByIdQuery as jest.MockedFunction<typeof getVendorByIdQuery>;

function createMockReq(partial: Partial<Request> = {}): Partial<Request> {
  return {
    organizationId: 1,
    userId: 1,
    t: (key: string) => key,
    ...partial,
  } as Partial<Request>;
}

function createMockRes(): Partial<Response> & { _status?: number; _json?: any } {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

describe("vendor.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAllVendors", () => {
    it("should return 200 with vendors when data exists", async () => {
      const vendors = [buildVendor(), buildVendor({ id: 2, vendor_name: "Global Data" })];
      mockGetAllVendorsQuery.mockResolvedValue(vendors as any);
      const req = createMockReq() as Request;
      const res = createMockRes();

      await getAllVendors(req, res as Response);

      expect(mockGetAllVendorsQuery).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: vendors }));
    });

    it("should return 200 with empty array when no vendors exist", async () => {
      mockGetAllVendorsQuery.mockResolvedValue([] as any);
      const req = createMockReq() as Request;
      const res = createMockRes();

      await getAllVendors(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
    });

    it("should return 500 when database throws", async () => {
      mockGetAllVendorsQuery.mockRejectedValue(new Error("DB failure"));
      const req = createMockReq() as Request;
      const res = createMockRes();

      await getAllVendors(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Internal Server Error" }),
      );
    });
  });

  describe("getVendorById", () => {
    it("should return 200 with vendor when found", async () => {
      const vendor = buildVendor();
      mockGetVendorByIdQuery.mockResolvedValue(vendor as any);
      const req = createMockReq({ params: { id: "1" } }) as Request;
      const res = createMockRes();

      await getVendorById(req, res as Response);

      expect(mockGetVendorByIdQuery).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: vendor }));
    });

    it("should return 404 when vendor is not found", async () => {
      mockGetVendorByIdQuery.mockResolvedValue(null as any);
      const req = createMockReq({ params: { id: "99" } }) as Request;
      const res = createMockRes();

      await getVendorById(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Not Found" }));
    });

    it("should return 500 on unexpected error", async () => {
      mockGetVendorByIdQuery.mockRejectedValue(new Error("DB error"));
      const req = createMockReq({ params: { id: "1" } }) as Request;
      const res = createMockRes();

      await getVendorById(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
