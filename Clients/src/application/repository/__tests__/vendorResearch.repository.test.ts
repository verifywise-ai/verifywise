import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import CustomException from "../../../infrastructure/exceptions/customeException";
import { APIError } from "../../tools/error";
import {
  acceptVendorRiskFinding,
  dismissVendorRiskFinding,
  getLatestVendorResearch,
  getVendorResearchConfig,
  getVendorResearchSettings,
  listVendorRiskFindings,
  readVendorResearchError,
  saveVendorResearchSettings,
  startVendorResearch,
} from "../vendorResearch.repository";
import type {
  AcceptedVendorRisk,
  VendorResearchRun,
  VendorRiskFinding,
} from "../../../domain/interfaces/i.vendorResearch";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

const mockGet = vi.mocked(apiServices.get);
const mockPost = vi.mocked(apiServices.post);
const mockPut = vi.mocked(apiServices.put);

/** A success body as the server sends it: `{ message, data }`. */
const success = (data: unknown, status = 200) => ({
  data: { message: "OK", data },
  status,
  statusText: "OK",
});

const run = (overrides: Partial<VendorResearchRun> = {}): VendorResearchRun => ({
  id: 5,
  vendor_id: 3,
  status: "completed",
  trigger_type: "manual",
  categories: ["security_incidents"],
  category_summary: [
    {
      category: "security_incidents",
      outcome: "nothing_found",
      note: "No risks found in the sources reviewed",
    },
  ],
  duplicates_dropped: 0,
  searches_used: 6,
  pages_read: 4,
  error: null,
  progress: null,
  started_at: "2026-10-10T09:00:00.000Z",
  finished_at: "2026-10-10T09:01:00.000Z",
  created_at: "2026-10-10T08:59:00.000Z",
  ...overrides,
});

const finding = (overrides: Partial<VendorRiskFinding> = {}): VendorRiskFinding => ({
  id: 9,
  organization_id: 1,
  vendor_id: 3,
  run_id: 5,
  category: "security_incidents",
  risk_description: "Customer data was exposed in a breach",
  impact_description: "Personal data of our customers could be exposed",
  action_plan: "Ask the vendor for its incident report",
  likelihood: "Possible",
  risk_severity: "Major",
  risk_level: "High Risk",
  confidence: "medium",
  rationale: "The vendor confirmed the breach.",
  sources: [
    {
      url: "https://example.com/breach",
      title: "Breach report",
      quote: "The vendor confirmed the incident.",
      published_at: "2026-09-01",
    },
  ],
  status: "pending",
  dismissed_reason: null,
  dismissed_note: null,
  accepted_vendor_risk_id: null,
  decided_by: null,
  decided_at: null,
  created_at: "2026-10-10T09:01:00.000Z",
  ...overrides,
});

/** The vendor risk an accept creates, with every field the response sends and no other. */
const acceptedRisk = (overrides: Partial<AcceptedVendorRisk> = {}): AcceptedVendorRisk => ({
  id: 77,
  vendor_id: 3,
  order_no: null,
  risk_description: "Customer data was exposed in a breach",
  impact_description: "Personal data of our customers could be exposed",
  likelihood: "Possible",
  risk_severity: "Major",
  action_plan: "Ask the vendor for its incident report",
  action_owner: 4,
  risk_level: "High Risk",
  is_demo: false,
  created_at: "2026-10-10T09:02:00.000Z",
  updated_at: "2026-10-10T09:02:00.000Z",
  ...overrides,
});

/**
 * What `apiServices` rejects with when the server answers with an error: a
 * `CustomException` whose message is picked out of the body and whose `response`
 * is the response body itself (see `handleError` in networkServices.ts).
 */
const serverRefusal = (status: number, message: string, body: unknown) =>
  new CustomException(message, status, body);

beforeEach(() => vi.clearAllMocks());

describe("getVendorResearchConfig", () => {
  it("reads /v1/vendor-research/config and unwraps the data", async () => {
    const config = { hasLlmKey: false, autoRunEnabled: true };
    mockGet.mockResolvedValue(success(config));

    await expect(getVendorResearchConfig()).resolves.toEqual(config);

    expect(mockGet).toHaveBeenCalledWith("/v1/vendor-research/config");
  });
});

describe("getVendorResearchSettings", () => {
  it("reads /v1/vendor-research/settings and unwraps the choice", async () => {
    const settings = { researchKeyId: 4, analysisKeyId: null, scanIntervalDays: 14 };
    mockGet.mockResolvedValue(success(settings));

    await expect(getVendorResearchSettings()).resolves.toEqual(settings);

    expect(mockGet).toHaveBeenCalledWith("/v1/vendor-research/settings");
  });
});

describe("saveVendorResearchSettings", () => {
  it("puts the two keys and the scan interval to /v1/vendor-research/settings and unwraps what the server kept", async () => {
    const saved = { researchKeyId: 4, analysisKeyId: 9, scanIntervalDays: 7 };
    mockPut.mockResolvedValue(success(saved));

    await expect(saveVendorResearchSettings(saved)).resolves.toEqual(saved);

    expect(mockPut).toHaveBeenCalledWith("/v1/vendor-research/settings", saved);
  });

  it("sends null for a key that is left to the default and for a scan that is off, because the server wants all fields", async () => {
    mockPut.mockResolvedValue(
      success({ researchKeyId: null, analysisKeyId: null, scanIntervalDays: null }),
    );

    await saveVendorResearchSettings({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: null,
    });

    expect(mockPut).toHaveBeenCalledWith("/v1/vendor-research/settings", {
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
  });
});

describe("listVendorRiskFindings", () => {
  it("requests only the parameters that are set, in a fixed order", async () => {
    mockGet.mockResolvedValue(success({ rows: [], total: 0 }));

    await listVendorRiskFindings({ vendorId: 3, status: "pending" });

    expect(mockGet).toHaveBeenCalledWith("/v1/vendor-risk-findings?status=pending&vendorId=3");
  });

  it("asks for the whole list, without a stray question mark, when nothing is set", async () => {
    mockGet.mockResolvedValue(success({ rows: [], total: 0 }));

    await listVendorRiskFindings({});

    expect(mockGet).toHaveBeenCalledWith("/v1/vendor-risk-findings");
  });

  it("sends an offset of zero, because zero is a value", async () => {
    mockGet.mockResolvedValue(success({ rows: [], total: 0 }));

    await listVendorRiskFindings({ limit: 25, offset: 0 });

    expect(mockGet).toHaveBeenCalledWith("/v1/vendor-risk-findings?limit=25&offset=0");
  });

  it("returns the rows and the total", async () => {
    const page = { rows: [finding({ vendor_name: "Acme" })], total: 41 };
    mockGet.mockResolvedValue(success(page));

    await expect(listVendorRiskFindings({ status: "pending" })).resolves.toEqual(page);
  });
});

describe("startVendorResearch", () => {
  it("posts to /v1/vendors/3/research and unwraps the run and the already-running flag", async () => {
    const started = { run: run({ status: "queued" }), alreadyRunning: true };
    mockPost.mockResolvedValue(success(started, 202));

    await expect(startVendorResearch(3)).resolves.toEqual(started);

    expect(mockPost).toHaveBeenCalledWith("/v1/vendors/3/research", {});
  });
});

describe("getLatestVendorResearch", () => {
  it("reads /v1/vendors/3/research/latest and unwraps the run", async () => {
    mockGet.mockResolvedValue(success(run()));

    await expect(getLatestVendorResearch(3)).resolves.toEqual(run());

    expect(mockGet).toHaveBeenCalledWith("/v1/vendors/3/research/latest");
  });

  it("returns null for a vendor that was never researched", async () => {
    mockGet.mockResolvedValue(success(null));

    await expect(getLatestVendorResearch(3)).resolves.toBeNull();
  });
});

describe("acceptVendorRiskFinding", () => {
  it("posts the body to /v1/vendor-risk-findings/9/accept and unwraps the finding and the risk", async () => {
    const accepted = {
      finding: finding({ status: "accepted", accepted_vendor_risk_id: 77 }),
      vendorRisk: acceptedRisk(),
    };
    mockPost.mockResolvedValue(success(accepted));

    await expect(acceptVendorRiskFinding(9, { action_owner: 4 })).resolves.toEqual(accepted);

    expect(mockPost).toHaveBeenCalledWith("/v1/vendor-risk-findings/9/accept", { action_owner: 4 });
  });

  it("keeps an absent owner (the vendor's assignee) apart from null (nobody)", async () => {
    mockPost.mockResolvedValue(success({}));

    await acceptVendorRiskFinding(9, {});
    await acceptVendorRiskFinding(9, { action_owner: null });

    expect(mockPost).toHaveBeenNthCalledWith(1, "/v1/vendor-risk-findings/9/accept", {});
    expect(mockPost).toHaveBeenNthCalledWith(2, "/v1/vendor-risk-findings/9/accept", {
      action_owner: null,
    });
  });

  it("returns the risk of a finding accepted without an owner, with null kept as null", async () => {
    const ownerless = {
      finding: finding({ status: "accepted" }),
      vendorRisk: acceptedRisk({ action_owner: null }),
    };
    mockPost.mockResolvedValue(success(ownerless));

    const { vendorRisk } = await acceptVendorRiskFinding(9, { action_owner: null });

    expect(vendorRisk.action_owner).toBeNull();
    expect(vendorRisk.order_no).toBeNull();
  });
});

describe("dismissVendorRiskFinding", () => {
  it("posts the reason and note to /v1/vendor-risk-findings/9/dismiss and unwraps the finding", async () => {
    const dismissed = finding({ status: "dismissed", dismissed_reason: "inaccurate" });
    mockPost.mockResolvedValue(success(dismissed));
    const body = { reason: "inaccurate" as const, note: "Wrong vendor" };

    await expect(dismissVendorRiskFinding(9, body)).resolves.toEqual(dismissed);

    expect(mockPost).toHaveBeenCalledWith("/v1/vendor-risk-findings/9/dismiss", body);
  });
});

describe("a failed call", () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["getVendorResearchConfig", () => getVendorResearchConfig()],
    ["getVendorResearchSettings", () => getVendorResearchSettings()],
    [
      "saveVendorResearchSettings",
      () =>
        saveVendorResearchSettings({
          researchKeyId: null,
          analysisKeyId: null,
          scanIntervalDays: null,
        }),
    ],
    ["listVendorRiskFindings", () => listVendorRiskFindings({})],
    ["startVendorResearch", () => startVendorResearch(3)],
    ["getLatestVendorResearch", () => getLatestVendorResearch(3)],
    ["acceptVendorRiskFinding", () => acceptVendorRiskFinding(9, {})],
    ["dismissVendorRiskFinding", () => dismissVendorRiskFinding(9, { reason: "other" })],
  ];

  it.each(calls)(
    "%s rethrows an APIError with the server's message and status",
    async (_, call) => {
      const refusal = serverRefusal(404, "Vendor not found", {
        message: "Not Found",
        data: "Vendor not found",
      });
      mockGet.mockRejectedValue(refusal);
      mockPost.mockRejectedValue(refusal);
      mockPut.mockRejectedValue(refusal);

      const error = await call().catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(APIError);
      expect(error).toMatchObject({ message: "Vendor not found", status: 404 });
      expect((error as APIError).originalError).toBe(refusal);
    },
  );

  it("keeps the status of a 429", async () => {
    mockPost.mockRejectedValue(
      serverRefusal(429, "Too Many Requests", {
        message: "Too Many Requests",
        data: { code: "cooldown", retryAfterSeconds: 540 },
      }),
    );

    const error = await startVendorResearch(3).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({ message: "Too Many Requests", status: 429 });
  });

  it("uses a fixed message when the failure carries none", async () => {
    mockPost.mockRejectedValue(new Error(""));

    const error = await startVendorResearch(3).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).message).toBe("Failed to start the research");
    expect((error as APIError).status).toBeUndefined();
  });
});

describe("readVendorResearchError", () => {
  /** Runs `startVendorResearch` against a server refusal and returns what it threw. */
  const startRefusedWith = async (status: number, message: string, body: unknown) => {
    mockPost.mockRejectedValue(serverRefusal(status, message, body));
    return startVendorResearch(3).catch((thrown: unknown) => thrown);
  };

  it("gives the status, the code and the wait of a 429 cooldown", async () => {
    const error = await startRefusedWith(429, "Too Many Requests", {
      message: "Too Many Requests",
      data: { code: "cooldown", retryAfterSeconds: 540 },
    });

    expect(readVendorResearchError(error)).toEqual({
      status: 429,
      code: "cooldown",
      retryAfterSeconds: 540,
    });
  });

  it("gives no wait for a daily cap, which has none", async () => {
    const error = await startRefusedWith(429, "Too Many Requests", {
      message: "Too Many Requests",
      data: { code: "daily_cap" },
    });

    expect(readVendorResearchError(error)).toEqual({ status: 429, code: "daily_cap" });
  });

  it("gives the code of a 409 that says the LLM key is missing", async () => {
    const error = await startRefusedWith(409, "Conflict", {
      message: "Conflict",
      data: { code: "llm_key_missing" },
    });

    expect(readVendorResearchError(error)).toEqual({ status: 409, code: "llm_key_missing" });
  });

  it("tells a 503 by its status alone, because it has no code", async () => {
    const error = await startRefusedWith(503, "Service Unavailable", {
      message: "Service Unavailable",
      error: "The job queue is unavailable.",
    });

    expect(readVendorResearchError(error)).toEqual({ status: 503 });
  });

  it("gives only the status of a 409 on accept or dismiss, whose body is a sentence", async () => {
    mockPost.mockRejectedValue(
      serverRefusal(409, "The finding is already accepted.", {
        message: "Conflict",
        data: "The finding is already accepted.",
      }),
    );

    const error = await acceptVendorRiskFinding(9, {}).catch((thrown: unknown) => thrown);

    expect(readVendorResearchError(error)).toEqual({ status: 409 });
  });

  it("ignores a code or a wait of the wrong type", async () => {
    const error = await startRefusedWith(429, "Too Many Requests", {
      message: "Too Many Requests",
      data: { code: 7, retryAfterSeconds: "soon" },
    });

    expect(readVendorResearchError(error)).toEqual({ status: 429 });
  });

  it("gives an empty detail for a failure that never reached the server", async () => {
    mockPost.mockRejectedValue(new CustomException("Network Error", undefined, undefined));

    const error = await startVendorResearch(3).catch((thrown: unknown) => thrown);

    expect(readVendorResearchError(error)).toEqual({});
  });

  it("gives the status of an APIError that has no body", () => {
    expect(readVendorResearchError(new APIError("Broken", 500))).toEqual({ status: 500 });
  });

  it.each([
    ["a plain Error", new Error("boom")],
    ["null", null],
    ["undefined", undefined],
    ["a string", "boom"],
  ])("gives an empty detail, and does not throw, for %s", (_, unrelated) => {
    expect(readVendorResearchError(unrelated)).toEqual({});
  });
});
