import { emailValidation } from "../validations/email.valid";

describe("emailValidation", () => {
  describe("valid emails", () => {
    it("should return true for a standard email", () => {
      expect(emailValidation("user@example.com")).toBe(true);
    });

    it("should return true for email with subdomain", () => {
      expect(emailValidation("user@mail.example.com")).toBe(true);
    });

    it("should return true for email with plus addressing", () => {
      expect(emailValidation("user+tag@example.com")).toBe(true);
    });

    it("should return true for email with dots in local part", () => {
      expect(emailValidation("first.last@example.com")).toBe(true);
    });

    it("should return true for email with hyphens in domain", () => {
      expect(emailValidation("user@my-domain.com")).toBe(true);
    });

    it("should return true for email with numbers in local part", () => {
      expect(emailValidation("user123@example.com")).toBe(true);
    });

    it("should return true for email with special chars in local part", () => {
      expect(emailValidation("user!#$%&'*+/=?^_`{|}~@example.com")).toBe(true);
    });

    it("should return true for email with single char local part", () => {
      expect(emailValidation("a@example.com")).toBe(true);
    });

    it("should return true for email with long TLD", () => {
      expect(emailValidation("user@example.museum")).toBe(true);
    });
  });

  describe("invalid emails", () => {
    it("should return false for empty string", () => {
      expect(emailValidation("")).toBe(false);
    });

    it("should return false for null input", () => {
      expect(emailValidation(null as any)).toBe(false);
    });

    it("should return false for undefined input", () => {
      expect(emailValidation(undefined as any)).toBe(false);
    });

    it("should return false for non-string input", () => {
      expect(emailValidation(123 as any)).toBe(false);
    });

    it("should return false for email without @", () => {
      expect(emailValidation("userexample.com")).toBe(false);
    });

    it("should return false for email with multiple @", () => {
      expect(emailValidation("user@@example.com")).toBe(false);
    });

    it("should return false for email without domain", () => {
      expect(emailValidation("user@")).toBe(false);
    });

    it("should return false for email without local part", () => {
      expect(emailValidation("@example.com")).toBe(false);
    });

    it("should return false for email without TLD", () => {
      expect(emailValidation("user@example")).toBe(false);
    });

    it("should return false for email with numeric TLD", () => {
      expect(emailValidation("user@example.123")).toBe(false);
    });

    it("should return false for email with single char TLD", () => {
      expect(emailValidation("user@example.c")).toBe(false);
    });

    it("should return false for email with space", () => {
      expect(emailValidation("user @example.com")).toBe(false);
    });

    it("should return false for email with double dots in domain", () => {
      expect(emailValidation("user@example..com")).toBe(false);
    });

    it("should return false for email with hyphen at start of domain label", () => {
      expect(emailValidation("user@-example.com")).toBe(false);
    });

    it("should return false for email with hyphen at end of domain label", () => {
      expect(emailValidation("user@example-.com")).toBe(false);
    });
  });

  describe("edge cases and length limits", () => {
    it("should return false for email exceeding 254 characters", () => {
      const longLocal = "a".repeat(64);
      const longDomain = "b".repeat(186) + ".com";
      // Total: 64 + 1 (@) + 190 = 255 > 254
      expect(emailValidation(`${longLocal}@${longDomain}`)).toBe(false);
    });

    it("should return false for local part exceeding 64 characters", () => {
      const longLocal = "a".repeat(65);
      expect(emailValidation(`${longLocal}@example.com`)).toBe(false);
    });

    it("should return true for local part exactly 64 characters", () => {
      const local = "a".repeat(64);
      expect(emailValidation(`${local}@example.com`)).toBe(true);
    });

    it("should return false for domain label exceeding 63 characters", () => {
      const longLabel = "a".repeat(64);
      expect(emailValidation(`user@${longLabel}.com`)).toBe(false);
    });

    it("should handle ReDoS-style input without hanging", () => {
      const start = Date.now();
      const malicious = "a".repeat(50) + "@" + "b".repeat(50) + "." + "c".repeat(50);
      emailValidation(malicious);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });
});
