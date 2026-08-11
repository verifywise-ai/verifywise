/**
 * @fileoverview Tests for framework selection parsing.
 *
 * Native and custom framework ids collide numerically — frameworks.id = 2 is
 * ISO 42001 and custom_frameworks.id = 2 is some org's plugin framework — so
 * the namespace prefix is the only thing keeping them apart.
 *
 * @module tests/frameworkSelection
 */

import { parseFrameworkSelection, isEmptySelection } from "../frameworkSelection";

describe("parseFrameworkSelection", () => {
  it("sorts entries into their namespaces", () => {
    expect(parseFrameworkSelection(["native:1", "native:3", "plugin:soc2", "custom:7"])).toEqual({
      native: [1, 3],
      plugin: ["soc2"],
      custom: [7],
      invalid: [],
    });
  });

  it("reads a bare positive integer as native", () => {
    expect(parseFrameworkSelection([2, "4"]).native).toEqual([2, 4]);
  });

  it("treats a missing or non-array selection as empty", () => {
    for (const raw of [undefined, null, "native:1", {}]) {
      const parsed = parseFrameworkSelection(raw);
      expect(isEmptySelection(parsed)).toBe(true);
      expect(parsed.invalid).toEqual([]);
    }
  });

  it("rejects id 0 rather than letting it close every framework gate", () => {
    // A 0 framework id is the shipped bug this whole column exists to avoid:
    // collectAllData gates on === 1/2/3/4, so a 0 matches nothing and the
    // report comes out with no framework content at all.
    const parsed = parseFrameworkSelection(["native:0", "custom:0", 0]);
    expect(parsed.native).toEqual([]);
    expect(parsed.custom).toEqual([]);
    expect(parsed.invalid).toEqual(["native:0", "custom:0", "0"]);
  });

  it("collects unrecognised entries as invalid instead of dropping them", () => {
    const parsed = parseFrameworkSelection(["native:x", "iso42001", "plugin:", "plugin:SOC2"]);
    expect(parsed.invalid).toEqual(["native:x", "iso42001", "plugin:", "plugin:SOC2"]);
    expect(isEmptySelection(parsed)).toBe(true);
  });

  it("de-duplicates within a namespace", () => {
    expect(parseFrameworkSelection(["native:2", "native:2", 2]).native).toEqual([2]);
  });

  it("is empty only when no namespace holds anything", () => {
    expect(isEmptySelection(parseFrameworkSelection([]))).toBe(true);
    expect(isEmptySelection(parseFrameworkSelection(["plugin:gdpr"]))).toBe(false);
  });
});
