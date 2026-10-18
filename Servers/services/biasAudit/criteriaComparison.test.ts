import { compareCriteria } from "./criteriaComparison";

describe("compareCriteria", () => {
  it("reports not_supplied for empty input", () => {
    expect(compareCriteria("commercial-ae", null).verdict).toBe("not_supplied");
    expect(compareCriteria("commercial-ae", "   ").verdict).toBe("not_supplied");
  });

  it("matches a close set", () => {
    const supplied = [
      "Quota attainment",
      "Deal size",
      "Sales cycle length",
      "Full-cycle ownership",
      "Outbound experience",
      "Sector familiarity",
    ].join("\n");
    const out = compareCriteria("commercial-ae", supplied);
    expect(out.verdict).toBe("close");
    expect(out.unmatchedExpected).toEqual([]);
  });

  it("tolerates different wording for the same criterion", () => {
    const supplied = [
      "Has carried an individual revenue target",
      "Typical contract value",
      "Length of sales cycles handled",
      "Owns deals end to end",
      "Generates own pipeline",
      "Industry background",
    ].join("\n");
    const out = compareCriteria("commercial-ae", supplied);
    expect(out.matched.length).toBeGreaterThanOrEqual(4);
  });

  // Review Focus 4
  it("reports divergent when the platform generates a materially different set", () => {
    // Five generated criteria against eight reconstructed from the same job
    // description forced a full remap on a real engagement.
    const supplied = ["Communication", "Teamwork", "Availability"].join("\n");
    const out = compareCriteria("commercial-ae", supplied);
    expect(out.verdict).toBe("divergent");
    expect(out.unmatchedExpected.length).toBeGreaterThan(2);
    expect(out.matched).toEqual([]);
  });

  it("names which expected criteria were not matched", () => {
    const supplied = ["Quota attainment", "Deal size"].join("\n");
    const out = compareCriteria("commercial-ae", supplied);
    expect(out.unmatchedExpected).toContain("cycle_length");
    expect(out.unmatchedExpected).toContain("full_cycle_ownership");
  });

  it("names criteria the platform generated that we did not expect", () => {
    const supplied = [
      "Quota attainment",
      "Deal size",
      "Sales cycle length",
      "Full-cycle ownership",
      "Outbound experience",
      "Sector familiarity",
      "Security clearance",
    ].join("\n");
    const out = compareCriteria("commercial-ae", supplied);
    expect(out.unmatchedSupplied.some((s) => /clearance/i.test(s))).toBe(true);
  });

  it("parses a comma-separated list as well as newlines", () => {
    const out = compareCriteria("commercial-ae", "Quota attainment, Deal size");
    expect(out.supplied).toHaveLength(2);
  });

  it("parses a numbered or bulleted list", () => {
    const out = compareCriteria(
      "commercial-ae",
      "1. Quota attainment\n2. Deal size\n- Sales cycle length",
    );
    expect(out.supplied).toHaveLength(3);
  });

  it("matches each supplied item to at most one expected criterion", () => {
    const out = compareCriteria("commercial-ae", "Quota attainment");
    expect(out.matched).toHaveLength(1);
    expect(out.matched[0].expected).toBe("quota_attainment");
  });

  it("rejects an unknown job description key", () => {
    expect(() => compareCriteria("nope", "x")).toThrow(/unknown job description/i);
  });
});
