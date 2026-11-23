import { describe, it, expect } from "vitest";
import { clampPage } from "../tablePage";

describe("clampPage", () => {
  it("keeps a page that still has rows", () => {
    expect(clampPage(2, 30, 10)).toBe(2);
  });

  it("moves to the last page when the list shrank below the current one", () => {
    // Page 3 of 10 per page with one row left: page 0, not "Showing 31 - 1 of 1".
    expect(clampPage(3, 1, 10)).toBe(0);
    expect(clampPage(5, 25, 10)).toBe(2);
  });

  it("answers page 0 for an empty list or a bad page size", () => {
    expect(clampPage(4, 0, 10)).toBe(0);
    expect(clampPage(4, 10, 0)).toBe(0);
    expect(clampPage(-1, 10, 5)).toBe(0);
  });
});
