// jest.mock calls must precede all imports (hoisted by Jest).
jest.mock("../../utils/regulationsTracker.utils", () => ({
  listCountries: jest.fn().mockResolvedValue([{ slug: "eu", name: "European Union", region: "Europe" }]),
  getCountryRow: jest.fn().mockResolvedValue({ slug: "eu", data: { name: "European Union" } }),
  listTracked: jest.fn().mockResolvedValue([{ country_slug: "eu", name: "European Union" }]),
  trackCountry: jest.fn().mockResolvedValue({ tracked: true }),
  trackCountriesBulk: jest.fn().mockResolvedValue({ tracked: 2 }),
  untrackCountry: jest.fn().mockResolvedValue({ untracked: true }),
  getSettings: jest.fn().mockResolvedValue({ recipient_user_ids: [], recipient_emails: [], updated_by: null, updated_at: null }),
  upsertSettings: jest.fn().mockResolvedValue({ recipient_user_ids: [1], recipient_emails: ["dpo@acme.com"], updated_by: 1, updated_at: new Date() }),
}));

jest.mock("../../utils/regulationsTrackerFeed", () => ({
  fetchCountryDetail: jest.fn().mockResolvedValue({ name: "European Union", regulations: [] }),
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
} from "../regulationsTracker.ctrl";
import {
  listCountries,
  listTracked,
  trackCountry,
  trackCountriesBulk,
  untrackCountry,
  getCountryRow,
  upsertSettings,
} from "../../utils/regulationsTracker.utils";

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
      })
    );
  });

  it("passes region and q query params to the util", async () => {
    const req: any = { userId: 1, organizationId: 7, query: { region: "Europe", q: "gdpr" } };
    const res = mockRes();
    await getCountries(req, res);
    expect(listCountries).toHaveBeenCalledWith({ region: "Europe", q: "gdpr" });
  });
});

// ---------------------------------------------------------------------------
// GET /api/regulations-tracker/countries/:slug
// ---------------------------------------------------------------------------
describe("getCountryDetail", () => {
  it("returns 200 with live data when fetchCountryDetail succeeds", async () => {
    const req: any = { userId: 1, organizationId: 7, params: { slug: "eu" } };
    const res = mockRes();
    await getCountryDetail(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(getCountryRow).toHaveBeenCalledWith("eu");
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
      .mockResolvedValueOnce([{ country_slug: "eu" }])   // org A
      .mockResolvedValueOnce([{ country_slug: "us" }]);   // org B

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
    const req: any = { role: "Reviewer", userId: 1, organizationId: 7, body: { slugs: ["eu", "us"] } };
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
    const req: any = { role: "Admin", userId: 1, organizationId: 7, params: { slug: "never-tracked" } };
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
    expect(upsertSettings).toHaveBeenCalledWith(7, [2], ["dpo@acme.com"], 1);
  });
});
