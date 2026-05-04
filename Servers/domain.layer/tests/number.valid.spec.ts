import { numberValidation } from "../validations/number.valid";

describe("numberValidation", () => {
  describe("number type input", () => {
    it("should return true for a valid number", () => {
      expect(numberValidation(42)).toBe(true);
    });

    it("should return true for zero", () => {
      expect(numberValidation(0)).toBe(true);
    });

    it("should return true for negative number without min", () => {
      expect(numberValidation(-5)).toBe(true);
    });

    it("should return true when number equals min", () => {
      expect(numberValidation(1, 1)).toBe(true);
    });

    it("should return true when number equals max", () => {
      expect(numberValidation(100, undefined, 100)).toBe(true);
    });

    it("should return false when number is below min", () => {
      expect(numberValidation(0, 1)).toBe(false);
    });

    it("should return false when number is above max", () => {
      expect(numberValidation(101, undefined, 100)).toBe(false);
    });

    it("should return true when number is within range", () => {
      expect(numberValidation(50, 1, 100)).toBe(true);
    });

    it("should return false when number is outside range", () => {
      expect(numberValidation(200, 1, 100)).toBe(false);
    });
  });

  describe("string type input", () => {
    it("should return true for numeric string", () => {
      expect(numberValidation("42")).toBe(true);
    });

    it("should return true for zero string", () => {
      expect(numberValidation("0")).toBe(true);
    });

    it("should return false for non-numeric string", () => {
      expect(numberValidation("abc")).toBe(false);
    });

    it("should return false for string with letters and numbers", () => {
      expect(numberValidation("12ab")).toBe(false);
    });

    it("should return false for negative string (regex only matches digits)", () => {
      expect(numberValidation("-5")).toBe(false);
    });

    it("should return false for decimal string", () => {
      expect(numberValidation("3.14")).toBe(false);
    });

    it("should return true for empty string (matches regex /^[0-9]*$/)", () => {
      expect(numberValidation("")).toBe(true);
    });

    it("should return true for string within range", () => {
      expect(numberValidation("50", 1, 100)).toBe(true);
    });

    it("should return false for string below min", () => {
      expect(numberValidation("0", 1)).toBe(false);
    });

    it("should return false for string above max", () => {
      expect(numberValidation("200", undefined, 100)).toBe(false);
    });
  });
});
