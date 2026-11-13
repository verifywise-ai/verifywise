import { matchesFilterCondition } from "../filterConditions";

describe("matchesFilterCondition on a multi-valued field", () => {
  const ids = ["1", "22", "Draft"];

  it("'is' means includes, ignoring case", () => {
    expect(matchesFilterCondition(ids, "is", "22")).toBe(true);
    expect(matchesFilterCondition(ids, "is", "draft")).toBe(true);
    expect(matchesFilterCondition(ids, "is", "2")).toBe(false);
  });

  it("'is not' means does not include", () => {
    expect(matchesFilterCondition(ids, "is_not", "22")).toBe(false);
    expect(matchesFilterCondition(ids, "is_not", "3")).toBe(true);
    expect(matchesFilterCondition([], "is_not", "3")).toBe(true);
  });

  it("contains and does not contain look inside each value", () => {
    expect(matchesFilterCondition(ids, "contains", "raf")).toBe(true);
    expect(matchesFilterCondition(ids, "does_not_contain", "raf")).toBe(false);
    expect(matchesFilterCondition(ids, "does_not_contain", "zz")).toBe(true);
  });

  it("empty checks look at the length", () => {
    expect(matchesFilterCondition([], "is_empty", "")).toBe(true);
    expect(matchesFilterCondition(ids, "is_empty", "")).toBe(false);
    expect(matchesFilterCondition(ids, "is_not_empty", "")).toBe(true);
    expect(matchesFilterCondition([], "is_not_empty", "")).toBe(false);
  });

  it("numbers in the array match their string form", () => {
    expect(matchesFilterCondition([1, 2], "is", "2")).toBe(true);
  });

  it("scalars keep exact, case-insensitive matching", () => {
    expect(matchesFilterCondition("1,2", "is", "1")).toBe(false);
    expect(matchesFilterCondition("High", "is", "high")).toBe(true);
    expect(matchesFilterCondition(null, "is_empty", "")).toBe(true);
  });
});
