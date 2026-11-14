import { describe, expect, it } from "@jest/globals";
import {
  POLICY_REVIEW_DATE_SQL,
  formatReviewDate,
  isReviewDateString,
  toReviewDateValue,
} from "../policyReviewDate.utils";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

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

  it("accepts an exact day or a full ISO timestamp", () => {
    for (const value of [
      "2030-01-15",
      "2030-01-15T00:00:00.000Z",
      "2030-01-15T23:59:59Z",
      "2030-01-15T10:30+02:00",
      "2028-02-29",
    ]) {
      expect(isReviewDateString(value)).toBe(true);
    }
  });

  it("refuses a valid date followed by anything malformed", () => {
    for (const value of [
      "2030-01-15garbage",
      "2030-01-15T25:99:99",
      "2030-01-15T23:60:00Z",
      "2030-01-15 ",
      "2030-01-15T",
      "2030-02-30",
      "2029-02-29",
      "2030-13-01",
      "not a date",
    ]) {
      expect(isReviewDateString(value)).toBe(false);
    }
    expect(isReviewDateString(20300115)).toBe(false);
  });

  it("refuses an out-of-range offset", () => {
    expect(isReviewDateString("2030-01-15T10:00+14:00")).toBe(true);
    expect(isReviewDateString("2030-01-15T10:00+99:99")).toBe(false);
    expect(isReviewDateString("2030-01-15T10:00-7777")).toBe(false);
  });

  it("throws for anything it would not store as a calendar day", () => {
    for (const value of [
      "2030-01-15garbage",
      "2030-01-15T25:99:99",
      "2030-01-15 10:00",
      "2030-1-5",
      "next quarter",
      new Date("invalid"),
      20300115,
    ]) {
      expect(() => toReviewDateValue(value)).toThrow(ValidationException);
    }
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
