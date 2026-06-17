import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { Request, Response } from "express";

jest.mock("../../utils/deadline.utils", () => ({
  DEFAULT_DUE_SOON_THRESHOLD_DAYS: 14,
  getTaskDeadlineSummaryQuery: jest.fn<any>(),
}));

jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: any, error: any) => (error as Error).message),
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));

import { getDeadlinesSummary } from "../deadline.ctrl";
import { getTaskDeadlineSummaryQuery } from "../../utils/deadline.utils";

const mockGetSummary = getTaskDeadlineSummaryQuery as jest.MockedFunction<
  typeof getTaskDeadlineSummaryQuery
>;

function createReq(overrides?: Partial<Request>): Request {
  return {
    userId: 7,
    organizationId: 99,
    role: "Editor",
    query: {},
    t: ((k: string) => k) as any,
    ...overrides,
  } as unknown as Request;
}

function createRes(): Response {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("deadline.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getDeadlinesSummary", () => {
    it("returns 200 with { tasks: { overdue, dueSoon, threshold } } using the default threshold of 14", async () => {
      mockGetSummary.mockResolvedValueOnce({ overdue: 3, dueSoon: 5, threshold: 14 });

      const req = createReq();
      const res = createRes();

      await getDeadlinesSummary(req, res);

      expect(mockGetSummary).toHaveBeenCalledWith({
        userId: 7,
        role: "Editor",
        organizationId: 99,
        thresholdDays: 14,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { tasks: { overdue: 3, dueSoon: 5, threshold: 14 } },
      });
    });

    it("respects a custom ?threshold query param", async () => {
      mockGetSummary.mockResolvedValueOnce({ overdue: 0, dueSoon: 2, threshold: 7 });

      const req = createReq({ query: { threshold: "7" } as any });
      const res = createRes();

      await getDeadlinesSummary(req, res);

      expect(mockGetSummary).toHaveBeenCalledWith(
        expect.objectContaining({ thresholdDays: 7 }),
      );
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { tasks: { overdue: 0, dueSoon: 2, threshold: 7 } },
      });
    });

    it("accepts the legacy ?days alias when ?threshold is absent", async () => {
      mockGetSummary.mockResolvedValueOnce({ overdue: 1, dueSoon: 1, threshold: 30 });

      const req = createReq({ query: { days: "30" } as any });
      const res = createRes();

      await getDeadlinesSummary(req, res);

      expect(mockGetSummary).toHaveBeenCalledWith(
        expect.objectContaining({ thresholdDays: 30 }),
      );
    });

    it("falls back to the default threshold when the param is non-numeric", async () => {
      mockGetSummary.mockResolvedValueOnce({ overdue: 0, dueSoon: 0, threshold: 14 });

      const req = createReq({ query: { threshold: "abc" } as any });
      const res = createRes();

      await getDeadlinesSummary(req, res);

      expect(mockGetSummary).toHaveBeenCalledWith(
        expect.objectContaining({ thresholdDays: 14 }),
      );
    });

    it("falls back to the default threshold when the param is zero or negative", async () => {
      mockGetSummary.mockResolvedValueOnce({ overdue: 0, dueSoon: 0, threshold: 14 });

      const req = createReq({ query: { threshold: "-3" } as any });
      const res = createRes();

      await getDeadlinesSummary(req, res);

      expect(mockGetSummary).toHaveBeenCalledWith(
        expect.objectContaining({ thresholdDays: 14 }),
      );
    });

    it("returns zero counts when the user has no visible tasks", async () => {
      mockGetSummary.mockResolvedValueOnce({ overdue: 0, dueSoon: 0, threshold: 14 });

      const req = createReq();
      const res = createRes();

      await getDeadlinesSummary(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { tasks: { overdue: 0, dueSoon: 0, threshold: 14 } },
      });
    });

    it("returns 500 with a translated error when the query throws", async () => {
      mockGetSummary.mockRejectedValueOnce(new Error("db down"));

      const req = createReq();
      const res = createRes();

      await getDeadlinesSummary(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        data: "db down",
      });
    });

    it("forwards the user role so admin / non-admin visibility is applied downstream", async () => {
      mockGetSummary.mockResolvedValueOnce({ overdue: 0, dueSoon: 0, threshold: 14 });

      const req = createReq({ role: "Admin" as any });
      const res = createRes();

      await getDeadlinesSummary(req, res);

      expect(mockGetSummary).toHaveBeenCalledWith(
        expect.objectContaining({ role: "Admin" }),
      );
    });
  });
});
