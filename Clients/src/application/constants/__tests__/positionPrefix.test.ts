import { describe, it, expect } from "vitest";
import { FRAMEWORKS_WITH_OWN_NUMBERING, getPositionPrefix } from "../frameworks";

describe("getPositionPrefix", () => {
  it("adds no prefix for frameworks that number their own titles", () => {
    expect(FRAMEWORKS_WITH_OWN_NUMBERING.has("osfi_e23")).toBe(true);
    expect(getPositionPrefix("osfi_e23", 1)).toBe("");
    expect(getPositionPrefix("osfi_e23", "1.1")).toBe("");
  });

  it("keeps the position prefix for other frameworks", () => {
    expect(getPositionPrefix("soc2", 1)).toBe("1 ");
    expect(getPositionPrefix("soc2", "1.2")).toBe("1.2 ");
  });

  it("returns an empty string when there is no number", () => {
    expect(getPositionPrefix("soc2", null)).toBe("");
    expect(getPositionPrefix(undefined, undefined)).toBe("");
  });
});
