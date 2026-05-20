import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/assessment.utils", () => ({
  getAllAssessmentsQuery: jest.fn(),
  getAssessmentByIdQuery: jest.fn(),
  deleteAssessmentByIdQuery: jest.fn(),
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
    503: (data: any) => ({ message: "Service Unavailable", data }),
    204: (data: any) => ({ message: "No Content", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    404: (data: any) => ({ message: "Not Found", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
    503: (data: any) => ({ message: "Service Unavailable", data }),
  },
}));

jest.mock("../../domain.layer/models/assessment/assessment.model", () => ({
  AssessmentModel: {
    CreateNewAssessment: jest.fn(),
    UpdateAssessment: jest.fn(),
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

jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: any, error: any) => (error as Error).message),
}));

import {
  getAllAssessments,
  getAssessmentById,
  createAssessment,
  updateAssessmentById,
  deleteAssessmentById,
} from "../assessment.ctrl";
import {
  getAllAssessmentsQuery,
  getAssessmentByIdQuery,
  deleteAssessmentByIdQuery,
} from "../../utils/assessment.utils";
import { AssessmentModel } from "../../domain.layer/models/assessment/assessment.model";

const mockGetAllAssessmentsQuery = getAllAssessmentsQuery as jest.MockedFunction<
  typeof getAllAssessmentsQuery
>;
const mockGetAssessmentByIdQuery = getAssessmentByIdQuery as jest.MockedFunction<
  typeof getAssessmentByIdQuery
>;
const mockDeleteAssessmentByIdQuery = deleteAssessmentByIdQuery as jest.MockedFunction<
  typeof deleteAssessmentByIdQuery
>;
const mockAssessmentModel = AssessmentModel as jest.Mocked<typeof AssessmentModel>;

function createReq(overrides?: Partial<Request>): Partial<Request> {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    body: {},
    params: {},
    t: (key: string) => key,
    ...overrides,
  } as any;
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("assessment.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getAllAssessments", () => {
    it("should return 200 with assessments when data exists", async () => {
      const mockAssessments = [{ id: 1, name: "Assessment 1" }];
      mockGetAllAssessmentsQuery.mockResolvedValue(mockAssessments as any);

      const req = createReq();
      const res = createRes();

      await getAllAssessments(req as Request, res as Response);

      expect(mockGetAllAssessmentsQuery).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: mockAssessments,
      });
    });

    it("should return 204 when no assessments exist", async () => {
      mockGetAllAssessmentsQuery.mockResolvedValue(null as any);

      const req = createReq();
      const res = createRes();

      await getAllAssessments(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(204);
    });

    it("should return 500 on error", async () => {
      mockGetAllAssessmentsQuery.mockRejectedValue(new Error("Database error"));

      const req = createReq();
      const res = createRes();

      await getAllAssessments(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        data: "Database error",
      });
    });
  });

  describe("getAssessmentById", () => {
    it("should return 200 when assessment is found", async () => {
      const mockAssessment = { id: 1, name: "Assessment 1" };
      mockGetAssessmentByIdQuery.mockResolvedValue(mockAssessment as any);

      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await getAssessmentById(req as Request, res as Response);

      expect(mockGetAssessmentByIdQuery).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: mockAssessment,
      });
    });

    it("should return 404 when assessment is not found", async () => {
      mockGetAssessmentByIdQuery.mockResolvedValue(null as any);

      const req = createReq({ params: { id: "999" } });
      const res = createRes();

      await getAssessmentById(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Not Found",
        data: null,
      });
    });

    it("should return 500 on error", async () => {
      mockGetAssessmentByIdQuery.mockRejectedValue(new Error("Database error"));

      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await getAssessmentById(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createAssessment", () => {
    it("should return 400 when project_id is missing", async () => {
      const req = createReq({ body: {} });
      const res = createRes();

      await createAssessment(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: {
          message: "project_id is required",
          field: "project_id",
        },
      });
    });

    it("should return 201 when assessment is created successfully", async () => {
      const mockAssessment = {
        toSafeJSON: jest.fn().mockReturnValue({ id: 1, project_id: 1 }),
      };
      mockAssessmentModel.CreateNewAssessment.mockResolvedValue(mockAssessment as any);

      const req = createReq({ body: { project_id: 1 } });
      const res = createRes();

      await createAssessment(req as Request, res as Response);

      expect(mockAssessmentModel.CreateNewAssessment).toHaveBeenCalledWith({ project_id: 1 });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "Created",
        data: {
          message: "Assessment created successfully",
          assessment: { id: 1, project_id: 1 },
        },
      });
    });

    it("should return 503 when creation returns null", async () => {
      mockAssessmentModel.CreateNewAssessment.mockResolvedValue(null as any);

      const req = createReq({ body: { project_id: 1 } });
      const res = createRes();

      await createAssessment(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 500 on error", async () => {
      mockAssessmentModel.CreateNewAssessment.mockRejectedValue(new Error("Database error"));

      const req = createReq({ body: { project_id: 1 } });
      const res = createRes();

      await createAssessment(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateAssessmentById", () => {
    it("should return 400 when project_id is missing", async () => {
      const req = createReq({ params: { id: "1" }, body: {} });
      const res = createRes();

      await updateAssessmentById(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 202 when assessment is updated", async () => {
      const updatedAssessment = {
        toSafeJSON: jest.fn().mockReturnValue({ id: 1, project_id: 1 }),
      };
      mockAssessmentModel.UpdateAssessment.mockResolvedValue([1, [updatedAssessment]] as any);

      const req = createReq({ params: { id: "1" }, body: { project_id: 1 } });
      const res = createRes();

      await updateAssessmentById(req as Request, res as Response);

      expect(mockAssessmentModel.UpdateAssessment).toHaveBeenCalledWith(1, { project_id: 1 });
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({
        message: "Accepted",
        data: {
          message: "Assessment updated successfully",
          assessment: { id: 1, project_id: 1 },
        },
      });
    });

    it("should return 404 when assessment is not found", async () => {
      mockAssessmentModel.UpdateAssessment.mockResolvedValue([0, []] as any);

      const req = createReq({ params: { id: "999" }, body: { project_id: 1 } });
      const res = createRes();

      await updateAssessmentById(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 500 on error", async () => {
      mockAssessmentModel.UpdateAssessment.mockRejectedValue(new Error("Database error"));

      const req = createReq({ params: { id: "1" }, body: { project_id: 1 } });
      const res = createRes();

      await updateAssessmentById(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteAssessmentById", () => {
    it("should return 202 when assessment is deleted", async () => {
      const mockDeleted = { id: 1 };
      mockDeleteAssessmentByIdQuery.mockResolvedValue(mockDeleted as any);

      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await deleteAssessmentById(req as Request, res as Response);

      expect(mockDeleteAssessmentByIdQuery).toHaveBeenCalledWith(1, 1, expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({
        message: "Accepted",
        data: mockDeleted,
      });
    });

    it("should return 404 when assessment is not found", async () => {
      mockDeleteAssessmentByIdQuery.mockResolvedValue(null as any);

      const req = createReq({ params: { id: "999" } });
      const res = createRes();

      await deleteAssessmentById(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 500 on error", async () => {
      mockDeleteAssessmentByIdQuery.mockRejectedValue(new Error("Database error"));

      const req = createReq({ params: { id: "1" } });
      const res = createRes();

      await deleteAssessmentById(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
