import { sectionMjml, syncRegulationsTracker } from "../syncRegulationsTracker";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// jest.mock paths are resolved relative to the TEST FILE, not the source file.
// Test file is at: services/automations/actions/__tests__/
// Source file is at: services/automations/actions/
// utils/ is at: utils/  (4 levels up from __tests__)

jest.mock("../../../../utils/regulationsTrackerFeed", () => ({
  fetchManifest: jest.fn(),
  validateManifest: jest.fn(),
}));

jest.mock("../../../../utils/regulationsTracker.utils", () => {
  const actual = jest.requireActual("../../../../utils/regulationsTracker.utils");
  return {
    ...actual,
    getMetaQuery: jest.fn(),
    upsertFeedTx: jest.fn(),
    getAffectedOrgsBySlugs: jest.fn(),
    resolveEmailRecipients: jest.fn(),
    resolveInAppUserIds: jest.fn(),
    // keep currentIsoWeek and escapeHtml real
    currentIsoWeek: actual.currentIsoWeek,
    escapeHtml: actual.escapeHtml,
  };
});

jest.mock("../../../emailService", () => ({
  sendAutomationEmail: jest.fn(),
}));

jest.mock("../../../../utils/notification.utils", () => ({
  createNotificationQuery: jest.fn(),
}));

// compileMjmlToHtml returns a JSON string of the injected vars so we can
// assert on the detail text in the email body without needing a real MJML file.
jest.mock("../../../../tools/mjmlCompiler", () => ({
  compileMjmlToHtml: jest.fn((_template: string, vars: Record<string, string>) =>
    JSON.stringify(vars),
  ),
}));

// ---------------------------------------------------------------------------
// Imports after mocks are registered
// ---------------------------------------------------------------------------

import * as feedUtils from "../../../../utils/regulationsTrackerFeed";
import * as trackerUtils from "../../../../utils/regulationsTracker.utils";
import * as emailService from "../../../emailService";
import * as notificationUtils from "../../../../utils/notification.utils";

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------

const mockGetMeta = trackerUtils.getMetaQuery as jest.MockedFunction<
  typeof trackerUtils.getMetaQuery
>;
const mockUpsert = trackerUtils.upsertFeedTx as jest.MockedFunction<
  typeof trackerUtils.upsertFeedTx
>;
const mockGetAffected = trackerUtils.getAffectedOrgsBySlugs as jest.MockedFunction<
  typeof trackerUtils.getAffectedOrgsBySlugs
>;
const mockResolveEmail = trackerUtils.resolveEmailRecipients as jest.MockedFunction<
  typeof trackerUtils.resolveEmailRecipients
>;
const mockResolveInApp = trackerUtils.resolveInAppUserIds as jest.MockedFunction<
  typeof trackerUtils.resolveInAppUserIds
>;
const mockValidate = feedUtils.validateManifest as jest.MockedFunction<
  typeof feedUtils.validateManifest
>;
const mockSendEmail = emailService.sendAutomationEmail as jest.MockedFunction<
  typeof emailService.sendAutomationEmail
>;
const mockCreateNotification =
  notificationUtils.createNotificationQuery as jest.MockedFunction<
    typeof notificationUtils.createNotificationQuery
  >;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

// Minimal feed injected via deps.feed — keeps fetchManifest uncalled.
const DUMMY_FEED = { version: 1, countries: [] };

// Build a ValidateResult for a valid feed.
function makeValidResult(countries: any[] = []) {
  return {
    ok: true as const,
    countries,
    presentSlugs: countries.map((c: any) => c.slug),
    rawCount: countries.length,
  };
}

// Current ISO week (real util so the guard fires correctly).
const THIS_WEEK = trackerUtils.currentIsoWeek(new Date());
const OTHER_WEEK = "2000-W01";

// ---------------------------------------------------------------------------
// sectionMjml — existing tests (preserved)
// ---------------------------------------------------------------------------

describe("sectionMjml", () => {
  it("returns empty string for no items", () => {
    expect(sectionMjml("Changed", [])).toBe("");
  });
  it("escapes item names and renders bullet lines", () => {
    const out = sectionMjml("Changed", [{ name: "<EU>", detail: "status a → b" }]);
    expect(out).toContain("&lt;EU&gt;");
    expect(out).toContain("status a → b");
  });
});

// ---------------------------------------------------------------------------
// syncRegulationsTracker — job-level tests
// ---------------------------------------------------------------------------

describe("syncRegulationsTracker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Week-guard skip
  // -------------------------------------------------------------------------
  it("skips and does not call validateManifest when last_run_week equals current ISO week", async () => {
    mockGetMeta.mockResolvedValue({
      seeded_at: "2026-01-01",
      last_good_count: 10,
      last_run_week: THIS_WEEK,
    });

    const result = await syncRegulationsTracker({ feed: DUMMY_FEED });

    expect(result.skipped).toMatch(THIS_WEEK);
    expect(result.orgsEmailed).toBe(0);
    expect(result.orgsNotified).toBe(0);
    expect(mockValidate).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. First-seed suppression
  // -------------------------------------------------------------------------
  it("suppresses email and in-app notifications on first seed", async () => {
    mockGetMeta.mockResolvedValue({
      seeded_at: null,
      last_good_count: null,
      last_run_week: OTHER_WEEK,
    });

    const country = { slug: "de", name: "Germany", hash: "abc", regulationCount: 1 };
    mockValidate.mockReturnValue(makeValidResult([country]));
    mockUpsert.mockResolvedValue({
      changed: [],
      newlyRemoved: [],
      wasFirstSeed: true,
    });

    const result = await syncRegulationsTracker({ feed: DUMMY_FEED });

    expect(result.orgsEmailed).toBe(0);
    expect(result.orgsNotified).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Changed-country path — email + in-app + detail uses joined lines
  // -------------------------------------------------------------------------
  it("sends email and in-app notification with joined lines as detail for a changed country", async () => {
    mockGetMeta.mockResolvedValue({
      seeded_at: "2026-01-01",
      last_good_count: 5,
      last_run_week: OTHER_WEEK,
    });

    const country = { slug: "fr", name: "France", hash: "xyz", regulationCount: 2 };
    mockValidate.mockReturnValue(makeValidResult([country]));

    // Two change lines — the digest detail must join them with ", ".
    const changedCountry: trackerUtils.CountryChange = {
      slug: "fr",
      name: "France",
      lines: [
        "AI Act: status draft → enacted",
        "AI Act: effective date 2026-01-01 → 2026-06-01",
      ],
      unstructured: false,
    };
    mockUpsert.mockResolvedValue({
      changed: [changedCountry],
      newlyRemoved: [],
      wasFirstSeed: false,
    });

    // One org (id=42) tracks France.
    mockGetAffected.mockResolvedValue([
      { organization_id: 42, country_slug: "fr", name: "France" },
    ]);

    // In-app: one user (id=99).
    mockResolveInApp.mockResolvedValue([99]);
    mockCreateNotification.mockResolvedValue(undefined as any);

    // Email: one recipient.
    mockResolveEmail.mockResolvedValue(["admin@acme.com"]);
    mockSendEmail.mockResolvedValue(undefined as any);

    const result = await syncRegulationsTracker({ feed: DUMMY_FEED });

    // Return counters.
    expect(result.orgsEmailed).toBe(1);
    expect(result.orgsNotified).toBe(1);
    expect(result.changed).toBe(1);
    expect(result.newlyRemoved).toBe(0);

    // In-app notification created for user 99 in org 42.
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 99 }),
      42,
    );

    // Email sent to the right recipient.
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      ["admin@acme.com"],
      expect.any(String),
      expect.any(String),
      undefined,
    );

    // The HTML passed to sendAutomationEmail is the JSON of compileMjmlToHtml's
    // vars (our mock serializes them). The changedSection must contain both the
    // country name and the full joined lines string — proving the Critical fix.
    const htmlArg = mockSendEmail.mock.calls[0][2] as string;
    const vars = JSON.parse(htmlArg);
    const expectedDetail = changedCountry.lines.join(", ");
    expect(vars.changedSection).toContain("France");
    expect(vars.changedSection).toContain(expectedDetail);
  });
});
