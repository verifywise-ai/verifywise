import { describe, it, expect } from "vitest";
import { parseVendorId } from "../parseVendorId";

describe("parseVendorId", () => {
  it.each([
    ["7", 7],
    ["120", 120],
    ["9007199254740991", Number.MAX_SAFE_INTEGER],
  ])("reads %j as the vendor %i", (raw, id) => {
    expect(parseVendorId(raw)).toBe(id);
  });

  it.each([null, "", "abc", "0", "-3", "7.5", "7abc", "1e2", " 7", "07", "9007199254740992"])(
    "reads %j as no vendor",
    (raw) => {
      expect(parseVendorId(raw)).toBeNull();
    },
  );
});
