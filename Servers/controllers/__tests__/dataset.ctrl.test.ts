import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/dataset.utils", () => ({
  getAllDatasetsQuery: jest.fn(),
  getDatasetByIdQuery: jest.fn(),
  createNewDatasetQuery: jest.fn(),
  updateDatasetByIdQuery: jest.fn(),
  deleteDatasetByIdQuery: jest.fn(),
  getDatasetsByModelIdQuery: jest.fn(),
  getDatasetsByProjectIdQuery: jest.fn(),
}));
jest.mock("../../utils/datasetChangeHistory.utils", () => ({
  recordDatasetCreation: jest.fn().mockResolvedValue(undefined),
  recordDatasetDeletion: jest.fn().mockResolvedValue(undefined),
  trackDatasetChanges: jest.fn().mockResolvedValue([]),
  recordDatasetFieldChanges: jest.fn().mockResolvedValue(undefined),
  getDatasetChangeHistory: jest.fn().mockResolvedValue([]),
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
    204: (d: any) => ({ message: "No Content", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req, err) => (err as Error).message),
}));
jest.mock("../../utils/validations/datasetValidation.utils", () => ({
  validateCompleteDatasetCreation: jest.fn().mockReturnValue({ isValid: true }),
  validateCompleteDatasetUpdate: jest.fn().mockReturnValue({ isValid: true }),
  validateDatasetIdParam: jest.fn().mockReturnValue({ isValid: true }),
}));

import { getAllDatasets, getDatasetById } from "../dataset.ctrl";
import { getAllDatasetsQuery, getDatasetByIdQuery } from "../../utils/dataset.utils";

const mockGetAllDatasetsQuery = getAllDatasetsQuery as jest.MockedFunction<
  typeof getAllDatasetsQuery
>;
const mockGetDatasetByIdQuery = getDatasetByIdQuery as jest.MockedFunction<
  typeof getDatasetByIdQuery
>;

function createMockReq(partial: Partial<Request> = {}): Partial<Request> {
  return {
    organizationId: 1,
    tenantId: 1,
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

describe("dataset.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAllDatasets", () => {
    it("should return 200 with datasets when data exists", async () => {
      const datasets = [
        { toSafeJSON: () => ({ id: 1, name: "Dataset A" }) },
        { toSafeJSON: () => ({ id: 2, name: "Dataset B" }) },
      ];
      mockGetAllDatasetsQuery.mockResolvedValue(datasets as any);
      const req = createMockReq() as Request;
      const res = createMockRes();

      await getAllDatasets(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            { id: 1, name: "Dataset A" },
            { id: 2, name: "Dataset B" },
          ],
        }),
      );
    });

    it("should return 200 with empty array when no datasets exist", async () => {
      mockGetAllDatasetsQuery.mockResolvedValue([] as any);
      const req = createMockReq() as Request;
      const res = createMockRes();

      await getAllDatasets(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
    });

    it("should return 500 when database throws", async () => {
      mockGetAllDatasetsQuery.mockRejectedValue(new Error("DB failure"));
      const req = createMockReq() as Request;
      const res = createMockRes();

      await getAllDatasets(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Internal Server Error" }),
      );
    });
  });

  describe("getDatasetById", () => {
    it("should return 200 with dataset when found", async () => {
      const dataset = { toSafeJSON: () => ({ id: 1, name: "Dataset A" }) };
      mockGetDatasetByIdQuery.mockResolvedValue(dataset as any);
      const req = createMockReq({ params: { id: "1" } }) as Request;
      const res = createMockRes();

      await getDatasetById(req, res as Response);

      expect(mockGetDatasetByIdQuery).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { id: 1, name: "Dataset A" } }),
      );
    });

    it("should return 204 when dataset is not found", async () => {
      mockGetDatasetByIdQuery.mockResolvedValue(null as any);
      const req = createMockReq({ params: { id: "99" } }) as Request;
      const res = createMockRes();

      await getDatasetById(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(204);
    });

    it("should return 400 for invalid dataset id", async () => {
      const { validateDatasetIdParam } = require("../../utils/validations/datasetValidation.utils");
      validateDatasetIdParam.mockReturnValue({
        isValid: false,
        message: "Invalid ID",
        code: "INVALID_PARAMETER",
      });
      const req = createMockReq({ params: { id: "abc" } }) as Request;
      const res = createMockRes();

      await getDatasetById(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Invalid ID", code: "INVALID_PARAMETER" }),
      );
    });

    it("should return 500 on unexpected error", async () => {
      const { validateDatasetIdParam } = require("../../utils/validations/datasetValidation.utils");
      validateDatasetIdParam.mockReturnValue({ isValid: true });
      mockGetDatasetByIdQuery.mockRejectedValue(new Error("DB error"));
      const req = createMockReq({ params: { id: "1" } }) as Request;
      const res = createMockRes();

      await getDatasetById(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
