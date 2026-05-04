import { stringValidation, enumValidation } from "../validations/string.valid";

describe("stringValidation", () => {
  describe("basic validation", () => {
    it("should return true for a non-empty string", () => {
      expect(stringValidation("hello")).toBe(true);
    });

    it("should return false for null", () => {
      expect(stringValidation(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(stringValidation(undefined)).toBe(false);
    });

    it("should return true for null when allowEmpty is true", () => {
      expect(stringValidation(null, undefined, undefined, true)).toBe(true);
    });

    it("should return true for undefined when allowEmpty is true", () => {
      expect(stringValidation(undefined, undefined, undefined, true)).toBe(true);
    });

    it("should return false for non-string type", () => {
      expect(stringValidation(123 as any)).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(stringValidation("")).toBe(false);
    });

    it("should return false for whitespace-only string", () => {
      expect(stringValidation("   ")).toBe(false);
    });

    it("should return true for empty string when allowEmpty is true", () => {
      expect(stringValidation("", undefined, undefined, true)).toBe(true);
    });
  });

  describe("length constraints", () => {
    it("should return true when string meets minLength", () => {
      expect(stringValidation("hello", 5)).toBe(true);
    });

    it("should return false when string is shorter than minLength", () => {
      expect(stringValidation("hi", 5)).toBe(false);
    });

    it("should return true when string meets maxLength", () => {
      expect(stringValidation("hello", undefined, 5)).toBe(true);
    });

    it("should return false when string exceeds maxLength", () => {
      expect(stringValidation("hello world", undefined, 5)).toBe(false);
    });

    it("should return true when string is within min and max range", () => {
      expect(stringValidation("hello", 3, 10)).toBe(true);
    });

    it("should return false when string is outside min and max range", () => {
      expect(stringValidation("hi", 3, 10)).toBe(false);
    });
  });
});

describe("enumValidation", () => {
  it("should return true when value is in allowed values", () => {
    expect(enumValidation("active", ["active", "inactive", "pending"])).toBe(true);
  });

  it("should return false when value is not in allowed values", () => {
    expect(enumValidation("deleted", ["active", "inactive", "pending"])).toBe(false);
  });

  it("should work with numeric values", () => {
    expect(enumValidation(1, [1, 2, 3])).toBe(true);
    expect(enumValidation(4, [1, 2, 3])).toBe(false);
  });

  it("should work with enum types", () => {
    enum Status {
      Active = "active",
      Inactive = "inactive",
    }
    expect(enumValidation(Status.Active, [Status.Active, Status.Inactive])).toBe(true);
  });

  it("should return false for empty allowed values array", () => {
    expect(enumValidation("anything", [])).toBe(false);
  });
});
