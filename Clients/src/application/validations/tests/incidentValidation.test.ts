import { describe, it, expect } from "vitest";
import {
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
