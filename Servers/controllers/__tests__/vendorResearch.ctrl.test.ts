import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../utils/vendor.utils", () => ({ getVendorByIdQuery: jest.fn() }));
jest.mock("../../utils/llmKey.utils", () => ({ getLLMKeysQuery: jest.fn() }));
jest.mock("../../utils/vendorResearch.utils", () => ({
  STALE_RUN_MINUTES: 15,
  failStaleRunsQuery: jest.fn(),
  getDecisionCountsQuery: jest.fn(),
  getLatestRunQuery: jest.fn(),
  getRunTraceQuery: jest.fn(),
  getVendorResearchSettingsQuery: jest.fn(),
  listFindingsQuery: jest.fn(),
}));
// The real module opens a BullMQ queue when it is loaded.
jest.mock("../../services/vendorResearch/trigger", () => ({ startVendorResearch: jest.fn() }));
jest.mock("../../services/vendorResearch/settings.service", () => ({
  saveVendorResearchSettings: jest.fn(),
}));
// The real service loads the create service, which loads the same queue.
jest.mock("../../services/vendorResearch/findings.service", () => ({
  acceptFinding: jest.fn(),
  dismissFinding: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  logFailure: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: unknown, err: unknown) => (err as Error).message),
}));

import {
  acceptVendorRiskFinding,
  dismissVendorRiskFinding,
  getDecisionStats,
  getLatestVendorResearch,
  getResearchConfig,
  getResearchSettings,
  getVendorResearchRunTrace,
  listVendorRiskFindings,
  saveResearchSettings,
  startVendorResearchRun,
} from "../vendorResearch.ctrl";
import { getVendorByIdQuery } from "../../utils/vendor.utils";
import { getLLMKeysQuery } from "../../utils/llmKey.utils";
import {
  failStaleRunsQuery,
  getDecisionCountsQuery,
  getLatestRunQuery,
  getRunTraceQuery,
  getVendorResearchSettingsQuery,
  listFindingsQuery,
} from "../../utils/vendorResearch.utils";
import { saveVendorResearchSettings } from "../../services/vendorResearch/settings.service";
import { createTraceRecorder } from "../../services/vendorResearch/trace";
import { startVendorResearch } from "../../services/vendorResearch/trigger";
import { acceptFinding, dismissFinding } from "../../services/vendorResearch/findings.service";
import {
  ConflictException,
  DatabaseException,
  NotFoundException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";
import {
  DISMISS_REASONS,
  IVendorResearchRun,
  IVendorRiskFinding,
} from "../../domain.layer/interfaces/i.vendorResearch";
import type { VendorRiskModel } from "../../domain.layer/models/vendorRisk/vendorRisk.model";

const mockGetVendorByIdQuery = getVendorByIdQuery as jest.MockedFunction<typeof getVendorByIdQuery>;
const mockGetLLMKeysQuery = getLLMKeysQuery as jest.MockedFunction<typeof getLLMKeysQuery>;
const mockFailStaleRunsQuery = failStaleRunsQuery as jest.MockedFunction<typeof failStaleRunsQuery>;
const mockGetLatestRunQuery = getLatestRunQuery as jest.MockedFunction<typeof getLatestRunQuery>;
const mockGetRunTraceQuery = getRunTraceQuery as jest.MockedFunction<typeof getRunTraceQuery>;
const mockGetDecisionCountsQuery = getDecisionCountsQuery as jest.MockedFunction<
  typeof getDecisionCountsQuery
>;
const mockListFindingsQuery = listFindingsQuery as jest.MockedFunction<typeof listFindingsQuery>;
const mockGetSettingsQuery = getVendorResearchSettingsQuery as jest.MockedFunction<
  typeof getVendorResearchSettingsQuery
>;
const mockSaveSettings = saveVendorResearchSettings as jest.MockedFunction<
  typeof saveVendorResearchSettings
>;
const mockStartVendorResearch = startVendorResearch as jest.MockedFunction<
  typeof startVendorResearch
>;
const mockAcceptFinding = acceptFinding as jest.MockedFunction<typeof acceptFinding>;
const mockDismissFinding = dismissFinding as jest.MockedFunction<typeof dismissFinding>;

const ORG = 1;
const USER = 5;
const VENDOR = 7;
const FINDING_ID = 11;
const RISK_ID = 42;

/** Values that must never appear in a response: everything on the run row outside the allowlist. */
const EVIDENCE_SENTINEL = "EVIDENCE-SENTINEL-4f2a";
const MODEL_SENTINEL = "model-sentinel-91b0";
const PROMPT_SENTINEL = "prompt-version-sentinel-c37d";

const RUN: IVendorResearchRun = {
  id: 11,
  organization_id: ORG,
  vendor_id: VENDOR,
  trigger_type: "manual",
  status: "completed",
  categories: ["security_incidents"],
  category_summary: [{ category: "security_incidents", outcome: "findings", note: "1 finding." }],
  evidence: [
    {
      id: "S1",
      category: "security_incidents",
      kind: "result",
      onVendorSite: false,
      url: "https://example.com/breach",
      title: "Breach",
      content: EVIDENCE_SENTINEL,
      publishedAt: null,
    },
  ],
  model: MODEL_SENTINEL,
  prompt_version: PROMPT_SENTINEL,
  searches_used: 5,
  pages_read: 3,
  duplicates_dropped: 2,
  error: null,
  progress: null,
  requested_by: USER,
  created_at: new Date("2026-10-10T10:00:00Z"),
  started_at: new Date("2026-10-10T10:00:05Z"),
  finished_at: new Date("2026-10-10T10:00:40Z"),
};

/** The only fields a run response may carry. */
const RUN_RESPONSE_FIELDS = [
  "id",
  "vendor_id",
  "status",
  "trigger_type",
  "categories",
  "category_summary",
  "coverage",
  "searches_used",
  "pages_read",
  "duplicates_dropped",
  "error",
  "progress",
  "started_at",
  "finished_at",
  "created_at",
].sort();

const SENTINELS = [EVIDENCE_SENTINEL, MODEL_SENTINEL, PROMPT_SENTINEL];

/**
 * Ids in a path (of a vendor or of a finding) that every route that takes one must refuse before
 * it looks anything up. 309 nines are more than the largest float: Number() turns them into
 * Infinity, which is greater than zero.
 */
const BAD_IDS: Array<[string, string | string[]]> = [
  ["not a number", "abc"],
  ["a fraction", "1.5"],
  ["zero", "0"],
  ["negative", "-3"],
  ["a number followed by text", "7abc"],
  ["empty", ""],
  ["in exponent notation", "1e3"],
  ["309 digits long", "9".repeat(309)],
  ["given as a list", ["5"]],
];

const FINDING: IVendorRiskFinding = {
  id: FINDING_ID,
  organization_id: ORG,
  vendor_id: VENDOR,
  run_id: 3,
  category: "security_incidents",
  risk_description: "Customer records were exposed in a 2026 breach.",
  impact_description: "Personal data we share with the vendor may have been accessed.",
  action_plan: "Ask the vendor for the incident report and confirm remediation.",
  likelihood: "Possible",
  risk_severity: "Major",
  risk_level: "High Risk",
  confidence: "medium",
  rationale: null,
  sources: [],
  snippet_only: false,
  status: "pending",
  dismissed_reason: null,
  dismissed_note: null,
  accepted_vendor_risk_id: null,
  decided_by: null,
  decided_at: null,
  created_at: new Date("2026-10-10T10:00:00Z"),
};
const ACCEPTED_FINDING: IVendorRiskFinding = {
  ...FINDING,
  status: "accepted",
  accepted_vendor_risk_id: RISK_ID,
  decided_by: USER,
  decided_at: new Date("2026-10-10T11:00:00Z"),
};
const DISMISSED_FINDING: IVendorRiskFinding = {
  ...FINDING,
  status: "dismissed",
  dismissed_reason: "other",
  dismissed_note: "Not relevant.",
  decided_by: USER,
  decided_at: new Date("2026-10-10T11:00:00Z"),
};
const CREATED_RISK = {
  id: RISK_ID,
  vendor_id: VENDOR,
  risk_description: FINDING.risk_description,
  risk_level: "High Risk",
} as unknown as VendorRiskModel;

function createMockReq(partial: Record<string, unknown> = {}): Request {
  return {
    organizationId: ORG,
    userId: USER,
    params: { id: String(VENDOR) },
    query: {},
    t: (key: string) => key,
    ...partial,
  } as unknown as Request;
}

type MockRes = Response & {
  status: jest.Mock;
  json: jest.Mock;
  set: jest.Mock;
};

function createMockRes(): MockRes {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

/** The body the handler sent. */
const bodyOf = (res: MockRes) => res.json.mock.calls[0][0] as any;

/** Everything the handler sent, as one string: headers set and body. */
const sentOf = (res: MockRes) => JSON.stringify([res.set.mock.calls, res.json.mock.calls]);

const expectNoRunInternals = (res: MockRes) => {
  const sent = sentOf(res);
  for (const sentinel of SENTINELS) expect(sent).not.toContain(sentinel);
  expect(sent).not.toContain("evidence");
};

const ENV_KEYS = ["VENDOR_RESEARCH_AUTO_RUN"] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  jest.clearAllMocks();
  // A developer's own settings must not decide what these tests see.
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];

  mockGetVendorByIdQuery.mockResolvedValue({ id: VENDOR } as any);
  mockGetLLMKeysQuery.mockResolvedValue([] as any);
  mockFailStaleRunsQuery.mockResolvedValue(0);
  mockGetLatestRunQuery.mockResolvedValue(null);
  mockGetRunTraceQuery.mockResolvedValue(null);
  mockGetDecisionCountsQuery.mockResolvedValue([]);
  mockGetSettingsQuery.mockResolvedValue({
    researchKeyId: null,
    analysisKeyId: null,
    scanIntervalDays: null,
  });
  mockSaveSettings.mockResolvedValue({
    ok: true,
    settings: { researchKeyId: null, analysisKeyId: null, scanIntervalDays: null },
  });
  mockListFindingsQuery.mockResolvedValue({ rows: [], total: 0 });
  mockStartVendorResearch.mockResolvedValue({ ok: true, run: RUN, alreadyRunning: false });
  mockAcceptFinding.mockResolvedValue({ finding: ACCEPTED_FINDING, vendorRisk: CREATED_RISK });
  mockDismissFinding.mockResolvedValue(DISMISSED_FINDING);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("startVendorResearchRun", () => {
  it("answers 202 with the run and alreadyRunning, and starts a manual run for the caller", async () => {
    const res = createMockRes();

    await startVendorResearchRun(createMockReq(), res);

    expect(mockGetVendorByIdQuery).toHaveBeenCalledWith(VENDOR, ORG);
    expect(mockStartVendorResearch).toHaveBeenCalledWith({
      organizationId: ORG,
      vendorId: VENDOR,
      triggerType: "manual",
      requestedBy: USER,
    });
    expect(res.status).toHaveBeenCalledWith(202);
    const body = bodyOf(res);
    expect(body.message).toBe("Accepted");
    expect(body.data.alreadyRunning).toBe(false);
    expect(Object.keys(body.data).sort()).toEqual(["alreadyRunning", "run"]);
    expect(body.data.run).toMatchObject({ id: RUN.id, vendor_id: VENDOR, status: "completed" });
  });

  it("returns only the allowlisted fields of the run, never its evidence", async () => {
    for (const alreadyRunning of [false, true]) {
      mockStartVendorResearch.mockResolvedValue({ ok: true, run: RUN, alreadyRunning });
      const res = createMockRes();

      await startVendorResearchRun(createMockReq(), res);

      expect(res.status).toHaveBeenCalledWith(202);
      expect(bodyOf(res).data.alreadyRunning).toBe(alreadyRunning);
      expect(Object.keys(bodyOf(res).data.run).sort()).toEqual(RUN_RESPONSE_FIELDS);
      expect(bodyOf(res).data.run).toMatchObject({ searches_used: 5, pages_read: 3 });
      expectNoRunInternals(res);
    }
  });

  it.each(BAD_IDS)(
    "answers 400 for a vendor id that is %s, and looks up and starts nothing",
    async (_name, id) => {
      const res = createMockRes();

      await startVendorResearchRun(createMockReq({ params: { id } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockGetVendorByIdQuery).not.toHaveBeenCalled();
      expect(mockStartVendorResearch).not.toHaveBeenCalled();
    },
  );

  it("answers 404 for a vendor that is not in the organization and starts nothing", async () => {
    mockGetVendorByIdQuery.mockResolvedValue(null);
    const res = createMockRes();

    await startVendorResearchRun(createMockReq(), res);

    expect(mockGetVendorByIdQuery).toHaveBeenCalledWith(VENDOR, ORG);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockStartVendorResearch).not.toHaveBeenCalled();
  });

  it("answers 404 when the vendor disappears before the run starts", async () => {
    mockStartVendorResearch.mockResolvedValue({ ok: false, error: { code: "vendor_not_found" } });
    const res = createMockRes();

    await startVendorResearchRun(createMockReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("answers 409 with the code llm_key_missing in data", async () => {
    mockStartVendorResearch.mockResolvedValue({ ok: false, error: { code: "llm_key_missing" } });
    const res = createMockRes();

    await startVendorResearchRun(createMockReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(bodyOf(res)).toEqual({ message: "Conflict", data: { code: "llm_key_missing" } });
  });

  it("answers 429 for a cooldown, with Retry-After and retryAfterSeconds equal to the seconds left", async () => {
    mockStartVendorResearch.mockResolvedValue({
      ok: false,
      error: { code: "cooldown", retryAfterSeconds: 342 },
    });
    const res = createMockRes();

    await startVendorResearchRun(createMockReq(), res);

    expect(res.set).toHaveBeenCalledWith("Retry-After", "342");
    expect(res.status).toHaveBeenCalledWith(429);
    expect(bodyOf(res)).toEqual({
      message: "Too Many Requests",
      data: { code: "cooldown", retryAfterSeconds: 342 },
    });
  });

  it("answers 429 with the code daily_cap and no Retry-After", async () => {
    mockStartVendorResearch.mockResolvedValue({ ok: false, error: { code: "daily_cap" } });
    const res = createMockRes();

    await startVendorResearchRun(createMockReq(), res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(bodyOf(res)).toEqual({ message: "Too Many Requests", data: { code: "daily_cap" } });
    expect(res.set).not.toHaveBeenCalled();
  });

  it("answers 503 with a message that trying again is safe when the job could not be queued", async () => {
    mockStartVendorResearch.mockResolvedValue({ ok: false, error: { code: "enqueue_failed" } });
    const res = createMockRes();

    await startVendorResearchRun(createMockReq(), res);

    expect(res.status).toHaveBeenCalledWith(503);
    // STATUS_CODE[503] carries its payload under `error`, not `data`.
    const body = bodyOf(res);
    expect(body.message).toBe("Service Unavailable");
    expect(body.error).toMatch(/safe to try again/i);
  });

  it("answers 500 when a query throws", async () => {
    mockStartVendorResearch.mockRejectedValue(new Error("DB failure"));
    const res = createMockRes();

    await startVendorResearchRun(createMockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(bodyOf(res)).toEqual({ message: "Internal Server Error", error: "DB failure" });
  });
});

describe("getLatestVendorResearch", () => {
  it.each(BAD_IDS)(
    "answers 400 for a vendor id that is %s, and looks up and reads nothing",
    async (_name, id) => {
      const res = createMockRes();

      await getLatestVendorResearch(createMockReq({ params: { id } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockGetVendorByIdQuery).not.toHaveBeenCalled();
      expect(mockFailStaleRunsQuery).not.toHaveBeenCalled();
      expect(mockGetLatestRunQuery).not.toHaveBeenCalled();
    },
  );

  it("answers 404 for a vendor that is not in the organization, without touching its runs", async () => {
    mockGetVendorByIdQuery.mockResolvedValue(null);
    const res = createMockRes();

    await getLatestVendorResearch(createMockReq(), res);

    expect(mockGetVendorByIdQuery).toHaveBeenCalledWith(VENDOR, ORG);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockFailStaleRunsQuery).not.toHaveBeenCalled();
    expect(mockGetLatestRunQuery).not.toHaveBeenCalled();
  });

  it("fails the stale runs of the vendor before it reads the latest run, and returns the run without its evidence", async () => {
    mockGetLatestRunQuery.mockResolvedValue(RUN);
    const res = createMockRes();

    await getLatestVendorResearch(createMockReq(), res);

    expect(mockFailStaleRunsQuery).toHaveBeenCalledWith(ORG, VENDOR, 15);
    expect(mockGetLatestRunQuery).toHaveBeenCalledWith(ORG, VENDOR);
    expect(mockFailStaleRunsQuery.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetLatestRunQuery.mock.invocationCallOrder[0],
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const body = bodyOf(res);
    expect(Object.keys(body.data).sort()).toEqual(RUN_RESPONSE_FIELDS);
    expect(body.data).toMatchObject({
      id: RUN.id,
      vendor_id: VENDOR,
      status: "completed",
      trigger_type: "manual",
      categories: RUN.categories,
      category_summary: RUN.category_summary,
      searches_used: 5,
      pages_read: 3,
      duplicates_dropped: 2,
      error: null,
    });
    expectNoRunInternals(res);
  });

  it("returns where a running run is, which every role may read", async () => {
    const progress = {
      phase: "researching" as const,
      steps: 3,
      action: "read" as const,
      category: "certifications" as const,
      searchesUsed: 2,
      pagesRead: 1,
      categories: ["security_incidents" as const, "certifications" as const],
      updatedAt: "2026-10-10T10:00:20.000Z",
    };
    mockGetLatestRunQuery.mockResolvedValue({
      ...RUN,
      status: "running",
      finished_at: null,
      progress,
    });
    const res = createMockRes();

    await getLatestVendorResearch(createMockReq(), res);

    expect(bodyOf(res).data.progress).toEqual(progress);
    expectNoRunInternals(res);
  });

  it("answers 200 with null for a vendor that was never researched", async () => {
    const res = createMockRes();

    await getLatestVendorResearch(createMockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(bodyOf(res)).toEqual({ message: "OK", data: null });
  });

  it("answers 500 when a query throws", async () => {
    mockGetLatestRunQuery.mockRejectedValue(new Error("DB failure"));
    const res = createMockRes();

    await getLatestVendorResearch(createMockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getVendorResearchRunTrace", () => {
  const RUN_ID = 11;
  const traceReq = (params: Record<string, unknown> = {}) =>
    createMockReq({ params: { id: String(VENDOR), runId: String(RUN_ID), ...params } });
  const TRACE = (() => {
    const recorder = createTraceRecorder();
    recorder.step({ tool: "search", outcome: "ok", query: "Acme breach", results: 4 });
    return recorder.snapshot();
  })();

  it.each(BAD_IDS)(
    "answers 400 for a vendor id that is %s, and looks up nothing",
    async (_name, id) => {
      const res = createMockRes();

      await getVendorResearchRunTrace(traceReq({ id }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockGetVendorByIdQuery).not.toHaveBeenCalled();
      expect(mockGetRunTraceQuery).not.toHaveBeenCalled();
    },
  );

  it.each(BAD_IDS)(
    "answers 400 for a run id that is %s, and looks up nothing",
    async (_name, runId) => {
      const res = createMockRes();

      await getVendorResearchRunTrace(traceReq({ runId }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockGetVendorByIdQuery).not.toHaveBeenCalled();
      expect(mockGetRunTraceQuery).not.toHaveBeenCalled();
    },
  );

  it("answers 404 for a vendor that is not in the organization, without reading a trace", async () => {
    mockGetVendorByIdQuery.mockResolvedValue(null);
    const res = createMockRes();

    await getVendorResearchRunTrace(traceReq(), res);

    expect(mockGetVendorByIdQuery).toHaveBeenCalledWith(VENDOR, ORG);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockGetRunTraceQuery).not.toHaveBeenCalled();
  });

  it("answers 404 for a run that has no trace: unknown, another vendor's, unfinished or old", async () => {
    mockGetRunTraceQuery.mockResolvedValue(null);
    const res = createMockRes();

    await getVendorResearchRunTrace(traceReq(), res);

    expect(mockGetRunTraceQuery).toHaveBeenCalledWith(ORG, VENDOR, RUN_ID);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(bodyOf(res).data).toBe("Research trace not found");
  });

  it("answers 200 with the trace of the run", async () => {
    mockGetRunTraceQuery.mockResolvedValue(TRACE);
    const res = createMockRes();

    await getVendorResearchRunTrace(traceReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(bodyOf(res).data).toEqual(TRACE);
  });

  it("answers 500 when a query throws", async () => {
    mockGetRunTraceQuery.mockRejectedValue(new Error("DB failure"));
    const res = createMockRes();

    await getVendorResearchRunTrace(traceReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getDecisionStats", () => {
  it("answers 200 with the decisions folded by prompt version and by category", async () => {
    mockGetDecisionCountsQuery.mockResolvedValue([
      {
        prompt_version: "vr-2",
        category: "security_incidents",
        status: "accepted",
        dismissed_reason: null,
        count: 3,
      },
      {
        prompt_version: "vr-2",
        category: "security_incidents",
        status: "dismissed",
        dismissed_reason: "wrong_vendor",
        count: 1,
      },
    ]);
    const res = createMockRes();

    await getDecisionStats(createMockReq({ params: {} }), res);

    expect(mockGetDecisionCountsQuery).toHaveBeenCalledWith(ORG);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(bodyOf(res).data).toEqual({
      byPromptVersion: [
        {
          promptVersion: "vr-2",
          pending: 0,
          accepted: 3,
          dismissed: 1,
          acceptanceRate: 0.75,
          dismissedByReason: { wrong_vendor: 1 },
        },
      ],
      byCategory: [
        {
          promptVersion: "vr-2",
          category: "security_incidents",
          pending: 0,
          accepted: 3,
          dismissed: 1,
          acceptanceRate: 0.75,
          dismissedByReason: { wrong_vendor: 1 },
        },
      ],
    });
  });

  it("answers 200 with empty lists when nothing was decided", async () => {
    const res = createMockRes();

    await getDecisionStats(createMockReq({ params: {} }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(bodyOf(res).data).toEqual({ byPromptVersion: [], byCategory: [] });
  });

  it("answers 500 when the query throws", async () => {
    mockGetDecisionCountsQuery.mockRejectedValue(new Error("DB failure"));
    const res = createMockRes();

    await getDecisionStats(createMockReq({ params: {} }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getResearchConfig", () => {
  it("answers whether an LLM key is set up and whether research starts by itself", async () => {
    mockGetLLMKeysQuery.mockResolvedValue([
      { id: 3, name: "OpenAI", key: "sk-SENTINEL-2d9b" },
    ] as any);
    const res = createMockRes();

    await getResearchConfig(createMockReq(), res);

    expect(mockGetLLMKeysQuery).toHaveBeenCalledWith(ORG);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(bodyOf(res)).toEqual({
      message: "OK",
      data: { hasLlmKey: true, autoRunEnabled: true },
    });
    // The key of the organization is not in anything that was sent.
    expect(sentOf(res)).not.toContain("sk-SENTINEL-2d9b");
  });

  it("answers false for what is not set up", async () => {
    process.env.VENDOR_RESEARCH_AUTO_RUN = "false";
    const res = createMockRes();

    await getResearchConfig(createMockReq(), res);

    expect(bodyOf(res).data).toEqual({ hasLlmKey: false, autoRunEnabled: false });
  });

  it("answers 500 when the query throws", async () => {
    mockGetLLMKeysQuery.mockRejectedValue(new Error("DB failure"));
    const res = createMockRes();

    await getResearchConfig(createMockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getResearchSettings", () => {
  it("answers which keys the organization chose, by id", async () => {
    mockGetSettingsQuery.mockResolvedValue({
      researchKeyId: 4,
      analysisKeyId: 9,
      scanIntervalDays: 14,
    });
    const res = createMockRes();

    await getResearchSettings(createMockReq(), res);

    expect(mockGetSettingsQuery).toHaveBeenCalledWith(ORG);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(bodyOf(res)).toEqual({
      message: "OK",
      data: { researchKeyId: 4, analysisKeyId: 9, scanIntervalDays: 14 },
    });
  });

  it("answers null for a choice that was not made", async () => {
    const res = createMockRes();

    await getResearchSettings(createMockReq(), res);

    expect(bodyOf(res).data).toEqual({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
  });

  it("answers 500 when the query throws", async () => {
    mockGetSettingsQuery.mockRejectedValue(new Error("DB failure"));
    const res = createMockRes();

    await getResearchSettings(createMockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("saveResearchSettings", () => {
  const putReq = (body: unknown) => createMockReq({ body });

  it("saves the two choices for the organization, as the user who made them", async () => {
    mockSaveSettings.mockResolvedValue({
      ok: true,
      settings: { researchKeyId: 4, analysisKeyId: 9, scanIntervalDays: null },
    });
    const res = createMockRes();

    await saveResearchSettings(putReq({ researchKeyId: 4, analysisKeyId: 9 }), res);

    expect(mockSaveSettings).toHaveBeenCalledWith({
      organizationId: ORG,
      userId: USER,
      researchKeyId: 4,
      analysisKeyId: 9,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(bodyOf(res)).toEqual({
      message: "OK",
      data: { researchKeyId: 4, analysisKeyId: 9, scanIntervalDays: null },
    });
  });

  it("takes null for a choice that is given back to the default", async () => {
    const res = createMockRes();

    await saveResearchSettings(putReq({ researchKeyId: null, analysisKeyId: null }), res);

    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ researchKeyId: null, analysisKeyId: null }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  describe("how often the scan researches a vendor again", () => {
    const savedWith = (scanIntervalDays: number | null) =>
      mockSaveSettings.mockResolvedValue({
        ok: true,
        settings: { researchKeyId: null, analysisKeyId: null, scanIntervalDays },
      });

    it.each([7, 14, 30])(
      "passes %i days on to the save, and answers what was saved",
      async (days) => {
        savedWith(days);
        const res = createMockRes();

        await saveResearchSettings(
          putReq({ researchKeyId: null, analysisKeyId: null, scanIntervalDays: days }),
          res,
        );

        expect(mockSaveSettings).toHaveBeenCalledWith(
          expect.objectContaining({ organizationId: ORG, userId: USER, scanIntervalDays: days }),
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(bodyOf(res).data).toEqual({
          researchKeyId: null,
          analysisKeyId: null,
          scanIntervalDays: days,
        });
      },
    );

    it("passes null on as null: the scan is off", async () => {
      const res = createMockRes();

      await saveResearchSettings(
        putReq({ researchKeyId: null, analysisKeyId: null, scanIntervalDays: null }),
        res,
      );

      expect(mockSaveSettings.mock.calls[0][0].scanIntervalDays).toBeNull();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    // A page that was loaded before the setting existed names the keys and nothing else.
    it("passes nothing on when the body does not name it, so that the save keeps what is there", async () => {
      const res = createMockRes();

      await saveResearchSettings(putReq({ researchKeyId: null, analysisKeyId: null }), res);

      expect(mockSaveSettings.mock.calls[0][0].scanIntervalDays).toBeUndefined();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it.each([
      ["a number of days that is not offered", 5],
      ["a number that is too big", 31],
      ["zero", 0],
      ["a negative number", -7],
      ["a fraction", 7.5],
      ["text", "7"],
      ["a boolean", true],
      ["a list", [7]],
      ["an object", { days: 7 }],
    ])("refuses %s with 400, before it asks anything", async (_label, value) => {
      const res = createMockRes();

      await saveResearchSettings(
        putReq({ researchKeyId: null, analysisKeyId: null, scanIntervalDays: value }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockSaveSettings).not.toHaveBeenCalled();
    });
  });

  it.each([
    ["no body", undefined],
    ["a body that is not an object", "4"],
    ["an array", [4, 9]],
    ["no research key", { analysisKeyId: null }],
    ["no analysis key", { researchKeyId: null }],
    ["a key id as text", { researchKeyId: "4", analysisKeyId: null }],
    ["a key id of zero", { researchKeyId: 0, analysisKeyId: null }],
    ["a negative key id", { researchKeyId: null, analysisKeyId: -3 }],
    ["a key id with a fraction", { researchKeyId: 1.5, analysisKeyId: null }],
    ["a key id that is a boolean", { researchKeyId: true, analysisKeyId: null }],
    ["a key id that is a list", { researchKeyId: [4], analysisKeyId: null }],
    ["a key id beyond the safe integers", { researchKeyId: 2 ** 60, analysisKeyId: null }],
    [
      "a key id that is not finite",
      JSON.parse(`{"researchKeyId": ${"9".repeat(309)}, "analysisKeyId": null}`),
    ],
  ])("refuses %s with 400, before it asks anything", async (_label, body) => {
    const res = createMockRes();

    await saveResearchSettings(putReq(body), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  it("answers 404 when a key is not one of the organization's", async () => {
    mockSaveSettings.mockResolvedValue({ ok: false, reason: "unknown_key" });
    const res = createMockRes();

    await saveResearchSettings(putReq({ researchKeyId: 99, analysisKeyId: null }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(bodyOf(res).data).toBe("LLM key not found");
  });

  it("answers 500 when the save throws, and says nothing of the error", async () => {
    mockSaveSettings.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.9:5432"));
    const res = createMockRes();

    await saveResearchSettings(putReq({ researchKeyId: 4, analysisKeyId: null }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("listVendorRiskFindings", () => {
  it("lists the pending findings of the organization, 50 at a time, by default", async () => {
    const page = { rows: [{ id: 1, vendor_name: "Acme" }], total: 1 };
    mockListFindingsQuery.mockResolvedValue(page as any);
    const res = createMockRes();

    await listVendorRiskFindings(createMockReq(), res);

    expect(mockListFindingsQuery).toHaveBeenCalledWith(ORG, {
      status: "pending",
      vendorId: undefined,
      limit: 50,
      offset: 0,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(bodyOf(res)).toEqual({
      message: "OK",
      data: { rows: [{ id: 1, vendor_name: "Acme", credibility_rationale: null }], total: 1 },
    });
  });

  it("passes the filters and the page through", async () => {
    const res = createMockRes();

    await listVendorRiskFindings(
      createMockReq({ query: { status: "dismissed", vendorId: "7", limit: "20", offset: "40" } }),
      res,
    );

    expect(mockListFindingsQuery).toHaveBeenCalledWith(ORG, {
      status: "dismissed",
      vendorId: 7,
      limit: 20,
      offset: 40,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("clamps the limit to 200", async () => {
    const res = createMockRes();

    await listVendorRiskFindings(createMockReq({ query: { limit: "5000" } }), res);

    expect(mockListFindingsQuery).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({ limit: 200 }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it.each([
    ["an unknown status", { status: "open" }],
    ["an empty status", { status: "" }],
    ["a status given twice", { status: ["pending", "accepted"] }],
    ...BAD_IDS.map(([name, vendorId]): [string, { vendorId: string | string[] }] => [
      `a vendor id that is ${name}`,
      { vendorId },
    ]),
    ["a vendor id given twice", { vendorId: ["1", "2"] }],
    ["a limit that is not a number", { limit: "many" }],
    ["a limit of zero", { limit: "0" }],
    ["a negative limit", { limit: "-5" }],
    ["a limit with a fraction", { limit: "2.5" }],
    ["a limit given twice", { limit: ["10", "20"] }],
    ["an offset that is not a number", { offset: "next" }],
    ["a negative offset", { offset: "-1" }],
    ["an offset with a fraction", { offset: "0.5" }],
    ["an offset too large for the database", { offset: "99999999999999999999" }],
    ["an offset given twice", { offset: ["10", "20"] }],
  ])("answers 400 for %s", async (_name, query) => {
    const res = createMockRes();

    await listVendorRiskFindings(createMockReq({ query }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockListFindingsQuery).not.toHaveBeenCalled();
  });

  it("answers 500 when the query throws", async () => {
    mockListFindingsQuery.mockRejectedValue(new Error("DB failure"));
    const res = createMockRes();

    await listVendorRiskFindings(createMockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

/**
 * What the service refuses with, and what the caller sees: the status says what is wrong and the
 * body is the codebase's usual message, with no `code` field.
 */
const REFUSALS: Array<[string, Error, number, Record<string, unknown>]> = [
  [
    "a finding that is not in the organization",
    new NotFoundException("Finding not found"),
    404,
    { message: "Not Found", data: "Finding not found" },
  ],
  [
    "a finding that was decided already",
    new ConflictException("This finding has already been accepted or dismissed"),
    409,
    { message: "Conflict", data: "This finding has already been accepted or dismissed" },
  ],
  [
    "a value the service does not accept",
    new ValidationException("The action owner must be a user of your organization"),
    400,
    { message: "Bad Request", data: "The action owner must be a user of your organization" },
  ],
  [
    "a risk that the register did not store",
    new DatabaseException("The risk could not be added to the vendor risk register"),
    500,
    {
      message: "Internal Server Error",
      error: "The risk could not be added to the vendor risk register",
    },
  ],
  [
    "an unexpected error",
    new Error("DB failure"),
    500,
    { message: "Internal Server Error", error: "DB failure" },
  ],
];

describe("acceptVendorRiskFinding", () => {
  const acceptReq = (
    body?: unknown,
    params: Record<string, unknown> = { id: String(FINDING_ID) },
  ) => createMockReq({ params, body });

  it("answers 200 with the finding and the vendor risk it became", async () => {
    const res = createMockRes();

    await acceptVendorRiskFinding(acceptReq({}), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(bodyOf(res)).toEqual({
      message: "OK",
      data: {
        finding: { ...ACCEPTED_FINDING, credibility_rationale: null },
        vendorRisk: CREATED_RISK,
      },
    });
  });

  it("accepts the finding for the caller in the caller's organization, whatever the body says", async () => {
    const res = createMockRes();

    await acceptVendorRiskFinding(
      acceptReq({ organizationId: 99, userId: 99, findingId: 99, id: 99 }),
      res,
    );

    expect(mockAcceptFinding).toHaveBeenCalledTimes(1);
    expect(mockAcceptFinding).toHaveBeenCalledWith({
      organizationId: ORG,
      findingId: FINDING_ID,
      userId: USER,
      edits: {},
    });
    expect(mockAcceptFinding.mock.calls[0][0].actionOwner).toBeUndefined();
  });

  describe("the edits of the person accepting", () => {
    const EDITS = {
      risk_description: "A clearer description",
      impact_description: "Customers could be affected",
      action_plan: "Review the controls every quarter",
      likelihood: "Almost certain",
      risk_severity: "Minor",
      risk_level: "High risk",
      frameworks: [3, 4],
    };

    it("hands the service the fields it may edit, and nothing else from the body", async () => {
      const res = createMockRes();

      await acceptVendorRiskFinding(
        acceptReq({
          ...EDITS,
          action_owner: 12,
          // The finding decides the vendor and its own state; none of these is an edit.
          vendor_id: 99,
          status: "dismissed",
          accepted_vendor_risk_id: 5,
          organization_id: 99,
        }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockAcceptFinding).toHaveBeenCalledWith({
        organizationId: ORG,
        findingId: FINDING_ID,
        userId: USER,
        actionOwner: 12,
        edits: EDITS,
      });
      expect(Object.keys(mockAcceptFinding.mock.calls[0][0].edits ?? {}).sort()).toEqual(
        Object.keys(EDITS).sort(),
      );
    });

    it("hands the service only the fields that were sent", async () => {
      const res = createMockRes();

      await acceptVendorRiskFinding(acceptReq({ action_plan: "Another plan" }), res);

      expect(mockAcceptFinding.mock.calls[0][0].edits).toStrictEqual({
        action_plan: "Another plan",
      });
    });

    it("leaves a value it cannot judge to the service, null included", async () => {
      const res = createMockRes();

      await acceptVendorRiskFinding(acceptReq({ risk_description: null, frameworks: "3" }), res);

      expect(mockAcceptFinding.mock.calls[0][0].edits).toStrictEqual({
        risk_description: null,
        frameworks: "3",
      });
    });

    it("answers 400 with the service's message for an edit it refuses", async () => {
      mockAcceptFinding.mockRejectedValue(
        new ValidationException("The risk description must be 1 to 500 characters"),
      );
      const res = createMockRes();

      await acceptVendorRiskFinding(acceptReq({ risk_description: "" }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(bodyOf(res)).toEqual({
        message: "Bad Request",
        data: "The risk description must be 1 to 500 characters",
      });
    });
  });

  it.each<[string, unknown]>([
    ["no body", undefined],
    ["an empty body", {}],
  ])("leaves the action owner to the service when there is %s", async (_name, body) => {
    const res = createMockRes();

    await acceptVendorRiskFinding(acceptReq(body), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockAcceptFinding.mock.calls[0][0].actionOwner).toBeUndefined();
  });

  it("passes an explicit null on as no action owner", async () => {
    const res = createMockRes();

    await acceptVendorRiskFinding(acceptReq({ action_owner: null }), res);

    expect(mockAcceptFinding).toHaveBeenCalledWith(expect.objectContaining({ actionOwner: null }));
  });

  it("passes a user id on as the action owner", async () => {
    const res = createMockRes();

    await acceptVendorRiskFinding(acceptReq({ action_owner: 12 }), res);

    expect(mockAcceptFinding).toHaveBeenCalledWith(expect.objectContaining({ actionOwner: 12 }));
  });

  it.each(BAD_IDS)(
    "answers 400 for a finding id that is %s, and accepts nothing",
    async (_name, id) => {
      const res = createMockRes();

      await acceptVendorRiskFinding(acceptReq({}, { id }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockAcceptFinding).not.toHaveBeenCalled();
    },
  );

  it.each<[string, unknown]>([
    ["a numeric string", "5"],
    ["zero", 0],
    ["negative", -1],
    ["a fraction", 1.5],
    ["a boolean", true],
    ["a list", [5]],
    ["an object", { id: 5 }],
    ["infinite", Infinity],
    ["beyond the safe integers", 2 ** 53],
  ])("answers 400 for an action owner that is %s, and accepts nothing", async (_name, owner) => {
    const res = createMockRes();

    await acceptVendorRiskFinding(acceptReq({ action_owner: owner }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockAcceptFinding).not.toHaveBeenCalled();
  });

  it.each(REFUSALS)(
    "answers for %s with the status of the refusal",
    async (_name, error, status, body) => {
      mockAcceptFinding.mockRejectedValue(error);
      const res = createMockRes();

      await acceptVendorRiskFinding(acceptReq({}), res);

      expect(res.status).toHaveBeenCalledWith(status);
      expect(bodyOf(res)).toEqual(body);
    },
  );
});

describe("dismissVendorRiskFinding", () => {
  const dismissReq = (
    body?: unknown,
    params: Record<string, unknown> = { id: String(FINDING_ID) },
  ) => createMockReq({ params, body });

  it("answers 200 with the dismissed finding, and dismisses it for the caller in the caller's organization", async () => {
    const res = createMockRes();

    await dismissVendorRiskFinding(
      dismissReq({
        reason: "other",
        note: "Not relevant.",
        organizationId: 99,
        userId: 99,
        findingId: 99,
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(bodyOf(res)).toEqual({
      message: "OK",
      data: { ...DISMISSED_FINDING, credibility_rationale: null },
    });
    expect(mockDismissFinding).toHaveBeenCalledTimes(1);
    expect(mockDismissFinding).toHaveBeenCalledWith({
      organizationId: ORG,
      findingId: FINDING_ID,
      userId: USER,
      reason: "other",
      note: "Not relevant.",
    });
  });

  it("dismisses without a note", async () => {
    const res = createMockRes();

    await dismissVendorRiskFinding(dismissReq({ reason: "not_applicable" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockDismissFinding.mock.calls[0][0].reason).toBe("not_applicable");
    expect(mockDismissFinding.mock.calls[0][0].note).toBeUndefined();
  });

  it.each(DISMISS_REASONS)("takes the reason %s", async (reason) => {
    const res = createMockRes();

    await dismissVendorRiskFinding(dismissReq({ reason }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockDismissFinding.mock.calls[0][0].reason).toBe(reason);
  });

  it.each(BAD_IDS)(
    "answers 400 for a finding id that is %s, and dismisses nothing",
    async (_name, id) => {
      const res = createMockRes();

      await dismissVendorRiskFinding(dismissReq({ reason: "other" }, { id }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockDismissFinding).not.toHaveBeenCalled();
    },
  );

  it.each<[string, unknown]>([
    ["missing", undefined],
    ["null", null],
    ["a number", 5],
    ["an unknown word", "nope"],
    ["in capitals", "NOT_APPLICABLE"],
    ["empty", ""],
    ["a list", ["other"]],
    ["an object", { reason: "other" }],
  ])("answers 400 for a reason that is %s, and dismisses nothing", async (_name, reason) => {
    const res = createMockRes();

    await dismissVendorRiskFinding(dismissReq({ reason }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDismissFinding).not.toHaveBeenCalled();
  });

  it("answers 400 when there is no body, and dismisses nothing", async () => {
    const res = createMockRes();

    await dismissVendorRiskFinding(dismissReq(undefined), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDismissFinding).not.toHaveBeenCalled();
  });

  it("takes a note of null as no note, and hands the service none", async () => {
    // A client that sends the whole form says `note: null` for a note it left empty.
    const res = createMockRes();

    await dismissVendorRiskFinding(dismissReq({ reason: "other", note: null }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockDismissFinding).toHaveBeenCalledTimes(1);
    expect(mockDismissFinding.mock.calls[0][0].reason).toBe("other");
    expect(mockDismissFinding.mock.calls[0][0].note).toBeUndefined();
  });

  it.each<[string, unknown]>([
    ["a number", 5],
    ["a boolean", true],
    ["a list", ["a note"]],
    ["an object", { text: "a note" }],
  ])("answers 400 for a note that is %s, and dismisses nothing", async (_name, note) => {
    const res = createMockRes();

    await dismissVendorRiskFinding(dismissReq({ reason: "other", note }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDismissFinding).not.toHaveBeenCalled();
  });

  it.each(REFUSALS)(
    "answers for %s with the status of the refusal",
    async (_name, error, status, body) => {
      mockDismissFinding.mockRejectedValue(error);
      const res = createMockRes();

      await dismissVendorRiskFinding(dismissReq({ reason: "other" }), res);

      expect(res.status).toHaveBeenCalledWith(status);
      expect(bodyOf(res)).toEqual(body);
    },
  );
});
