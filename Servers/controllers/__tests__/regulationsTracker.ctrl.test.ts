// jest.mock calls must precede all imports (hoisted by Jest).
jest.mock("../../utils/regulationsTracker.utils", () => ({
  listCountries: jest
    .fn()
    .mockResolvedValue([
      { slug: "eu", name: "European Union", region: "Europe", is_tracked: false },
    ]),
  getCountryRow: jest.fn().mockResolvedValue({
    slug: "eu",
    data: { name: "European Union", slug: "eu" },
    is_tracked: false,
    hash: "h1",
  }),
  listTracked: jest.fn().mockResolvedValue([{ country_slug: "eu", name: "European Union" }]),
  trackCountry: jest.fn().mockResolvedValue({ tracked: true }),
  trackCountriesBulk: jest.fn().mockResolvedValue({ tracked: 2 }),
  untrackCountry: jest.fn().mockResolvedValue({ untracked: true }),
  getSettings: jest.fn().mockResolvedValue({
    recipient_user_ids: [],
    recipient_emails: [],
    updated_by: null,
    updated_at: null,
    impact_enabled: true,
    last_impact_run_at: null,
  }),
  upsertSettings: jest.fn().mockResolvedValue({
    recipient_user_ids: [1],
    recipient_emails: ["dpo@acme.com"],
    updated_by: 1,
    updated_at: new Date(),
    impact_enabled: true,
    last_impact_run_at: null,
  }),
  getMetaQuery: jest.fn().mockResolvedValue({
    seeded_at: new Date(),
    last_good_count: 60,
    last_run_week: "2026-W26",
    last_run_at: new Date(),
    last_run_status: "ok: 0 changed, 0 removed",
  }),
  getGlobalFeed: jest.fn().mockResolvedValue(null),
  setGlobalFeeds: jest.fn().mockResolvedValue(undefined),
  setLastImpactRunAt: jest.fn().mockResolvedValue(undefined),
  // BUG 3: normalizeSlug exported — keep real behaviour in tests
  normalizeSlug: (s: string) => String(s).trim().toLowerCase(),
}));

jest.mock("../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../utils/regulationImpact.utils", () => ({
  getImpactRow: jest.fn().mockResolvedValue({
    regulation_hash: "h1",
    status: "ok",
    result: { systems: [], controls: [], policies: [], vendors: [], assessments: [], generatedAt: "x" },
    refreshed_at: "2026-06-27T00:00:00.000Z",
  }),
  runImpactAnalysis: jest.fn().mockResolvedValue({
    status: "ok",
    result: { systems: [], controls: [], policies: [], vendors: [], assessments: [], generatedAt: "x" },
    counts: { system: 0, control: 0, policy: 0, vendor: 0, assessment: 0 },
    cached: false,
  }),
}));

jest.mock("../../utils/regulationsTrackerFeed", () => ({
  // The real feed nests detail under `country` with `meta` alongside.
  fetchCountryDetail: jest.fn().mockResolvedValue({
    country: { slug: "eu", name: "European Union", regulations: [{ name: "EU AI Act" }] },
    meta: { disclaimer: "info only" },
  }),
  fetchHorizon: jest.fn().mockResolvedValue({ changes: [] }),
  fetchDeadlines: jest.fn().mockResolvedValue({ deadlines: [], unscheduled: [] }),
  fetchSnapshot: jest.fn().mockResolvedValue({ frameworks: [] }),
}));

jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));

import {
  getCountries,
  getCountryDetail,
  getTracked,
  trackCountryCtrl,
  trackBulkCtrl,
  untrackCountryCtrl,
  getSettingsCtrl,
  updateSettingsCtrl,
  triggerSync,
  getImpactAnalysis,
  refreshImpactAnalysis,
} from "../regulationsTracker.ctrl";
import {
  listCountries,
  listTracked,
  trackCountry,
  trackCountriesBulk,
  untrackCountry,
  getCountryRow,
  upsertSettings,
  getSettings,
  getMetaQuery,
} from "../../utils/regulationsTracker.utils";
import { getLLMKeysWithKeyQuery } from "../../utils/llmKey.utils";
import { getImpactRow, runImpactAnalysis } from "../../utils/regulationImpact.utils";

// ---------------------------------------------------------------------------
// Global mock reset — prevents call counts from accumulating across tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: minimal mock Response (mirrors aiTrustIndex.ctrl.test.ts pattern)
// ---------------------------------------------------------------------------
function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// ---------------------------------------------------------------------------
// GET /api/regulations-tracker/countries
// ---------------------------------------------------------------------------
describe("getCountries", () => {
  it("returns 200 with the array from the mocked util", async () => {
    const req: any = { userId: 1, organizationId: 7, query: {} };
    const res = mockRes();
    await getCountries(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(listCountries).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "OK",
        data: expect.arrayContaining([expect.objectContaining({ slug: "eu" })]),
      }),
    );
  });

  it("passes region and q query params to the util", async () => {
    const req: any = { userId: 1, organizationId: 7, query: { region: "Europe", q: "gdpr" } };
    const res = mockRes();
    await getCountries(req, res);
    expect(listCountries).toHaveBeenCalledWith(7, { region: "Europe", q: "gdpr" });
  });
});

// ---------------------------------------------------------------------------
// GET /api/regulations-tracker/countries/:slug
// ---------------------------------------------------------------------------
describe("getCountryDetail", () => {
  it("returns 200 with flattened live data (not stale) when fetchCountryDetail succeeds", async () => {
    const req: any = { userId: 1, organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getCountryDetail(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(getCountryRow).toHaveBeenCalledWith("eu", 7);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    // Live country is flattened to the root (regulations/name/meta) and stale:false.
    expect(payload.data).toEqual(expect.objectContaining({ name: "European Union", stale: false }));
    expect(payload.data.regulations).toEqual([{ name: "EU AI Act" }]);
  });

  it("falls back to stale stored data when the live feed returns an empty country payload", async () => {
    const { fetchCountryDetail } = require("../../utils/regulationsTrackerFeed");
    fetchCountryDetail.mockResolvedValueOnce({ country: {}, meta: null });
    const req: any = { userId: 1, organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getCountryDetail(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.data.stale).toBe(true);
  });

  it("returns 404 when the country slug is unknown", async () => {
    (getCountryRow as jest.Mock).mockResolvedValueOnce(null);
    const req: any = { userId: 1, organizationId: 7, params: { slug: "unknown-slug" } };
    const res = mockRes();
    await getCountryDetail(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("falls back to stale local data when fetchCountryDetail throws", async () => {
    const { fetchCountryDetail } = require("../../utils/regulationsTrackerFeed");
    fetchCountryDetail.mockRejectedValueOnce(new Error("network error"));
    const req: any = { userId: 1, organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getCountryDetail(req, res);
    // Controller catches the inner error and still returns 200 with stale data
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.data.stale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/regulations-tracker/tracked
// ---------------------------------------------------------------------------
describe("getTracked", () => {
  it("returns 200 with tracked list", async () => {
    const req: any = { userId: 1, organizationId: 7 };
    const res = mockRes();
    await getTracked(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("tenant isolation: passes organizationId to listTracked", async () => {
    const req: any = { userId: 1, organizationId: 42 };
    const res = mockRes();
    await getTracked(req, res);
    expect(listTracked).toHaveBeenCalledWith(42);
  });

  it("org A cannot see org B's tracked list", async () => {
    (listTracked as jest.Mock)
      .mockResolvedValueOnce([{ country_slug: "eu" }]) // org A
      .mockResolvedValueOnce([{ country_slug: "us" }]); // org B

    const reqA: any = { userId: 1, organizationId: 1 };
    const reqB: any = { userId: 2, organizationId: 2 };
    const resA = mockRes();
    const resB = mockRes();

    await getTracked(reqA, resA);
    await getTracked(reqB, resB);

    // Verify each call was scoped to its own org
    expect((listTracked as jest.Mock).mock.calls[0][0]).toBe(1);
    expect((listTracked as jest.Mock).mock.calls[1][0]).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// POST /api/regulations-tracker/tracked  [ADMIN]
// ---------------------------------------------------------------------------
describe("trackCountryCtrl", () => {
  it("returns 403 for a non-admin role and does not call trackCountry", async () => {
    const req: any = { role: "Editor", userId: 1, organizationId: 7, body: { slug: "eu" } };
    const res = mockRes();
    await trackCountryCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(trackCountry).not.toHaveBeenCalled();
  });

  it("returns 403 for an Auditor role", async () => {
    const req: any = { role: "Auditor", userId: 1, organizationId: 7, body: { slug: "eu" } };
    const res = mockRes();
    await trackCountryCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(trackCountry).not.toHaveBeenCalled();
  });

  it("returns 400 when slug is missing", async () => {
    const req: any = { role: "Admin", userId: 1, organizationId: 7, body: {} };
    const res = mockRes();
    await trackCountryCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(trackCountry).not.toHaveBeenCalled();
  });

  it("returns 200 for an Admin with a valid slug", async () => {
    const req: any = { role: "Admin", userId: 1, organizationId: 7, body: { slug: "eu" } };
    const res = mockRes();
    await trackCountryCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 200 for a SuperAdmin with a valid slug", async () => {
    const req: any = { role: "SuperAdmin", userId: 2, organizationId: 7, body: { slug: "us" } };
    const res = mockRes();
    await trackCountryCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("tenant isolation: passes organizationId to trackCountry", async () => {
    const req: any = { role: "Admin", userId: 1, organizationId: 99, body: { slug: "eu" } };
    const res = mockRes();
    await trackCountryCtrl(req, res);
    expect(trackCountry).toHaveBeenCalledWith(99, "eu", 1);
  });
});

// ---------------------------------------------------------------------------
// POST /api/regulations-tracker/tracked/bulk  [ADMIN]
// ---------------------------------------------------------------------------
describe("trackBulkCtrl", () => {
  it("returns 403 for a non-admin role", async () => {
    const req: any = {
      role: "Reviewer",
      userId: 1,
      organizationId: 7,
      body: { slugs: ["eu", "us"] },
    };
    const res = mockRes();
    await trackBulkCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(trackCountriesBulk).not.toHaveBeenCalled();
  });

  it("returns 400 when slugs is not an array", async () => {
    const req: any = { role: "Admin", userId: 1, organizationId: 7, body: { slugs: "eu" } };
    const res = mockRes();
    await trackBulkCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when slugs array contains a non-string entry", async () => {
    const req: any = { role: "Admin", userId: 1, organizationId: 7, body: { slugs: ["eu", 123] } };
    const res = mockRes();
    await trackBulkCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 200 for an Admin with a valid slugs array", async () => {
    const req: any = { role: "Admin", userId: 1, organizationId: 7, body: { slugs: ["eu", "us"] } };
    const res = mockRes();
    await trackBulkCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(trackCountriesBulk).toHaveBeenCalledWith(7, ["eu", "us"], 1);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/regulations-tracker/tracked/:slug  [ADMIN]
// ---------------------------------------------------------------------------
describe("untrackCountryCtrl", () => {
  it("returns 403 for a non-admin role", async () => {
    const req: any = { role: "Editor", userId: 1, organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await untrackCountryCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(untrackCountry).not.toHaveBeenCalled();
  });

  it("is idempotent: returns 200 even when the country was never tracked", async () => {
    // untrackCountry is a DELETE that resolves regardless (no-op if not tracked)
    (untrackCountry as jest.Mock).mockResolvedValueOnce({ untracked: true });
    const req: any = {
      role: "Admin",
      userId: 1,
      organizationId: 7,
      params: { slug: "never-tracked" },
    };
    const res = mockRes();
    await untrackCountryCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 200 and echoes the slug on success", async () => {
    const req: any = { role: "Admin", userId: 1, organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await untrackCountryCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(untrackCountry).toHaveBeenCalledWith(7, "eu");
  });
});

// ---------------------------------------------------------------------------
// GET /api/regulations-tracker/settings
// ---------------------------------------------------------------------------
describe("getSettingsCtrl", () => {
  it("returns 200 with settings for any authenticated user", async () => {
    const req: any = { userId: 1, organizationId: 7 };
    const res = mockRes();
    await getSettingsCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("merges global run status (last_run_at + last_run_status) into the settings payload", async () => {
    const req: any = { userId: 1, organizationId: 7 };
    const res = mockRes();
    await getSettingsCtrl(req, res);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.data).toEqual(
      expect.objectContaining({ last_run_status: "ok: 0 changed, 0 removed" }),
    );
    expect(payload.data.last_run_at).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PUT /api/regulations-tracker/settings  [ADMIN]
// ---------------------------------------------------------------------------
describe("updateSettingsCtrl", () => {
  it("returns 403 for a non-admin role and does not write", async () => {
    const req: any = {
      role: "Editor",
      userId: 1,
      organizationId: 7,
      body: { recipient_user_ids: [], recipient_emails: [] },
    };
    const res = mockRes();
    await updateSettingsCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(upsertSettings).not.toHaveBeenCalled();
  });

  it("returns 400 when recipient_emails contains a malformed email", async () => {
    const req: any = {
      role: "Admin",
      userId: 1,
      organizationId: 7,
      body: { recipient_user_ids: [], recipient_emails: ["not-an-email"] },
    };
    const res = mockRes();
    await updateSettingsCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(upsertSettings).not.toHaveBeenCalled();
  });

  it("returns 400 when recipient_user_ids contains a non-integer", async () => {
    const req: any = {
      role: "Admin",
      userId: 1,
      organizationId: 7,
      body: { recipient_user_ids: ["abc"], recipient_emails: [] },
    };
    const res = mockRes();
    await updateSettingsCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(upsertSettings).not.toHaveBeenCalled();
  });

  it("returns 200 for an Admin with valid arrays", async () => {
    const req: any = {
      role: "Admin",
      userId: 1,
      organizationId: 7,
      body: { recipient_user_ids: [2], recipient_emails: ["dpo@acme.com"] },
    };
    const res = mockRes();
    await updateSettingsCtrl(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(upsertSettings).toHaveBeenCalledWith(7, [2], ["dpo@acme.com"], 1, undefined);
  });
});

// ---------------------------------------------------------------------------
// POST /api/regulations-tracker/sync  [ADMIN]
// ---------------------------------------------------------------------------
describe("triggerSync", () => {
  it("returns 403 for a non-admin (gate fires before any sync work)", async () => {
    const req: any = { userId: 1, organizationId: 7, role: "Editor" };
    const res = mockRes();
    await triggerSync(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/regulations-tracker/settings — impact fields + has_llm_key
// ---------------------------------------------------------------------------
describe("getSettingsCtrl with impact fields", () => {
  it("includes has_llm_key=true when the org has a key", async () => {
    (getSettings as jest.Mock).mockResolvedValue({
      recipient_user_ids: [], recipient_emails: [], updated_by: null, updated_at: null,
      impact_enabled: true, last_impact_run_at: null,
    });
    (getMetaQuery as jest.Mock).mockResolvedValue({ last_run_at: null, last_run_status: null });
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([{ key: "k" }]);
    const req: any = { organizationId: 7, role: "Admin" };
    const res = mockRes();
    await getSettingsCtrl(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ has_llm_key: true, impact_enabled: true }) }),
    );
  });

  it("has_llm_key=false when the org has no key", async () => {
    (getSettings as jest.Mock).mockResolvedValue({
      recipient_user_ids: [], recipient_emails: [], updated_by: null, updated_at: null,
      impact_enabled: true, last_impact_run_at: null,
    });
    (getMetaQuery as jest.Mock).mockResolvedValue({ last_run_at: null, last_run_status: null });
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([]);
    const req: any = { organizationId: 7, role: "Admin" };
    const res = mockRes();
    await getSettingsCtrl(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ has_llm_key: false }) }),
    );
  });
});

// ---------------------------------------------------------------------------
// PUT /api/regulations-tracker/settings — impact_enabled passthrough
// ---------------------------------------------------------------------------
describe("updateSettingsCtrl with impact_enabled", () => {
  it("passes impact_enabled through to upsertSettings", async () => {
    (upsertSettings as jest.Mock).mockResolvedValue({});
    const req: any = {
      organizationId: 7, userId: 1, role: "Admin",
      body: { recipient_user_ids: [], recipient_emails: [], impact_enabled: false },
    };
    const res = mockRes();
    await updateSettingsCtrl(req, res);
    expect(upsertSettings).toHaveBeenCalledWith(7, [], [], 1, false);
  });
});

// ---------------------------------------------------------------------------
// GET /api/regulations-tracker/impact/:slug
// BUG 4: impact_enabled=false must return 200/null even when a row exists.
// BUG 6: handler must have logProcessing / logSuccess / logFailure.
// ---------------------------------------------------------------------------
describe("getImpactAnalysis", () => {
  it("returns 200 with the stored row when impact is enabled", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ impact_enabled: true });
    const req: any = { userId: 1, organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.data).not.toBeNull();
    expect(payload.data.status).toBe("ok");
  });

  // BUG 4: GET must honor impact_enabled toggle
  it("returns 200/null when impact_enabled is false, even though a row exists", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ impact_enabled: false });
    const req: any = { userId: 1, organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    // Must be null — impact disabled means no panel
    expect(payload.data).toBeNull();
    // getImpactRow must NOT have been called — settings check comes first
    expect(getImpactRow).not.toHaveBeenCalled();
  });

  it("returns 200/null when no row exists yet", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ impact_enabled: true });
    (getImpactRow as jest.Mock).mockResolvedValueOnce(null);
    const req: any = { userId: 1, organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json as jest.Mock).mock.calls[0][0].data).toBeNull();
  });

  it("returns 500 on unexpected error", async () => {
    (getSettings as jest.Mock).mockRejectedValueOnce(new Error("db down"));
    const req: any = { userId: 1, organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/regulations-tracker/impact/:slug/refresh  [ADMIN]
// BUG 2: refreshImpactAnalysis must call runImpactAnalysis with force=true.
// BUG 6: handler must have logProcessing / logSuccess / logFailure.
// ---------------------------------------------------------------------------
describe("refreshImpactAnalysis", () => {
  it("returns 403 for non-admin", async () => {
    const req: any = { userId: 1, organizationId: 7, role: "Editor", params: { slug: "eu" } };
    const res = mockRes();
    await refreshImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(runImpactAnalysis).not.toHaveBeenCalled();
  });

  it("returns 200/disabled when impact_enabled is false", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ impact_enabled: false });
    const req: any = { userId: 1, organizationId: 7, role: "Admin", params: { slug: "eu" } };
    const res = mockRes();
    await refreshImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json as jest.Mock).mock.calls[0][0].data.status).toBe("disabled");
    expect(runImpactAnalysis).not.toHaveBeenCalled();
  });

  // BUG 2: force=true must be passed so admin refresh is never silently no-op'd
  it("calls runImpactAnalysis with force=true for an Admin", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ impact_enabled: true });
    const req: any = { userId: 1, organizationId: 7, role: "Admin", params: { slug: "eu" } };
    const res = mockRes();
    await refreshImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    // Verify force=true was passed
    expect(runImpactAnalysis).toHaveBeenCalledWith(7, "eu", true);
  });

  it("returns 500 on unexpected error", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ impact_enabled: true });
    (runImpactAnalysis as jest.Mock).mockRejectedValueOnce(new Error("llm exploded"));
    const req: any = { userId: 1, organizationId: 7, role: "Admin", params: { slug: "eu" } };
    const res = mockRes();
    await refreshImpactAnalysis(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
