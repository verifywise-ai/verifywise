// Servers/utils/__tests__/aiTrustIndexFeed.test.ts
import { validateFeed } from "../aiTrustIndexFeed";

const app = (slug: string) => ({
  slug,
  name: slug,
  vendor: "V",
  domain: `${slug}.com`,
  category: "Assistant",
  scoreOutOf100: 50,
  letterGrade: "C",
  displayedGrade: "C",
  confidence: "High",
  dealbreakerFlags: [],
  summary: "s",
  highlights: [],
  policyUrl: "https://x.com",
  policyLastUpdated: null,
  modalities: ["text"],
  processesBiometrics: false,
});
const feed = (n: number, extra = {}) => ({
  feedVersion: 1,
  count: n,
  apps: Array.from({ length: n }, (_, i) => app(`a${i}`)),
  ...extra,
});

describe("validateFeed", () => {
  it("accepts a healthy feed", () => {
    const r = validateFeed(feed(37), 37);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.apps).toHaveLength(37);
  });
  it("accepts feedVersion 2 (backward-compatible: adds per-app history)", () => {
    const v2 = feed(37, { feedVersion: 2 });
    v2.apps.forEach(
      (a: any) =>
        (a.history = {
          firstAssessed: "2026-06-20",
          lastChecked: "2026-06-20",
          assessmentCount: 1,
          scoreHistory: [{ date: "2026-06-20", score: 50, grade: "C" }],
        }),
    );
    const r = validateFeed(v2, 37);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.apps).toHaveLength(37);
  });
  it("rejects an unsupported (newer) feedVersion", () => {
    expect(validateFeed(feed(37, { feedVersion: 3 }), 37)).toMatchObject({ ok: false });
    expect(validateFeed(feed(37, { feedVersion: "2" }), 37)).toMatchObject({ ok: false });
  });
  it("rejects when count !== apps.length", () => {
    expect(validateFeed({ feedVersion: 1, count: 99, apps: [app("a")] }, 37)).toMatchObject({
      ok: false,
    });
  });
  it("rejects an empty / below-absolute-floor feed", () => {
    expect(validateFeed(feed(0), 37)).toMatchObject({ ok: false });
    expect(validateFeed(feed(5), 37)).toMatchObject({ ok: false }); // < 10 absolute floor
  });
  it("rejects a feed below 50% of last good count", () => {
    expect(validateFeed(feed(15), 40)).toMatchObject({ ok: false }); // 15 < 20
  });
  it("accepts when no prior good count exists (first seed) if above absolute floor", () => {
    expect(validateFeed(feed(12), null)).toMatchObject({ ok: true });
  });
  it("drops individual apps missing required fields but keeps the run", () => {
    const bad = feed(12);
    delete (bad.apps[0] as any).slug;
    const r = validateFeed(bad, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.apps).toHaveLength(11);
  });
  it("returns presentSlugs for ALL present apps, including ones dropped for a missing field", () => {
    // a0 is present but missing a required field (category) — it should be
    // dropped from `apps` yet still appear in `presentSlugs` so the sync won't
    // treat it as removed.
    const bad = feed(12);
    delete (bad.apps[0] as any).category;
    const r = validateFeed(bad, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.apps).toHaveLength(11);
      expect(r.apps.map((a) => a.slug)).not.toContain("a0");
      expect(r.presentSlugs).toHaveLength(12);
      expect(r.presentSlugs).toContain("a0"); // dropped-but-present
    }
  });
  it("returns rawCount = total raw feed length even when apps are dropped", () => {
    const bad = feed(12);
    delete (bad.apps[0] as any).category; // dropped for a missing field
    const r = validateFeed(bad, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.apps).toHaveLength(11); // one dropped
      expect(r.rawCount).toBe(12); // but rawCount reflects the full feed
    }
  });
  it("normalizes presentSlugs (trim + lowercase) and skips non-string slugs", () => {
    const f = feed(12);
    (f.apps[1] as any).slug = "  MixedCase  ";
    delete (f.apps[2] as any).slug; // missing slug entirely → excluded from presentSlugs
    const r = validateFeed(f, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.presentSlugs).toContain("mixedcase");
      expect(r.presentSlugs).toHaveLength(11); // a2 had no slug
    }
  });
  it("preserves an app's indicators map through validation", () => {
    const f = feed(12);
    (f.apps[0] as any).indicators = {
      "D1.1": { award: "full" },
      "D2.2": { award: "zero", subFlag: "SILENT" },
    };
    const r = validateFeed(f, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const a0 = r.apps.find((a) => a.slug === "a0") as any;
      expect(a0.indicators["D1.1"].award).toBe("full");
      expect(a0.indicators["D2.2"].subFlag).toBe("SILENT");
    }
  });
});
