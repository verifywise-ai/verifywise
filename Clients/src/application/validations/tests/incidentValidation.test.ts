import { describe, it, expect } from "vitest";
import dayjs from "dayjs";
import {
  INCIDENT_DATE_ORDER_MESSAGE,
  INCIDENT_FUTURE_DATE_MESSAGE,
  isIncidentDateInFuture,
  validateIncidentDetectedDate,
  INCIDENT_DESCRIPTION_MAX_LENGTH,
  INCIDENT_DESCRIPTION_MIN_LENGTH,
  INCIDENT_DESCRIPTION_REQUIRED_MESSAGE,
  INCIDENT_DESCRIPTION_TOO_LONG_MESSAGE,
  INCIDENT_DESCRIPTION_TOO_SHORT_MESSAGE,
  validateIncidentDescription,
} from "../incidentValidation";

describe("validateIncidentDescription", () => {
  it("mirrors the backend limits and uses the translated message keys", () => {
    expect(INCIDENT_DESCRIPTION_MIN_LENGTH).toBe(5);
    expect(INCIDENT_DESCRIPTION_MAX_LENGTH).toBe(32767);
    // Must match the translations.ts keys exactly.
    expect(INCIDENT_DESCRIPTION_REQUIRED_MESSAGE).toBe("Description is required.");
    expect(INCIDENT_DESCRIPTION_TOO_SHORT_MESSAGE).toBe(
      "Description must be at least 5 characters.",
    );
    expect(INCIDENT_DESCRIPTION_TOO_LONG_MESSAGE).toBe(
      "Description cannot exceed 32,767 characters.",
    );
  });

  it("requires a value, treating whitespace-only as empty", () => {
    expect(validateIncidentDescription("")).toBe(INCIDENT_DESCRIPTION_REQUIRED_MESSAGE);
    expect(validateIncidentDescription(undefined)).toBe(INCIDENT_DESCRIPTION_REQUIRED_MESSAGE);
    expect(validateIncidentDescription(null)).toBe(INCIDENT_DESCRIPTION_REQUIRED_MESSAGE);
    expect(validateIncidentDescription("   \n\t ")).toBe(INCIDENT_DESCRIPTION_REQUIRED_MESSAGE);
  });

  it("rejects fewer than 5 characters after trimming", () => {
    expect(validateIncidentDescription("abcd")).toBe(INCIDENT_DESCRIPTION_TOO_SHORT_MESSAGE);
    expect(validateIncidentDescription("  abcd  ")).toBe(INCIDENT_DESCRIPTION_TOO_SHORT_MESSAGE);
    expect(validateIncidentDescription("abcde")).toBe("");
  });

  it("accepts descriptions over the old 1,000-character cap", () => {
    expect(validateIncidentDescription("a".repeat(1001))).toBe("");
    expect(validateIncidentDescription("a".repeat(5000))).toBe("");
  });

  it("accepts exactly 32,767 characters", () => {
    expect(validateIncidentDescription("a".repeat(32767))).toBe("");
  });

  it("rejects 32,768 characters", () => {
    expect(validateIncidentDescription("a".repeat(32768))).toBe(
      INCIDENT_DESCRIPTION_TOO_LONG_MESSAGE,
    );
  });

  it("measures length after trimming, like the backend", () => {
    expect(validateIncidentDescription(`  ${"a".repeat(32767)}  `)).toBe("");
  });
});

const today = dayjs("2026-11-23T10:00:00");

describe("incident date rules", () => {
  it("treats today as not in the future and tomorrow as in the future", () => {
    expect(isIncidentDateInFuture("2026-11-23", today)).toBe(false);
    expect(isIncidentDateInFuture("2026-11-24", today)).toBe(true);
    expect(isIncidentDateInFuture("", today)).toBe(false);
  });

  it("accepts a detected date on or after the occurred date, up to today", () => {
    expect(validateIncidentDetectedDate("2026-11-20", "2026-11-20", { today })).toBe("");
    expect(validateIncidentDetectedDate("2026-11-23", "2026-11-01", { today })).toBe("");
  });

  it("refuses a detected date before the occurred date", () => {
    expect(validateIncidentDetectedDate("2026-11-19", "2026-11-20", { today })).toBe(
      INCIDENT_DATE_ORDER_MESSAGE,
    );
  });

  it("refuses a detected date in the future", () => {
    expect(validateIncidentDetectedDate("2026-11-24", "2026-11-20", { today })).toBe(
      INCIDENT_FUTURE_DATE_MESSAGE,
    );
  });

  it("skips only the future rule when asked (an unchanged date in edit mode)", () => {
    expect(
      validateIncidentDetectedDate("2026-11-30", "2026-11-20", { checkFuture: false, today }),
    ).toBe("");
    expect(
      validateIncidentDetectedDate("2026-11-30", "2026-12-01", { checkFuture: false, today }),
    ).toBe(INCIDENT_DATE_ORDER_MESSAGE);
  });

  it("leaves an empty detected date to the required check", () => {
    expect(validateIncidentDetectedDate("", "2026-11-20", { today })).toBe("");
  });
});
