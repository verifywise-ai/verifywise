import { renderChangeLine, currentIsoWeek, escapeHtml } from "../regulationsTracker.utils";

describe("renderChangeLine", () => {
  it("renders status change", () => {
    expect(renderChangeLine({ field: "regulation.status", regulation: "EU AI Act", from: "proposed", to: "in-force" }))
      .toBe("EU AI Act: status proposed → in-force");
  });
  it("renders effective date change", () => {
    expect(renderChangeLine({ field: "regulation.effectiveDate", regulation: "X", from: "2024", to: "2026" }))
      .toBe("X: effective date 2024 → 2026");
  });
  it("renders added/removed", () => {
    expect(renderChangeLine({ field: "regulation", change: "added", value: "New Bill" })).toBe("Added: New Bill");
    expect(renderChangeLine({ field: "regulation", change: "removed", value: "Old Bill" })).toBe("Removed: Old Bill");
  });
});

describe("currentIsoWeek", () => {
  it("returns YYYY-Www format", () => {
    expect(currentIsoWeek(new Date("2026-06-25T00:00:00Z"))).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe("escapeHtml", () => {
  it("escapes HTML metacharacters", () => {
    expect(escapeHtml('<b>"&\'')).toBe("&lt;b&gt;&quot;&amp;&#39;");
  });
});
