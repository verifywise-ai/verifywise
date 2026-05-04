import { passwordValidation } from "../validations/password.valid";

describe("passwordValidation", () => {
  describe("return shape", () => {
    it("should return an object with isValid, hasSpecialChar, isMinLength, isMaxLength", () => {
      const result = passwordValidation("Test1234");
      expect(result).toHaveProperty("isValid");
      expect(result).toHaveProperty("hasSpecialChar");
      expect(result).toHaveProperty("isMinLength");
      expect(result).toHaveProperty("isMaxLength");
    });
  });

  describe("valid passwords", () => {
    it("should be valid for password with lowercase, uppercase, digit, and >= 8 chars", () => {
      const result = passwordValidation("SecurePass1");
      expect(result.isValid).toBe(true);
      expect(result.isMinLength).toBe(true);
      expect(result.isMaxLength).toBe(true);
    });

    it("should be valid for password with special characters", () => {
      const result = passwordValidation("SecurePass1!");
      expect(result.isValid).toBe(true);
      expect(result.hasSpecialChar).toBe(true);
    });

    it("should be valid for exactly 8 characters", () => {
      const result = passwordValidation("Abcdef1x");
      expect(result.isValid).toBe(true);
      expect(result.isMinLength).toBe(true);
    });

    it("should be valid for exactly 32 characters", () => {
      const result = passwordValidation("A1" + "a".repeat(30));
      expect(result.isValid).toBe(true);
      expect(result.isMaxLength).toBe(true);
    });
  });

  describe("invalid passwords", () => {
    it("should be invalid for password without uppercase", () => {
      const result = passwordValidation("lowercase1");
      expect(result.isValid).toBe(false);
    });

    it("should be invalid for password without lowercase", () => {
      const result = passwordValidation("UPPERCASE1");
      expect(result.isValid).toBe(false);
    });

    it("should be invalid for password without digit", () => {
      const result = passwordValidation("NoDigitHere");
      expect(result.isValid).toBe(false);
    });

    it("should be invalid for password shorter than 8 characters", () => {
      const result = passwordValidation("Aa1bbcc");
      expect(result.isValid).toBe(false);
      expect(result.isMinLength).toBe(false);
    });

    it("should be invalid for empty string", () => {
      const result = passwordValidation("");
      expect(result.isValid).toBe(false);
      expect(result.isMinLength).toBe(false);
    });
  });

  describe("special character detection", () => {
    it("should detect special characters", () => {
      const result = passwordValidation("Test123!");
      expect(result.hasSpecialChar).toBe(true);
    });

    it("should report no special characters when absent", () => {
      const result = passwordValidation("Test1234");
      expect(result.hasSpecialChar).toBe(false);
    });

    it.each([
      "!",
      "@",
      "#",
      "$",
      "%",
      "^",
      "&",
      "*",
      "(",
      ")",
      ",",
      ".",
      "?",
      '"',
      ":",
      "{",
      "}",
      "|",
      "<",
      ">",
    ])("should detect special character %s", (char) => {
      const result = passwordValidation(`Test123${char}`);
      expect(result.hasSpecialChar).toBe(true);
    });
  });

  describe("max length", () => {
    it("should report isMaxLength false for password exceeding 32 characters", () => {
      const result = passwordValidation("A1" + "a".repeat(31));
      expect(result.isMaxLength).toBe(false);
    });
  });
});
