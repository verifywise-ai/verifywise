import { validateManifest, ABSOLUTE_FLOOR } from "../regulationsTrackerFeed";

function makeCountry(slug: string) {
  return { slug, name: slug, region: "europe", regulationCount: 1, hash: "sha256-x", history: null, url: `/c/${slug}` };
}
function manifest(n: number, extra: Record<string, unknown> = {}) {
  return {
    feedVersion: 1,
    generatedAt: "2026-06-25T00:00:00Z",
    counts: { countries: n },
    countries: Array.from({ length: n }, (_, i) => makeCountry("c" + i)),
    ...extra,
  };
}

describe("validateManifest", () => {
  it("rejects wrong feedVersion", () => {
    const r = validateManifest(manifest(30, { feedVersion: 2 }), null);
    expect(r.ok).toBe(false);
  });
  it("rejects below absolute floor", () => {
    const r = validateManifest(manifest(ABSOLUTE_FLOOR - 1), null);
    expect(r.ok).toBe(false);
  });
  it("rejects below 50% of last good count", () => {
    const r = validateManifest(manifest(30), 100);
    expect(r.ok).toBe(false);
  });
  it("accepts a healthy feed and returns presentSlugs + rawCount", () => {
    const r = validateManifest(manifest(30), 40);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.countries.length).toBe(30);
      expect(r.presentSlugs.length).toBe(30);
      expect(r.rawCount).toBe(30);
    }
  });
  it("keeps a present-but-malformed country in presentSlugs but not in valid countries", () => {
    const m = manifest(25);
    (m.countries as any[]).push({ slug: "broken" }); // missing hash/name
    m.counts.countries = m.countries.length;
    const r = validateManifest(m, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.presentSlugs).toContain("broken");
      expect(r.countries.find((c) => c.slug === "broken")).toBeUndefined();
    }
  });
});
