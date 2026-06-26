import { sectionMjml } from "../syncRegulationsTracker";

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
