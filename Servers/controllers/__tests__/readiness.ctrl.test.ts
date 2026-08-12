import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../advisor/scoring/readinessCalculator", () => ({
  calculateReadinessScore: jest.fn(),
  normalizeEvidenceCount: jest.fn(),
  normalizeRecency: jest.fn(),
  aggregateFrameworkScores: jest.fn(),
  blendFrameworkScore: jest.fn(),
}));

jest.mock("../../utils/readiness.utils", () => ({
  upsertControlScoreQuery: jest.fn(),
  upsertFrameworkScoreQuery: jest.fn(),
  insertReadinessHistoryQuery: jest.fn(),
  getFrameworkScoresQuery: jest.fn(),
  getFrameworkScoreByTypeQuery: jest.fn(),
  getControlScoresQuery: jest.fn(),
  getWeakestControlsQuery: jest.fn(),
  getReadinessHistoryQuery: jest.fn(),
  getApplicableControlsWithRequirementsQuery: jest.fn(),
  getAssessmentCompletionQuery: jest.fn(),
}));

jest.mock("../../middleware/aiContentTracker.middleware", () => ({
  trackAIContent: jest.fn(),
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));

import { getRecommendations } from "../readiness.ctrl";
import { getWeakestControlsQuery } from "../../utils/readiness.utils";

const mockGetWeakestControlsQuery = getWeakestControlsQuery as jest.MockedFunction<
  typeof getWeakestControlsQuery
>;

function createReq(overrides?: Partial<Request>): Partial<Request> {
  return {
    query: {},
    organizationId: 1,
    userId: 1,
    ...overrides,
  } as any;
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("readiness.ctrl - getRecommendations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not resurrect the retired task/risk columns as always-failing checks for a fully ready control", async () => {
    // Row shape as returned post-fix by getWeakestControlsQuery: no
    // task_completion_score / risk_mitigation_score columns at all, and
    // recommendations is null because calculateControlReadiness found nothing
    // to flag (a fully ready control).
    mockGetWeakestControlsQuery.mockResolvedValue([
      {
        control_id: 1,
        framework_type: "eu_ai_act",
        overall_score: 100,
        readiness_level: "ready",
        evidence_quality_score: 100,
        evidence_count_score: 100,
        evidence_recency_score: 100,
        recommendations: null,
      },
    ] as any);

    const req = createReq();
    const res = createRes();

    await getRecommendations(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.data).toEqual([
      {
        control_id: 1,
        framework_type: "eu_ai_act",
        overall_score: 100,
        readiness_level: "ready",
        priority: "medium",
        recommendations: ["Maintain current posture"],
      },
    ]);
    // The regression this guards: these must never appear, since nothing
    // populates task_completion_score / risk_mitigation_score anymore.
    expect(payload.data[0].recommendations).not.toContain("Complete pending tasks");
    expect(payload.data[0].recommendations).not.toContain("Address unmitigated risks");
  });

  it("still surfaces evidence-based recommendations when a real dimension is weak", async () => {
    mockGetWeakestControlsQuery.mockResolvedValue([
      {
        control_id: 2,
        framework_type: "iso_42001",
        overall_score: 40,
        readiness_level: "at_risk",
        evidence_quality_score: 20,
        evidence_count_score: 10,
        evidence_recency_score: 10,
        recommendations: null,
      },
    ] as any);

    const req = createReq();
    const res = createRes();

    await getRecommendations(req as Request, res as Response);

    const payload = res.json.mock.calls[0][0];
    expect(payload.data[0].recommendations).toEqual([
      "Upload evidence documents",
      "Improve evidence quality",
      "Update outdated evidence",
    ]);
  });

  it("prefers the persisted per-control recommendations when present", async () => {
    mockGetWeakestControlsQuery.mockResolvedValue([
      {
        control_id: 3,
        framework_type: "eu_ai_act",
        overall_score: 70,
        readiness_level: "needs_work",
        evidence_quality_score: 100,
        evidence_count_score: 100,
        evidence_recency_score: 100,
        recommendations: JSON.stringify(["Complete the remaining requirements for this control"]),
      },
    ] as any);

    const req = createReq();
    const res = createRes();

    await getRecommendations(req as Request, res as Response);

    const payload = res.json.mock.calls[0][0];
    expect(payload.data[0].recommendations).toEqual([
      "Complete the remaining requirements for this control",
    ]);
  });
});
