import {
  renderChangeLine,
  currentIsoWeek,
  currentIsoDay,
  escapeHtml,
  countChangesSince,
} from "../regulationsTracker.utils";

describe("renderChangeLine", () => {
  it("renders status change", () => {
    expect(
      renderChangeLine({
        field: "regulation.status",
        regulation: "EU AI Act",
        from: "proposed",
        to: "in-force",
      }),
    ).toBe("EU AI Act: status proposed → in-force");
  });
  it("renders effective date change", () => {
    expect(
      renderChangeLine({
        field: "regulation.effectiveDate",
        regulation: "X",
        from: "2024",
        to: "2026",
      }),
    ).toBe("X: effective date 2024 → 2026");
  });
  it("renders added/removed", () => {
    expect(renderChangeLine({ field: "regulation", change: "added", value: "New Bill" })).toBe(
      "Added: New Bill",
    );
    expect(renderChangeLine({ field: "regulation", change: "removed", value: "Old Bill" })).toBe(
      "Removed: Old Bill",
    );
  });
});

describe("currentIsoWeek", () => {
  it("returns YYYY-Www format", () => {
    expect(currentIsoWeek(new Date("2026-06-25T00:00:00Z"))).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe("currentIsoDay", () => {
  it("returns the UTC calendar day as YYYY-MM-DD", () => {
    expect(currentIsoDay(new Date("2026-06-29T13:45:00Z"))).toBe("2026-06-29");
  });
  it("uses UTC, not local time, near a day boundary", () => {
    expect(currentIsoDay(new Date("2026-06-29T23:59:59Z"))).toBe("2026-06-29");
  });
  it("fits the legacy last_run_week VARCHAR(10) width", () => {
    expect(currentIsoDay(new Date("2026-06-29T00:00:00Z")).length).toBe(10);
  });
});

describe("escapeHtml", () => {
  it("escapes HTML metacharacters", () => {
    expect(escapeHtml("<b>\"&'")).toBe("&lt;b&gt;&quot;&amp;&#39;");
  });
});

describe("countChangesSince", () => {
  const hist = (entries: { date: string; hash: string }[]) =>
    ({
      firstAssessed: "",
      lastChanged: "",
      lastChecked: "",
      assessmentCount: entries.length,
      hashHistory: entries.map((e) => ({ ...e, regulationCount: 0 })),
      lastChange: null,
    }) as any;

  it("returns count 1 and no dates when there is no hashHistory", () => {
    expect(countChangesSince(null, "h1")).toEqual({ count: 1, dates: [] });
    expect(countChangesSince(hist([]), "h1")).toEqual({ count: 1, dates: [] });
  });

  it("counts only assessments newer than the stored hash, newest date first", () => {
    const h = hist([
      { date: "2026-01-01", hash: "h1" },
      { date: "2026-02-01", hash: "h2" },
      { date: "2026-03-01", hash: "h3" },
      { date: "2026-04-01", hash: "h4" },
    ]);
    // Stored at h2 -> h3 and h4 are newer (2 changes), newest first.
    expect(countChangesSince(h, "h2")).toEqual({
      count: 2,
      dates: ["2026-04-01", "2026-03-01"],
    });
  });

  it("treats a single change since stored hash as count 1", () => {
    const h = hist([
      { date: "2026-01-01", hash: "h1" },
      { date: "2026-02-01", hash: "h2" },
    ]);
    expect(countChangesSince(h, "h1")).toEqual({ count: 1, dates: ["2026-02-01"] });
  });

  it("falls back to the latest entry when the stored hash is not found", () => {
    const h = hist([
      { date: "2026-01-01", hash: "h1" },
      { date: "2026-02-01", hash: "h2" },
    ]);
    // Unknown stored hash (e.g. our row predates this history) -> report the latest.
    expect(countChangesSince(h, "stale-unknown")).toEqual({ count: 1, dates: ["2026-02-01"] });
  });

  it("falls back to the latest entry when there is no stored hash", () => {
    const h = hist([
      { date: "2026-01-01", hash: "h1" },
      { date: "2026-02-01", hash: "h2" },
    ]);
    expect(countChangesSince(h, undefined)).toEqual({ count: 1, dates: ["2026-02-01"] });
  });
});
