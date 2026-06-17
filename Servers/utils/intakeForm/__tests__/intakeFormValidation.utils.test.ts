import { describe, it, expect } from "@jest/globals";
import {
  isValidEmail,
  mapToAiRiskClassification,
  buildEntityDataFromSubmission,
  validateFormData,
} from "../intakeFormValidation.utils";
import { AiRiskClassification } from "../../../domain.layer/enums/ai-risk-classification.enum";

describe("isValidEmail", () => {
  it("accepts a well-formed address", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
  });

  it("rejects malformed strings and non-strings", () => {
    expect(isValidEmail("plainstring")).toBe(false);
    expect(isValidEmail("missing@dot")).toBe(false);
    expect(isValidEmail(42)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });
});

describe("mapToAiRiskClassification", () => {
  it("maps short values to enum", () => {
    expect(mapToAiRiskClassification("high")).toBe(AiRiskClassification.HIGH_RISK);
    expect(mapToAiRiskClassification("Minimal")).toBe(AiRiskClassification.MINIMAL_RISK);
  });

  it("maps display values to enum", () => {
    expect(mapToAiRiskClassification("limited risk")).toBe(AiRiskClassification.LIMITED_RISK);
    expect(mapToAiRiskClassification("Prohibited")).toBe(AiRiskClassification.PROHIBITED);
  });

  it("returns the original input for unknown values", () => {
    expect(mapToAiRiskClassification("custom")).toBe("custom");
  });

  it("returns empty string when input is empty", () => {
    expect(mapToAiRiskClassification("")).toBe("");
  });
});

describe("buildEntityDataFromSubmission", () => {
  it("uses entityFieldMapping for each field with a value", () => {
    const schema = {
      fields: [
        { id: "f1", entityFieldMapping: "title" },
        { id: "f2", entityFieldMapping: "description" },
        { id: "f3" },
      ],
    } as any;
    const result = buildEntityDataFromSubmission(
      { f1: "Hello", f2: "World", f3: "Ignored" },
      schema,
    );
    expect(result).toEqual({ title: "Hello", description: "World" });
  });

  it("skips fields whose submission value is undefined", () => {
    const schema = {
      fields: [
        { id: "f1", entityFieldMapping: "title" },
        { id: "f2", entityFieldMapping: "description" },
      ],
    } as any;
    expect(buildEntityDataFromSubmission({ f1: "Hi" }, schema)).toEqual({ title: "Hi" });
  });
});

describe("validateFormData", () => {
  it("returns empty array for valid data", () => {
    const schema = {
      fields: [
        { id: "name", label: "Name", type: "text", required: true },
        { id: "email", label: "Email", type: "email", required: true },
      ],
    } as any;
    const errors = validateFormData({ name: "Alice", email: "a@b.co" }, schema);
    expect(errors).toEqual([]);
  });

  it("collects required-field errors", () => {
    const schema = {
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
    } as any;
    const errors = validateFormData({}, schema);
    expect(errors).toContain('"Name" is required');
  });

  it("enforces email format", () => {
    const schema = {
      fields: [{ id: "e", label: "Email", type: "email", required: true }],
    } as any;
    const errors = validateFormData({ e: "nope" }, schema);
    expect(errors[0]).toMatch(/valid email/);
  });

  it("enforces number bounds", () => {
    const schema = {
      fields: [
        {
          id: "n",
          label: "Age",
          type: "number",
          validation: { min: 18, max: 65 },
        },
      ],
    } as any;
    expect(validateFormData({ n: 17 }, schema)[0]).toMatch(/at least 18/);
    expect(validateFormData({ n: 90 }, schema)[0]).toMatch(/at most 65/);
    expect(validateFormData({ n: 42 }, schema)).toEqual([]);
  });

  it("enforces text length bounds", () => {
    const schema = {
      fields: [
        {
          id: "t",
          label: "Bio",
          type: "text",
          validation: { minLength: 3, maxLength: 5 },
        },
      ],
    } as any;
    expect(validateFormData({ t: "ab" }, schema)[0]).toMatch(/at least 3 characters/);
    expect(validateFormData({ t: "abcdef" }, schema)[0]).toMatch(/at most 5 characters/);
  });

  it("enforces select / multiselect option membership", () => {
    const schema = {
      fields: [
        {
          id: "s",
          label: "Color",
          type: "select",
          options: [{ value: "red" }, { value: "blue" }],
        },
        {
          id: "m",
          label: "Tags",
          type: "multiselect",
          options: [{ value: "a" }, { value: "b" }],
        },
      ],
    } as any;
    expect(validateFormData({ s: "green", m: ["a", "z"] }, schema)).toEqual([
      '"Color" has an invalid selection',
      '"Tags" contains an invalid selection',
    ]);
  });

  it("skips validation when an optional field is empty", () => {
    const schema = {
      fields: [{ id: "x", label: "Opt", type: "text" }],
    } as any;
    expect(validateFormData({}, schema)).toEqual([]);
  });
});
