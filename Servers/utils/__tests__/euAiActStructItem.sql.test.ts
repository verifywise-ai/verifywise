import { structItemInEuAiActSql, structItemInFrameworkSql } from "../euAiActStructItem.sql";

describe("EU AI Act struct item framework", () => {
  it("places an item in the framework it moved to, else in the EU AI Act", () => {
    expect(structItemInFrameworkSql("q", "pf.framework_id")).toBe(
      "COALESCE(q.moved_to_framework_id, 1) = pf.framework_id",
    );
  });

  it("keeps an item in the EU AI Act only while it has not moved", () => {
    expect(structItemInEuAiActSql("cs")).toBe("COALESCE(cs.moved_to_framework_id, 1) = 1");
  });
});
