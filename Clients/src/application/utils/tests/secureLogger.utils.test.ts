import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as SecureLogger from "../secureLogger.utils";

describe("secureLogger.utils", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe("secureLog", () => {
    it("warns and returns when message is empty", () => {
      SecureLogger.secureLog({ level: "error", message: "" });
      expect(console.warn).toHaveBeenCalled();
    });

    it("warns and returns when message is not a string", () => {
      SecureLogger.secureLog({ level: "error", message: 123 as any });
      expect(console.warn).toHaveBeenCalled();
    });

    it("in development: logs error with formatted context", () => {
      process.env.NODE_ENV = "development";

      SecureLogger.secureLog({
        level: "error",
        message: "Boom",
        context: "Ctx",
      });

      expect(console.error).toHaveBeenCalledWith("[Ctx] Boom");
    });

    it("in development: logs warn with formatted context", () => {
      process.env.NODE_ENV = "development";

      SecureLogger.secureLog({
        level: "warn",
        message: "Heads up",
        context: "Ctx",
      });

      expect(console.warn).toHaveBeenCalledWith("[Ctx] Heads up");
    });

    it("in development: logs info when level is info", () => {
      process.env.NODE_ENV = "development";

      SecureLogger.secureLog({
        level: "info",
        message: "FYI",
        context: "Ctx",
      });

      expect(console.info).toHaveBeenCalledWith("[Ctx] FYI");
    });

    it("in development: defaults to info for unknown level (covers default branch)", () => {
      process.env.NODE_ENV = "development";

      SecureLogger.secureLog({
        level: "unknown" as any,
        message: "Test",
        context: "Ctx",
      });

      expect(console.info).toHaveBeenCalledWith("[Ctx] Test");
    });

    it("formats message without context", () => {
      process.env.NODE_ENV = "development";

      SecureLogger.secureLog({
        level: "info",
        message: "Hello",
      });

      expect(console.info).toHaveBeenCalledWith("Hello");
    });

    it("in production: logs a generic error message only when level is error", () => {
      process.env.NODE_ENV = "production";

      SecureLogger.secureLog({
        level: "error",
        message: "Sensitive info",
        context: "Ctx",
      });

      expect(console.error).toHaveBeenCalledWith(
        "[Error] An error occurred. Please contact support if the issue persists.",
      );
    });

    it("in production: does nothing for warn/info", () => {
      process.env.NODE_ENV = "production";

      SecureLogger.secureLog({
        level: "warn",
        message: "Warn msg",
        context: "Ctx",
      });

      SecureLogger.secureLog({
        level: "info",
        message: "Info msg",
        context: "Ctx",
      });

      expect(console.warn).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
    });
  });

  describe("convenience functions", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    it("secureLogError logs as error in development", () => {
      SecureLogger.secureLogError("Boom", "Ctx");
      expect(console.error).toHaveBeenCalledWith("[Ctx] Boom");
    });

    it("secureLogWarn logs as warn in development", () => {
      SecureLogger.secureLogWarn("Heads up", "Ctx");
      expect(console.warn).toHaveBeenCalledWith("[Ctx] Heads up");
    });

    it("secureLogInfo logs as info in development", () => {
      SecureLogger.secureLogInfo("FYI", "Ctx");
      expect(console.info).toHaveBeenCalledWith("[Ctx] FYI");
    });
  });

  describe("sanitizeErrorMessage", () => {
    it('returns "Unknown error occurred" for null/undefined', () => {
      expect(SecureLogger.sanitizeErrorMessage(null)).toBe("Unknown error occurred");
      expect(SecureLogger.sanitizeErrorMessage(undefined)).toBe("Unknown error occurred");
    });

    it("sanitizes Error message (emails, ids, file names)", () => {
      const err = new Error(
        "User john.doe@email.com failed accessing file secret.pdf with id 123456",
      );

      const result = SecureLogger.sanitizeErrorMessage(err);

      expect(result).not.toContain("john.doe@email.com");
      expect(result).not.toContain("secret.pdf");
      expect(result).not.toContain("123456");
    });

    it("returns the same message when Error message is only whitespace (no sanitization applied)", () => {
      const err = new Error("   ");
      expect(SecureLogger.sanitizeErrorMessage(err)).toBe("   ");
    });

    it('returns "Operation failed" when Error message is empty', () => {
      const err = new Error("");
      expect(SecureLogger.sanitizeErrorMessage(err)).toBe("Operation failed");
    });

    it("sanitizes string error by replacing email only", () => {
      const result = SecureLogger.sanitizeErrorMessage("Contact me at test@mail.com");

      expect(result).not.toContain("test@mail.com");
    });

    it('returns "An error occurred" for non-string, non-Error values', () => {
      expect(SecureLogger.sanitizeErrorMessage(123 as any)).toBe("An error occurred");
      expect(SecureLogger.sanitizeErrorMessage({} as any)).toBe("An error occurred");
    });
  });
});
