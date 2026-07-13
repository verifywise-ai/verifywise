jest.mock("../../../utils/aiTrustIndex.utils");
jest.mock("../../emailService", () => ({
  sendAutomationEmail: jest.fn().mockResolvedValue(undefined),
}));

import { syncAiTrustIndex, escapeHtml, sectionMjml } from "../actions/syncAiTrustIndex";
import * as utils from "../../../utils/aiTrustIndex.utils";
import { sendAutomationEmail } from "../../emailService";

const feedApp = (slug: string, grade = "B") => ({
  slug,
  name: slug,
  vendor: "V",
  domain: `${slug}.com`,
  category: "Assistant",
  scoreOutOf100: 80,
  letterGrade: grade,
  displayedGrade: grade,
  confidence: "High",
  dealbreakerFlags: [],
  summary: "s",
  highlights: [],
  policyUrl: "https://x.com",
  policyLastUpdated: null,
  modalities: ["text"],
  processesBiometrics: false,
});
const feed = {
  feedVersion: 1,
  count: 12,
  apps: Array.from({ length: 12 }, (_, i) => feedApp(`a${i}`)),
};

describe("syncAiTrustIndex", () => {
  beforeEach(() => jest.clearAllMocks());

  it("seeds silently on first run (no emails)", async () => {
    (utils.getMetaQuery as jest.Mock).mockResolvedValue({
      seeded_at: null,
      last_good_count: null,
      last_run_week: null,
    });
    (utils.upsertFeedTx as jest.Mock).mockResolvedValue({
      materialChanged: [{ slug: "a0", changes: ["grade A → B"] }],
      newlyRemoved: [],
      wasFirstSeed: true,
    });
    const r = await syncAiTrustIndex({ feed });
    expect(sendAutomationEmail).not.toHaveBeenCalled();
    expect(r.orgsEmailed).toBe(0);
  });

  it("emails affected orgs on a subsequent run", async () => {
    (utils.getMetaQuery as jest.Mock).mockResolvedValue({
      seeded_at: new Date(),
      last_good_count: 12,
      last_run_week: "2026-W10",
    });
    (utils.upsertFeedTx as jest.Mock).mockResolvedValue({
      materialChanged: [{ slug: "a0", changes: ["grade A → B", "policy updated"] }],
      newlyRemoved: ["a9"],
      wasFirstSeed: false,
    });
    (utils.getAffectedOrgsBySlugs as jest.Mock).mockResolvedValue([
      { organization_id: 7, app_slug: "a0", name: "App Zero" },
      { organization_id: 7, app_slug: "a9", name: "App Nine" },
    ]);
    (utils.resolveRecipients as jest.Mock).mockResolvedValue(["admin@acme.com"]);
    const r = await syncAiTrustIndex({ feed });
    expect(sendAutomationEmail).toHaveBeenCalledTimes(1);
    expect(r.orgsEmailed).toBe(1);
  });

  it("no-ops if already run this ISO week", async () => {
    const thisWeek = (utils as any).currentIsoWeek?.(new Date()) ?? "2026-W25";
    (utils.currentIsoWeek as jest.Mock).mockReturnValue(thisWeek);
    (utils.getMetaQuery as jest.Mock).mockResolvedValue({
      seeded_at: new Date(),
      last_good_count: 12,
      last_run_week: thisWeek,
    });
    const r = await syncAiTrustIndex({ feed });
    expect(utils.upsertFeedTx).not.toHaveBeenCalled();
    expect(r.skipped).toBeDefined();
  });

  it("aborts and writes nothing on a bad feed", async () => {
    (utils.getMetaQuery as jest.Mock).mockResolvedValue({
      seeded_at: new Date(),
      last_good_count: 40,
      last_run_week: "2026-W10",
    });
    const r = await syncAiTrustIndex({ feed: { feedVersion: 2, count: 0, apps: [] } });
    expect(utils.upsertFeedTx).not.toHaveBeenCalled();
    expect(sendAutomationEmail).not.toHaveBeenCalled();
    expect(r.skipped).toBeDefined();
  });
});

describe("email HTML escaping", () => {
  it("escapes HTML metacharacters", () => {
    expect(escapeHtml("<b>x</b> & \"y\" 'z'")).toBe(
      "&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot; &#39;z&#39;",
    );
  });
  it("renders an item's name HTML-escaped inside the MJML section", () => {
    const mjml = sectionMjml("Changed", [{ name: "<b>evil</b>" }]);
    expect(mjml).toContain("&lt;b&gt;evil&lt;/b&gt;");
    expect(mjml).not.toContain("<b>evil</b>");
  });
  it("renders the app name with its change detail (name — detail)", () => {
    const mjml = sectionMjml("Changed", [{ name: "Paxton AI", detail: "now grade B" }]);
    expect(mjml).toContain("Paxton AI — now grade B");
  });
  it("renders just the name when no detail is given", () => {
    const mjml = sectionMjml("No longer assessed", [{ name: "Leonardo AI" }]);
    expect(mjml).toContain("Leonardo AI");
    expect(mjml).not.toContain("—");
  });
  it("returns empty string for no items", () => {
    expect(sectionMjml("Changed", [])).toBe("");
  });
});
