import { describe, it, expect } from "vitest";
import { includesEuAiAct } from "../frameworks";

describe("includesEuAiAct", () => {
  it("recognises form options, stored framework rows, ids and names", () => {
    expect(includesEuAiAct([{ _id: 1, name: "EU AI Act" }])).toBe(true);
    expect(includesEuAiAct([{ framework_id: 1, name: "EU AI Act" }])).toBe(true);
    expect(includesEuAiAct([1])).toBe(true);
    expect(includesEuAiAct(["EU AI Act"])).toBe(true);
    expect(includesEuAiAct(["1"])).toBe(true);
  });

  it("is false for other frameworks and for missing lists", () => {
    expect(includesEuAiAct([{ _id: 2, name: "ISO 42001" }])).toBe(false);
    expect(includesEuAiAct(["ISO 42001"])).toBe(false);
    expect(includesEuAiAct([])).toBe(false);
    expect(includesEuAiAct(undefined)).toBe(false);
    expect(includesEuAiAct([null])).toBe(false);
  });
});
