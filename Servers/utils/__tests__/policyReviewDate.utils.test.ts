import { describe, expect, it } from "@jest/globals";
import {
  POLICY_REVIEW_DATE_SQL,
  formatReviewDate,
  toReviewDateValue,
} from "../policyReviewDate.utils";

// Run under a TZ east and west of UTC: the results must not change.
describe("policy review date helpers (P-M1)", () => {
  it("stores a calendar day", () => {
    expect(toReviewDateValue("2030-01-15")).toBe("2030-01-15");
    expect(toReviewDateValue("2030-01-15T00:00:00.000Z")).toBe("2030-01-15");
    expect(toReviewDateValue(new Date("2030-01-15T00:00:00.000Z"))).toBe("2030-01-15");
    expect(toReviewDateValue("")).toBeNull();
    expect(toReviewDateValue(null)).toBeNull();
    expect(toReviewDateValue(undefined)).toBeNull();
  });

  it("formats a UTC-midnight string as that day", () => {
    expect(formatReviewDate("2030-01-15T00:00:00.000Z")).toBe("January 15, 2030");
    expect(formatReviewDate("2030-01-15")).toBe("January 15, 2030");
  });

  it("formats a node-pg local-midnight Date as that day", () => {
    expect(formatReviewDate(new Date(2030, 0, 15))).toBe("January 15, 2030");
  });

  it("returns an empty string for nothing usable", () => {
    expect(formatReviewDate(null)).toBe("");
    expect(formatReviewDate("not a date")).toBe("");
    expect(formatReviewDate(new Date("invalid"))).toBe("");
  });

  it("selects the column from the pm alias as a fixed-format string", () => {
    expect(POLICY_REVIEW_DATE_SQL).toBe(
      `to_char(pm.next_review_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS next_review_date`,
    );
  });
});
