import { describe, it, expect } from "vitest";
import { countLabel } from "../countLabel";

describe("countLabel", () => {
  it("uses the singular for exactly one", () => {
    expect(countLabel(1, "prompt")).toBe("1 prompt");
  });

  it("uses the plural for zero and for more than one", () => {
    expect(countLabel(0, "prompt")).toBe("0 prompts");
    expect(countLabel(12, "prompt")).toBe("12 prompts");
  });

  it("accepts an irregular plural", () => {
    expect(countLabel(2, "entry", "entries")).toBe("2 entries");
    expect(countLabel(1, "entry", "entries")).toBe("1 entry");
  });
});
