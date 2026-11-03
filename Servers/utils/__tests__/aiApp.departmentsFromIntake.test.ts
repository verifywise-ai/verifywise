import { describe, expect, it } from "@jest/globals";
import { aiAppDepartmentsFrom } from "../aiApp.utils";

describe("aiAppDepartmentsFrom (#5193)", () => {
  it("reads a multi-select answer", () => {
    expect(aiAppDepartmentsFrom(["Sales", "Support"])).toEqual([
      { department: "Sales", user_count: 0 },
      { department: "Support", user_count: 0 },
    ]);
  });

  it("splits comma-separated text, trims and drops duplicates and blanks", () => {
    expect(aiAppDepartmentsFrom(" Sales , Support,Sales, ,")).toEqual([
      { department: "Sales", user_count: 0 },
      { department: "Support", user_count: 0 },
    ]);
  });

  it("drops values that are not text or are longer than the column allows", () => {
    expect(aiAppDepartmentsFrom(["x".repeat(256), 42, "Legal"])).toEqual([
      { department: "Legal", user_count: 0 },
    ]);
    expect(aiAppDepartmentsFrom(undefined)).toEqual([]);
    expect(aiAppDepartmentsFrom(7)).toEqual([]);
  });
});
