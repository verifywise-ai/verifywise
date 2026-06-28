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
  fetchCountryDetail: jest.fn().mockResolvedValue({ country: {}, meta: null }),
  fetchHorizon: jest.fn().mockResolvedValue({ changes: [] }),
  fetchDeadlines: jest.fn().mockResolvedValue({ deadlines: [], unscheduled: [] }),
  fetchSnapshot: jest.fn().mockResolvedValue({ frameworks: [] }),
}));

jest.mock("../../../../utils/regulationsTracker.utils", () => {
  const actual = jest.requireActual("../../../../utils/regulationsTracker.utils");
  return {
    ...actual,
    getMetaQuery: jest.fn(),
    upsertFeedTx: jest.fn(),
    getAffectedOrgsBySlugs: jest.fn(),
    getAllOrgAdmins: jest.fn().mockResolvedValue([]),
    resolveEmailRecipients: jest.fn(),
    resolveInAppUserIds: jest.fn(),
    getStoredHashes: jest.fn().mockResolvedValue(new Map()),
    setGlobalFeeds: jest.fn().mockResolvedValue(undefined),
    recordRunStatus: jest.fn().mockResolvedValue(undefined),
    getSettings: jest.fn().mockResolvedValue({ impact_enabled: true }),
    setLastImpactRunAt: jest.fn().mockResolvedValue(undefined),
    // keep the day-key helper and escapeHtml real
    currentIsoDay: actual.currentIsoDay,
    escapeHtml: actual.escapeHtml,
  };
});

jest.mock("../../../../utils/regulationImpact.utils", () => ({
  runImpactAnalysis: jest.fn().mockResolvedValue({ status: "ok", counts: {} }),
}));

jest.mock("../../../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn().mockResolvedValue([]),
}));

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
import * as impactUtils from "../../../../utils/regulationImpact.utils";
import * as llmKeyUtils from "../../../../utils/llmKey.utils";

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
const mockCreateNotification = notificationUtils.createNotificationQuery as jest.MockedFunction<
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

// Current UTC day key (real util so the daily guard fires correctly). The key is
// stored in the legacy-named last_run_week column. OTHER_WEEK is any value that
// can never equal today's day string, used by tests that must NOT hit the skip.
const THIS_WEEK = trackerUtils.currentIsoDay(new Date());
const OTHER_WEEK = "2000-01-01";

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
  it("skips and does not call validateManifest when the day key equals today (already ran)", async () => {
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
      newlyAdded: [],
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
      lines: ["AI Act: status draft → enacted", "AI Act: effective date 2026-01-01 → 2026-06-01"],
      unstructured: false,
      changeCount: 1,
      changeDates: [],
    };
    mockUpsert.mockResolvedValue({
      changed: [changedCountry],
      newlyAdded: [],
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

    // In-app notification created for user 99 in org 42, deep-linked to the
    // country page, with the change detail in the message.
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 99,
        action_url: "/regulations-tracker/fr",
        entity_name: "France",
        message: expect.stringContaining("status draft → enacted"),
      }),
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

  // 4. Multi-change note (#3): when a country changed more than once since last
  //    check, the in-app message notes the count + dates.
  it("notes multiple changes since last check in the in-app message", async () => {
    mockGetMeta.mockResolvedValue({
      seeded_at: "2026-01-01",
      last_good_count: 5,
      last_run_week: OTHER_WEEK,
    } as any);
    const country = { slug: "fr", name: "France", hash: "xyz", regulationCount: 2 };
    mockValidate.mockReturnValue(makeValidResult([country]));
    mockUpsert.mockResolvedValue({
      changed: [
        {
          slug: "fr",
          name: "France",
          lines: ["AI Act: status draft → enacted"],
          unstructured: false,
          changeCount: 3,
          changeDates: ["2026-06-10", "2026-05-02", "2026-04-01"],
        },
      ],
      newlyAdded: [],
      newlyRemoved: [],
      wasFirstSeed: false,
    });
    mockGetAffected.mockResolvedValue([
      { organization_id: 42, country_slug: "fr", name: "France" },
    ] as any);
    mockResolveInApp.mockResolvedValue([99]);
    mockResolveEmail.mockResolvedValue([]);
    mockCreateNotification.mockResolvedValue(undefined as any);

    await syncRegulationsTracker({ feed: DUMMY_FEED });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("changed 3 times since last check"),
      }),
      42,
    );
  });

  // 5. Impact analysis isolation: a throwing runImpactAnalysis must NOT break the sync.
  it("completes successfully even when runImpactAnalysis throws", async () => {
    const mockRunImpact = impactUtils.runImpactAnalysis as jest.MockedFunction<
      typeof impactUtils.runImpactAnalysis
    >;
    const mockGetLLMKeys = llmKeyUtils.getLLMKeysWithKeyQuery as jest.MockedFunction<
      typeof llmKeyUtils.getLLMKeysWithKeyQuery
    >;
    const mockRecordRunStatus = trackerUtils.recordRunStatus as jest.MockedFunction<
      typeof trackerUtils.recordRunStatus
    >;

    // Impact analysis always throws for this test.
    mockRunImpact.mockRejectedValue(new Error("LLM exploded"));
    // Org has a key → impact will be attempted.
    mockGetLLMKeys.mockResolvedValue([{ key: "k", name: "OpenAI", url: null, model: "m" } as any]);

    mockGetMeta.mockResolvedValue({
      seeded_at: "2026-01-01",
      last_good_count: 5,
      last_run_week: OTHER_WEEK,
    } as any);
    const country = { slug: "de", name: "Germany", hash: "abc", regulationCount: 1 };
    mockValidate.mockReturnValue(makeValidResult([country]));
    mockUpsert.mockResolvedValue({
      changed: [
        {
          slug: "de",
          name: "Germany",
          lines: ["AI Act: status draft → enacted"],
          unstructured: false,
          changeCount: 1,
          changeDates: [],
        },
      ],
      newlyAdded: [],
      newlyRemoved: [],
      wasFirstSeed: false,
    });
    mockGetAffected.mockResolvedValue([
      { organization_id: 42, country_slug: "de", name: "Germany" },
    ] as any);
    mockResolveInApp.mockResolvedValue([99]);
    mockResolveEmail.mockResolvedValue([]);
    mockCreateNotification.mockResolvedValue(undefined as any);

    // Should not throw.
    const result = await syncRegulationsTracker({ feed: DUMMY_FEED });

    // Sync completed and status was recorded as ok.
    expect(result.orgsNotified).toBe(1);
    expect(mockRecordRunStatus).toHaveBeenCalledWith(expect.stringContaining("ok"));
    // Notifications were still created despite impact throwing.
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 99 }),
      42,
    );
  });

  // Unstructured-change suppression: when the feed moved a country's hash but
  // carried no structured field-level diff, impact analysis must be skipped
  // entirely (no LLM call, no impact panel), while the plain change
  // notification still fires so the org knows the country changed.
  it("skips impact analysis for an unstructured change but still notifies", async () => {
    const mockRunImpact = impactUtils.runImpactAnalysis as jest.MockedFunction<
      typeof impactUtils.runImpactAnalysis
    >;
    const mockGetLLMKeys = llmKeyUtils.getLLMKeysWithKeyQuery as jest.MockedFunction<
      typeof llmKeyUtils.getLLMKeysWithKeyQuery
    >;

    // Org HAS a key and impact is enabled — so the ONLY reason to skip the LLM
    // is the change being unstructured.
    mockGetLLMKeys.mockResolvedValue([{ key: "k", name: "OpenAI", url: null, model: "m" } as any]);

    mockGetMeta.mockResolvedValue({
      seeded_at: "2026-01-01",
      last_good_count: 5,
      last_run_week: OTHER_WEEK,
    } as any);
    const country = { slug: "de", name: "Germany", hash: "abc", regulationCount: 1 };
    mockValidate.mockReturnValue(makeValidResult([country]));
    mockUpsert.mockResolvedValue({
      changed: [
        {
          slug: "de",
          name: "Germany",
          // No structured lines — the hash moved but the feed gave no field diff.
          lines: [],
          unstructured: true,
          changeCount: 1,
          changeDates: [],
        },
      ],
      newlyAdded: [],
      newlyRemoved: [],
      wasFirstSeed: false,
    });
    mockGetAffected.mockResolvedValue([
      { organization_id: 42, country_slug: "de", name: "Germany" },
    ] as any);
    mockResolveInApp.mockResolvedValue([99]);
    // Email recipient present too, to exercise the email backfill gate.
    mockResolveEmail.mockResolvedValue(["admin@acme.com"]);
    mockSendEmail.mockResolvedValue(undefined as any);
    mockCreateNotification.mockResolvedValue(undefined as any);

    const result = await syncRegulationsTracker({ feed: DUMMY_FEED });

    // The LLM was never invoked for an unstructured change — neither the in-app
    // pass nor the email backfill should have called it.
    expect(mockRunImpact).not.toHaveBeenCalled();

    // The org is still told the country changed (plain notification, no
    // "Impact:" suffix, and no "Configure an LLM key" nudge since a key would
    // not have produced a panel here anyway).
    expect(result.orgsNotified).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    const notifArg = mockCreateNotification.mock.calls[0][0] as { message: string };
    expect(notifArg.message).not.toContain("Impact:");
    expect(notifArg.message).not.toContain("Configure an LLM key");

    // Email still goes out, but with no impact section.
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const htmlArg = mockSendEmail.mock.calls[0][2] as string;
    const vars = JSON.parse(htmlArg);
    expect(vars.impactSection ?? "").toBe("");
  });

  // BUG 5: Cap counting — cache hits must NOT increment impactAnalysesRun so they
  // don't starve countries that need real LLM analysis.
  it("does not count cache hits against the per-run impact cap", async () => {
    const mockRunImpact = impactUtils.runImpactAnalysis as jest.MockedFunction<
      typeof impactUtils.runImpactAnalysis
    >;
    const mockGetLLMKeys = llmKeyUtils.getLLMKeysWithKeyQuery as jest.MockedFunction<
      typeof llmKeyUtils.getLLMKeysWithKeyQuery
    >;

    // Org has a key → impact will be attempted.
    mockGetLLMKeys.mockResolvedValue([{ key: "k", name: "OpenAI", url: null, model: "m" } as any]);

    mockGetMeta.mockResolvedValue({
      seeded_at: "2026-01-01",
      last_good_count: 5,
      last_run_week: OTHER_WEEK,
    } as any);

    // Two changed countries — fr (cached) and de (real LLM run)
    const countries = [
      { slug: "fr", name: "France", hash: "xyz", regulationCount: 2 },
      { slug: "de", name: "Germany", hash: "abc", regulationCount: 1 },
    ];
    mockValidate.mockReturnValue(makeValidResult(countries));
    mockUpsert.mockResolvedValue({
      changed: [
        {
          slug: "fr",
          name: "France",
          lines: ["status draft → enacted"],
          unstructured: false,
          changeCount: 1,
          changeDates: [],
        },
        {
          slug: "de",
          name: "Germany",
          lines: ["status draft → enacted"],
          unstructured: false,
          changeCount: 1,
          changeDates: [],
        },
      ],
      newlyAdded: [],
      newlyRemoved: [],
      wasFirstSeed: false,
    });
    mockGetAffected.mockResolvedValue([
      { organization_id: 42, country_slug: "fr", name: "France" },
      { organization_id: 42, country_slug: "de", name: "Germany" },
    ]);
    mockResolveInApp.mockResolvedValue([99]);
    mockResolveEmail.mockResolvedValue([]);
    mockCreateNotification.mockResolvedValue(undefined as any);

    // France is a cache hit, Germany is a real LLM run
    mockRunImpact
      .mockResolvedValueOnce({ status: "ok", counts: {}, cached: true } as any) // France (cache)
      .mockResolvedValueOnce({ status: "ok", counts: {}, cached: false } as any); // Germany (real)

    await syncRegulationsTracker({ feed: DUMMY_FEED });

    // runImpactAnalysis was called for both countries
    expect(mockRunImpact).toHaveBeenCalledTimes(2);
    // Both notifications sent (cap not hit; only 1 real run counted)
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
  });

  // BUG 5b: no_key and skipped_no_candidates must NOT increment impactAnalysesRun.
  // A sync covering orgs with no LLM key or no matching candidates must not exhaust
  // the per-run cap and starve later orgs that need real analysis.
  it("does not count no_key or skipped_no_candidates passes against the per-run impact cap", async () => {
    const mockRunImpact = impactUtils.runImpactAnalysis as jest.MockedFunction<
      typeof impactUtils.runImpactAnalysis
    >;
    const mockGetLLMKeys = llmKeyUtils.getLLMKeysWithKeyQuery as jest.MockedFunction<
      typeof llmKeyUtils.getLLMKeysWithKeyQuery
    >;

    mockGetLLMKeys.mockResolvedValue([{ key: "k", name: "OpenAI", url: null, model: "m" } as any]);

    mockGetMeta.mockResolvedValue({
      seeded_at: "2026-01-01",
      last_good_count: 5,
      last_run_week: OTHER_WEEK,
    } as any);

    // Three changed countries: no_key, skipped_no_candidates, then a real LLM run.
    const countries = [
      { slug: "aa", name: "Alpha", hash: "h1", regulationCount: 1 },
      { slug: "bb", name: "Beta", hash: "h2", regulationCount: 1 },
      { slug: "cc", name: "Gamma", hash: "h3", regulationCount: 1 },
    ];
    mockValidate.mockReturnValue(makeValidResult(countries));
    mockUpsert.mockResolvedValue({
      changed: [
        {
          slug: "aa",
          name: "Alpha",
          lines: ["a"],
          unstructured: false,
          changeCount: 1,
          changeDates: [],
        },
        {
          slug: "bb",
          name: "Beta",
          lines: ["b"],
          unstructured: false,
          changeCount: 1,
          changeDates: [],
        },
        {
          slug: "cc",
          name: "Gamma",
          lines: ["c"],
          unstructured: false,
          changeCount: 1,
          changeDates: [],
        },
      ],
      newlyAdded: [],
      newlyRemoved: [],
      wasFirstSeed: false,
    });
    mockGetAffected.mockResolvedValue([
      { organization_id: 42, country_slug: "aa", name: "Alpha" },
      { organization_id: 42, country_slug: "bb", name: "Beta" },
      { organization_id: 42, country_slug: "cc", name: "Gamma" },
    ]);
    mockResolveInApp.mockResolvedValue([99]);
    mockResolveEmail.mockResolvedValue([]);
    mockCreateNotification.mockResolvedValue(undefined as any);

    // First two return non-LLM statuses (cached: false but no LLM call made)
    mockRunImpact
      .mockResolvedValueOnce({ status: "no_key", result: null, counts: {}, cached: false } as any)
      .mockResolvedValueOnce({
        status: "skipped_no_candidates",
        result: null,
        counts: {},
        cached: false,
      } as any)
      .mockResolvedValueOnce({ status: "ok", counts: {}, cached: false } as any); // real LLM run

    await syncRegulationsTracker({ feed: DUMMY_FEED });

    // All three countries were processed — cap was NOT exhausted by the non-LLM passes
    expect(mockRunImpact).toHaveBeenCalledTimes(3);
    // Notifications sent for all three tracked orgs
    expect(mockCreateNotification).toHaveBeenCalledTimes(3);
  });

  // 6. New-country awareness (#4): brand-new countries notify each org's admins.
  it("notifies org admins when a new country is added", async () => {
    mockGetMeta.mockResolvedValue({
      seeded_at: "2026-01-01",
      last_good_count: 5,
      last_run_week: OTHER_WEEK,
    } as any);
    const country = { slug: "newland", name: "Newland", hash: "n1", regulationCount: 1 };
    mockValidate.mockReturnValue(makeValidResult([country]));
    mockUpsert.mockResolvedValue({
      changed: [],
      newlyAdded: ["newland"],
      newlyRemoved: [],
      wasFirstSeed: false,
    });
    mockGetAffected.mockResolvedValue([]);
    (trackerUtils.getAllOrgAdmins as jest.Mock).mockResolvedValue([
      { organization_id: 7, user_id: 1 },
      { organization_id: 7, user_id: 2 },
    ]);
    mockCreateNotification.mockResolvedValue(undefined as any);

    await syncRegulationsTracker({ feed: DUMMY_FEED });

    // Both admins of org 7 get a deep-linked "new jurisdiction" notification.
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 1,
        action_url: "/regulations-tracker/newland",
        title: expect.stringContaining("New jurisdiction"),
      }),
      7,
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ user_id: 2 }), 7);
  });
});
