import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../utils/vendor.utils", () => ({ getVendorByIdQuery: jest.fn() }));
jest.mock("../../utils/llmKey.utils", () => ({ getLLMKeysQuery: jest.fn() }));
jest.mock("../../utils/vendorResearch.utils", () => ({
  STALE_RUN_MINUTES: 15,
  failStaleRunsQuery: jest.fn(),
  getLatestRunQuery: jest.fn(),
  listFindingsQuery: jest.fn(),
}));
// The real module opens a BullMQ queue when it is loaded.
jest.mock("../../services/vendorResearch/trigger", () => ({ startVendorResearch: jest.fn() }));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  logFailure: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: unknown, err: unknown) => (err as Error).message),
}));

import {
  getLatestVendorResearch,
  getResearchConfig,
  listVendorRiskFindings,
  startVendorResearchRun,
} from "../vendorResearch.ctrl";
import { getVendorByIdQuery } from "../../utils/vendor.utils";
import { getLLMKeysQuery } from "../../utils/llmKey.utils";
import {
  failStaleRunsQuery,
  getLatestRunQuery,
  listFindingsQuery,
} from "../../utils/vendorResearch.utils";
import { startVendorResearch } from "../../services/vendorResearch/trigger";
import type { IVendorResearchRun } from "../../domain.layer/interfaces/i.vendorResearch";

const mockGetVendorByIdQuery = getVendorByIdQuery as jest.MockedFunction<typeof getVendorByIdQuery>;
const mockGetLLMKeysQuery = getLLMKeysQuery as jest.MockedFunction<typeof getLLMKeysQuery>;
const mockFailStaleRunsQuery = failStaleRunsQuery as jest.MockedFunction<typeof failStaleRunsQuery>;
const mockGetLatestRunQuery = getLatestRunQuery as jest.MockedFunction<typeof getLatestRunQuery>;
const mockListFindingsQuery = listFindingsQuery as jest.MockedFunction<typeof listFindingsQuery>;
const mockStartVendorResearch = startVendorResearch as jest.MockedFunction<
  typeof startVendorResearch
>;

const ORG = 1;
const USER = 5;
const VENDOR = 7;

/** Values that must never appear in a response: everything on the run row outside the allowlist. */
const EVIDENCE_SENTINEL = "EVIDENCE-SENTINEL-4f2a";
const MODEL_SENTINEL = "model-sentinel-91b0";
const PROMPT_SENTINEL = "prompt-version-sentinel-c37d";
const SEARCH_PROVIDER_SENTINEL = "search-provider-sentinel-5e18";

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
      url: "https://example.com/breach",
      title: "Breach",
      content: EVIDENCE_SENTINEL,
      publishedAt: null,
    },
  ],
  search_provider: SEARCH_PROVIDER_SENTINEL,
  model: MODEL_SENTINEL,
  prompt_version: PROMPT_SENTINEL,
  searches_used: 4,
  duplicates_dropped: 2,
  error: null,
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
  "duplicates_dropped",
  "error",
  "started_at",
  "finished_at",
  "created_at",
].sort();

const SENTINELS = [EVIDENCE_SENTINEL, MODEL_SENTINEL, PROMPT_SENTINEL, SEARCH_PROVIDER_SENTINEL];

/**
 * Vendor ids that every route that takes one must refuse before it looks anything up. 309 nines
 * are more than the largest float: Number() turns them into Infinity, which is greater than zero.
 */
const BAD_VENDOR_IDS: Array<[string, string | string[]]> = [
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

const ENV_KEYS = [
  "VENDOR_RESEARCH_SEARCH_PROVIDER",
  "TAVILY_API_KEY",
  "VENDOR_RESEARCH_AUTO_RUN",
] as const;
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
  mockListFindingsQuery.mockResolvedValue({ rows: [], total: 0 });
  mockStartVendorResearch.mockResolvedValue({ ok: true, run: RUN, alreadyRunning: false });
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
      expectNoRunInternals(res);
    }
  });

  it.each(BAD_VENDOR_IDS)(
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

  it.each(["search_not_configured", "llm_key_missing"] as const)(
    "answers 409 with the code %s in data",
    async (code) => {
      mockStartVendorResearch.mockResolvedValue({ ok: false, error: { code } });
      const res = createMockRes();

      await startVendorResearchRun(createMockReq(), res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(bodyOf(res)).toEqual({ message: "Conflict", data: { code } });
    },
  );

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
  it.each(BAD_VENDOR_IDS)(
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
      duplicates_dropped: 2,
      error: null,
    });
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

describe("getResearchConfig", () => {
  it("answers whether search and an LLM key are set up and whether research starts by itself", async () => {
    process.env.VENDOR_RESEARCH_SEARCH_PROVIDER = "tavily";
    process.env.TAVILY_API_KEY = "tvly-SENTINEL-7c1e";
    mockGetLLMKeysQuery.mockResolvedValue([
      { id: 3, name: "OpenAI", key: "sk-SENTINEL-2d9b" },
    ] as any);
    const res = createMockRes();

    await getResearchConfig(createMockReq(), res);

    expect(mockGetLLMKeysQuery).toHaveBeenCalledWith(ORG);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(bodyOf(res)).toEqual({
      message: "OK",
      data: { searchConfigured: true, hasLlmKey: true, autoRunEnabled: true },
    });
    // Neither the search key nor the key of the organization is in anything that was sent.
    expect(sentOf(res)).not.toContain("tvly-SENTINEL-7c1e");
    expect(sentOf(res)).not.toContain("sk-SENTINEL-2d9b");
  });

  it("answers false for what is not set up", async () => {
    process.env.VENDOR_RESEARCH_AUTO_RUN = "false";
    const res = createMockRes();

    await getResearchConfig(createMockReq(), res);

    expect(bodyOf(res).data).toEqual({
      searchConfigured: false,
      hasLlmKey: false,
      autoRunEnabled: false,
    });
  });

  it("does not call search configured while the provider has no key", async () => {
    process.env.VENDOR_RESEARCH_SEARCH_PROVIDER = "tavily";
    const res = createMockRes();

    await getResearchConfig(createMockReq(), res);

    expect(bodyOf(res).data.searchConfigured).toBe(false);
  });

  it("answers 500 when the query throws", async () => {
    mockGetLLMKeysQuery.mockRejectedValue(new Error("DB failure"));
    const res = createMockRes();

    await getResearchConfig(createMockReq(), res);

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
    expect(bodyOf(res)).toEqual({ message: "OK", data: page });
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
    ...BAD_VENDOR_IDS.map(([name, vendorId]): [string, { vendorId: string | string[] }] => [
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
