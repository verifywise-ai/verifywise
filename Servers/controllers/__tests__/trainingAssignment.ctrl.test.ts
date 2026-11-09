import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockList = jest.fn(async (..._a: any[]): Promise<any> => []);
const mockCreate = jest.fn(async (..._a: any[]): Promise<any> => ({ created: [], errors: [] }));
const mockComplete = jest.fn(async (..._a: any[]): Promise<any> => ({}));
const mockDelete = jest.fn(async (..._a: any[]): Promise<any> => true);
const mockStats = jest.fn(async (..._a: any[]): Promise<any> => ({}));

jest.mock("../../utils/trainingAssignment.utils", () => ({
  listAssignmentsQuery: (...a: any[]) => mockList(...a),
  createAssignmentsQuery: (...a: any[]) => mockCreate(...a),
  completeAssignmentQuery: (...a: any[]) => mockComplete(...a),
  deleteAssignmentQuery: (...a: any[]) => mockDelete(...a),
  statsForTrainingQuery: (...a: any[]) => mockStats(...a),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: (_r: unknown, e: Error) => e.message,
}));

import {
  listTrainingAssignments,
  createTrainingAssignments,
  completeTrainingAssignment,
  deleteTrainingAssignment,
  getTrainingAssignmentStats,
} from "../trainingAssignment.ctrl";
import { NotFoundException } from "../../domain.layer/exceptions/custom.exception";

const res = () => {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("listTrainingAssignments", () => {
  it("passes query filters through to the utils", async () => {
    const req: any = {
      query: { training_id: "5", status: "overdue" },
      userId: 3,
      organizationId: 7,
    };
    mockList.mockResolvedValue([{ id: 1 }]);
    const r = res();
    await listTrainingAssignments(req, r);
    expect(mockList).toHaveBeenCalledWith(7, { trainingId: 5, status: "overdue" });
    expect(r.status).toHaveBeenCalledWith(200);
  });
});

describe("createTrainingAssignments", () => {
  it("bulk-creates with the caller as assigner and returns 201", async () => {
    const req: any = {
      body: { assignments: [{ trainingId: 5, subjectType: "user", subjectId: 9 }] },
      userId: 3,
      organizationId: 7,
    };
    mockCreate.mockResolvedValue({ created: [{ id: 1 }], errors: [] });
    const r = res();
    await createTrainingAssignments(req, r);
    expect(mockCreate).toHaveBeenCalledWith(
      [{ trainingId: 5, subjectType: "user", subjectId: 9 }],
      7,
      3,
    );
    expect(r.status).toHaveBeenCalledWith(201);
  });

  it("maps validation errors to their status code", async () => {
    const req: any = { body: { assignments: [] }, userId: 3, organizationId: 7 };
    const err: any = new Error("assignments must be a non-empty array");
    err.statusCode = 400;
    mockCreate.mockRejectedValue(err);
    const r = res();
    await createTrainingAssignments(req, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });
});

describe("completeTrainingAssignment", () => {
  it("returns 200 with the updated assignment", async () => {
    const req: any = { params: { id: "11" }, userId: 3, organizationId: 7 };
    mockComplete.mockResolvedValue({ id: 11, status: "completed" });
    const r = res();
    await completeTrainingAssignment(req, r);
    expect(mockComplete).toHaveBeenCalledWith(11, 7);
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it("returns 404 when the assignment does not exist in the org", async () => {
    const req: any = { params: { id: "99" }, userId: 3, organizationId: 7 };
    mockComplete.mockRejectedValue(new NotFoundException("not found", "training_assignment", 99));
    const r = res();
    await completeTrainingAssignment(req, r);
    expect(r.status).toHaveBeenCalledWith(404);
  });
});

describe("deleteTrainingAssignment", () => {
  it("returns 202 when deleted and 404 when missing", async () => {
    const req: any = { params: { id: "11" }, userId: 3, organizationId: 7 };
    mockDelete.mockResolvedValue(true);
    let r = res();
    await deleteTrainingAssignment(req, r);
    expect(r.status).toHaveBeenCalledWith(202);

    mockDelete.mockResolvedValue(false);
    r = res();
    await deleteTrainingAssignment(req, r);
    expect(r.status).toHaveBeenCalledWith(404);
  });
});

describe("getTrainingAssignmentStats", () => {
  it("forwards the optional training filter", async () => {
    const req: any = { query: { training_id: "5" }, userId: 3, organizationId: 7 };
    mockStats.mockResolvedValue({ training_id: 5, pending: 1, completed: 2, overdue: 0, total: 3 });
    const r = res();
    await getTrainingAssignmentStats(req, r);
    expect(mockStats).toHaveBeenCalledWith(7, 5);
    expect(r.status).toHaveBeenCalledWith(200);
  });
});
