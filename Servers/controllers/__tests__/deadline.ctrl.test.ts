import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/deadline.utils", () => ({
  getTasksDeadlineSummaryQuery: jest.fn(),
  DEFAULT_DEADLINE_THRESHOLD_DAYS: 14,
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn<any>(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
  },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req, err) => (err as Error).message),
}));

import { getDeadlinesSummary } from "../deadline.ctrl";
import { getTasksDeadlineSummaryQuery } from "../../utils/deadline.utils";

const mockSummary = getTasksDeadlineSummaryQuery as jest.MockedFunction<
  typeof getTasksDeadlineSummaryQuery
>;

function createReq(overrides?: Partial<Request>): Request {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    query: {},
    ...overrides,
  } as any;
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("deadline.ctrl - getDeadlinesSummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns 200 with { tasks: { overdue, dueSoon, threshold } } using the default threshold", async () => {
    mockSummary.mockResolvedValue({ overdue: 3, dueSoon: 5, threshold: 14 });

    const req = createReq();
    const res = createRes();

    await getDeadlinesSummary(req, res as Response);

    expect(mockSummary).toHaveBeenCalledWith({
      userId: 1,
      role: "Admin",
      organizationId: 1,
      threshold: 14,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "OK",
      data: { tasks: { overdue: 3, dueSoon: 5, threshold: 14 } },
    });
  });

  it("forwards a custom threshold query parameter to the util", async () => {
    mockSummary.mockResolvedValue({ overdue: 0, dueSoon: 2, threshold: 30 });

    const req = createReq({ query: { threshold: "30" } as any });
    const res = createRes();

    await getDeadlinesSummary(req, res as Response);

    expect(mockSummary).toHaveBeenCalledWith({
      userId: 1,
      role: "Admin",
      organizationId: 1,
      threshold: 30,
    });
    expect(res.json).toHaveBeenCalledWith({
      message: "OK",
      data: { tasks: { overdue: 0, dueSoon: 2, threshold: 30 } },
    });
  });

  it("falls back to the default threshold when the query param is not a finite number", async () => {
    mockSummary.mockResolvedValue({ overdue: 0, dueSoon: 0, threshold: 14 });

    const req = createReq({ query: { threshold: "abc" } as any });
    const res = createRes();

    await getDeadlinesSummary(req, res as Response);

    expect(mockSummary).toHaveBeenCalledWith({
      userId: 1,
      role: "Admin",
      organizationId: 1,
      threshold: 14,
    });
  });

  it("passes the caller's role through so visibility is enforced in the util", async () => {
    mockSummary.mockResolvedValue({ overdue: 1, dueSoon: 0, threshold: 14 });

    const req = createReq({ userId: 42, role: "Editor" });
    const res = createRes();

    await getDeadlinesSummary(req, res as Response);

    expect(mockSummary).toHaveBeenCalledWith({
      userId: 42,
      role: "Editor",
      organizationId: 1,
      threshold: 14,
    });
  });

  it("returns 500 when the util throws", async () => {
    mockSummary.mockRejectedValue(new Error("DB exploded"));

    const req = createReq();
    const res = createRes();

    await getDeadlinesSummary(req, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Internal Server Error",
      data: "DB exploded",
    });
  });
});
