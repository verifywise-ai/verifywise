import {
  INCIDENT_DESCRIPTION_MAX_LENGTH,
  INCIDENT_VALIDATION_LIMITS,
  assertValidIncidentDescription,
  isIncidentDescriptionChanged,
  validateCompleteIncidentCreation,
  validateCompleteIncidentUpdate,
  validateDescription,
} from "./incidentManagementValidation.utils";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

describe("incident description length", () => {
  it("caps descriptions at Jira's 32,767-character text-field limit", () => {
    expect(INCIDENT_DESCRIPTION_MAX_LENGTH).toBe(32767);
    expect(INCIDENT_VALIDATION_LIMITS.DESCRIPTION.MAX).toBe(INCIDENT_DESCRIPTION_MAX_LENGTH);
    expect(INCIDENT_VALIDATION_LIMITS.DESCRIPTION.MIN).toBe(5);
  });

  it("accepts descriptions over the old 1,000-character cap", () => {
    expect(validateDescription("a".repeat(1001)).isValid).toBe(true);
    expect(validateDescription("a".repeat(5000)).isValid).toBe(true);
  });

  it("accepts exactly 32,767 characters", () => {
    expect(validateDescription("a".repeat(32767)).isValid).toBe(true);
  });

  it("rejects 32,768 characters", () => {
    const result = validateDescription("a".repeat(32768));
    expect(result.isValid).toBe(false);
    // Same text as the frontend message and the translation key.
    expect(result.message).toBe("Description cannot exceed 32,767 characters.");
  });

  it("still rejects descriptions shorter than 5 characters", () => {
    expect(validateDescription("abcd").isValid).toBe(false);
    expect(validateDescription("abcde").isValid).toBe(true);
  });

  it("assertValidIncidentDescription throws a 400 ValidationException for an invalid description", () => {
    expect(() => assertValidIncidentDescription("a".repeat(32768))).toThrow(ValidationException);
    expect(() => assertValidIncidentDescription("   ")).toThrow(ValidationException);
    expect(() => assertValidIncidentDescription(undefined)).toThrow(ValidationException);
    try {
      assertValidIncidentDescription("a".repeat(32768));
    } catch (error) {
      expect((error as ValidationException).statusCode).toBe(400);
    }
    expect(() => assertValidIncidentDescription("a".repeat(32767))).not.toThrow();
  });

  it("uses the same required and too-short wording as the frontend", () => {
    expect(validateDescription(undefined).message).toBe("Description is required.");
    expect(validateDescription("   ").message).toBe("Description is required.");
    expect(validateDescription("abcd").message).toBe("Description must be at least 5 characters.");
  });

  it("carries the field-level code on the thrown exception", () => {
    expect.assertions(2);
    try {
      assertValidIncidentDescription("abcd");
    } catch (error) {
      expect((error as ValidationException).metadata.field).toBe("description");
      expect((error as ValidationException).metadata.validationCode).toBe("MIN_LENGTH");
    }
  });
});

describe("isIncidentDescriptionChanged", () => {
  it("is false when the update does not include a description", () => {
    expect(isIncidentDescriptionChanged(undefined, "anything")).toBe(false);
  });

  it("normalises null/undefined to empty and trims before comparing", () => {
    expect(isIncidentDescriptionChanged("", null)).toBe(false);
    expect(isIncidentDescriptionChanged("   ", null)).toBe(false);
    expect(isIncidentDescriptionChanged("  abc  ", "abc")).toBe(false);
  });

  it("is true for a real change", () => {
    expect(isIncidentDescriptionChanged("abcd", "abc")).toBe(true);
    expect(isIncidentDescriptionChanged("", "abc")).toBe(true);
  });
});

describe("controller up-front description validation", () => {
  it("rejects an over-long description on create with a description field error", () => {
    const errors = validateCompleteIncidentCreation({ description: "a".repeat(32768) });
    expect(errors).toEqual([
      expect.objectContaining({
        field: "description",
        message: "Description cannot exceed 32,767 characters.",
        code: "MAX_LENGTH",
      }),
    ]);
  });

  it("rejects a missing description on create", () => {
    expect(validateCompleteIncidentCreation({}).map((e) => e.field)).toEqual(["description"]);
  });

  it("checks the description on update only when it changes", () => {
    const legacy = { description: "abc" };
    expect(validateCompleteIncidentUpdate({ status: "Closed" }, legacy)).toEqual([]);
    expect(validateCompleteIncidentUpdate({ description: " abc " }, legacy)).toEqual([]);
    expect(validateCompleteIncidentUpdate({ description: "" }, { description: null })).toEqual([]);
    expect(validateCompleteIncidentUpdate({ description: "a".repeat(32768) }, legacy)).toEqual([
      expect.objectContaining({ field: "description", code: "MAX_LENGTH" }),
    ]);
    expect(validateCompleteIncidentUpdate({ description: "abcd" }, legacy)).toEqual([
      expect.objectContaining({
        field: "description",
        message: "Description must be at least 5 characters.",
      }),
    ]);
  });
});
