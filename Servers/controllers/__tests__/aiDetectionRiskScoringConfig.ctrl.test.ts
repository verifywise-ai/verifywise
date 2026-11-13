/**
 * AI Detection risk scoring config controller: how the vulnerability
 * detection toggle is stored. It is only stored as a choice while LLM
 * analysis is on, so an org that never chose keeps the "on with a key"
 * default.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../services/aiDetection.service", () => ({}));
jest.mock("../../services/aiDetection/riskScoring", () => ({
  calculateAndStoreRiskScore: jest.fn(),
}));
jest.mock("../../utils/aiDetectionRiskScoring.utils", () => ({
  getRiskScoringConfigQuery: jest.fn(),
  upsertRiskScoringConfigQuery: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: unknown, error: unknown) => (error as Error).message),
}));

import {
  getRiskScoringConfigController,
  updateRiskScoringConfigController,
} from "../aiDetection.ctrl";
import {
  getRiskScoringConfigQuery,
  upsertRiskScoringConfigQuery,
} from "../../utils/aiDetectionRiskScoring.utils";
import { createMockReq, createMockRes } from "./helpers/test-helper";

const mockGetConfig = getRiskScoringConfigQuery as jest.MockedFunction<
  typeof getRiskScoringConfigQuery
>;
const mockUpsert = upsertRiskScoringConfigQuery as jest.MockedFunction<
  typeof upsertRiskScoringConfigQuery
>;

describe("updateRiskScoringConfigController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsert.mockResolvedValue({} as never);
  });

  it("stores the vulnerability choice while LLM analysis is on", async () => {
    const req = createMockReq({
      organizationId: 5,
      body: { llm_enabled: true, llm_key_id: 2, vulnerability_scan_enabled: false },
    });
    const res = createMockRes();

    await updateRiskScoringConfigController(req as never, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpsert.mock.calls[0][0]).toBe(5);
    expect(mockUpsert.mock.calls[0][1].vulnerability_scan_enabled).toBe(false);
  });

  it("does not store the toggle while LLM analysis is off", async () => {
    const req = createMockReq({
      body: { llm_enabled: false, llm_key_id: null, vulnerability_scan_enabled: false },
    });
    const res = createMockRes();

    await updateRiskScoringConfigController(req as never, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpsert.mock.calls[0][1].vulnerability_scan_enabled).toBeUndefined();
  });

  it("uses the stored LLM setting when the request leaves it out", async () => {
    mockGetConfig.mockResolvedValue({ llm_enabled: true } as never);
    const req = createMockReq({ body: { vulnerability_scan_enabled: true } });
    const res = createMockRes();

    await updateRiskScoringConfigController(req as never, res);

    expect(mockUpsert.mock.calls[0][1].vulnerability_scan_enabled).toBe(true);
  });

  it("rejects a non-boolean toggle", async () => {
    const req = createMockReq({ body: { llm_enabled: true, vulnerability_scan_enabled: "yes" } });
    const res = createMockRes();

    await updateRiskScoringConfigController(req as never, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("getRiskScoringConfigController", () => {
  it("returns an off, not-chosen default when the org has no config", async () => {
    mockGetConfig.mockResolvedValue(null);
    const req = createMockReq();
    const res = createMockRes();

    await getRiskScoringConfigController(req as never, res);

    const body = res.json.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(body.data.vulnerability_scan_enabled).toBe(false);
    expect(body.data.vulnerability_scan_explicit).toBe(false);
  });
});
