import {
  isValidTenantHash,
  isValidSQLIdentifier,
  isValidShareToken,
  isValidResourceType,
  sanitizeErrorMessage,
  safeSQLIdentifier,
} from "../security.utils";

describe("security.utils", () => {
  describe("isValidTenantHash", () => {
    it("should accept a valid 10-char alphanumeric hash", () => {
      expect(isValidTenantHash("a1b2c3d4e5")).toBe(true);
      expect(isValidTenantHash("ABCDEFGHIJ")).toBe(true);
      expect(isValidTenantHash("0123456789")).toBe(true);
    });

    it("should reject hashes that are too short", () => {
      expect(isValidTenantHash("abc")).toBe(false);
      expect(isValidTenantHash("")).toBe(false);
    });

    it("should reject hashes that are too long", () => {
      expect(isValidTenantHash("a1b2c3d4e5f")).toBe(false);
    });

    it("should reject SQL injection attempts", () => {
      expect(isValidTenantHash("'; DROP --")).toBe(false);
      expect(isValidTenantHash("abc'; DROP")).toBe(false);
      expect(isValidTenantHash("1234567890; DELETE")).toBe(false);
      expect(isValidTenantHash("ab_cd_ef_g")).toBe(false); // underscore not allowed
    });

    it("should reject special characters", () => {
      expect(isValidTenantHash("abc!@#$%^&")).toBe(false);
      expect(isValidTenantHash("abc/def/gh")).toBe(false);
      expect(isValidTenantHash("abc.def.gh")).toBe(false);
    });
  });

  describe("isValidSQLIdentifier", () => {
    it("should accept valid identifiers", () => {
      expect(isValidSQLIdentifier("users")).toBe(true);
      expect(isValidSQLIdentifier("user_profiles")).toBe(true);
      expect(isValidSQLIdentifier("table123")).toBe(true);
      expect(isValidSQLIdentifier("_private")).toBe(true);
    });

    it("should reject empty strings", () => {
      expect(isValidSQLIdentifier("")).toBe(false);
    });

    it("should reject identifiers over 63 characters", () => {
      const longName = "a".repeat(64);
      expect(isValidSQLIdentifier(longName)).toBe(false);

      const maxName = "a".repeat(63);
      expect(isValidSQLIdentifier(maxName)).toBe(true);
    });

    it("should reject special characters", () => {
      expect(isValidSQLIdentifier("users; DROP TABLE")).toBe(false);
      expect(isValidSQLIdentifier("table-name")).toBe(false);
      expect(isValidSQLIdentifier("table.name")).toBe(false);
      expect(isValidSQLIdentifier("table name")).toBe(false);
    });
  });

  describe("isValidShareToken", () => {
    it("should accept a valid 64-char hex string", () => {
      const token = "a".repeat(64);
      expect(isValidShareToken(token)).toBe(true);

      const mixed = "0123456789abcdef".repeat(4);
      expect(isValidShareToken(mixed)).toBe(true);
    });

    it("should reject wrong length", () => {
      expect(isValidShareToken("abc")).toBe(false);
      expect(isValidShareToken("a".repeat(63))).toBe(false);
      expect(isValidShareToken("a".repeat(65))).toBe(false);
    });

    it("should reject uppercase hex", () => {
      expect(isValidShareToken("A".repeat(64))).toBe(false);
    });

    it("should reject non-hex characters", () => {
      expect(isValidShareToken("g".repeat(64))).toBe(false);
    });
  });

  describe("isValidResourceType", () => {
    it.each(["model", "vendor", "project", "policy", "risk"])(
      "should accept valid resource type: %s",
      (type) => {
        expect(isValidResourceType(type)).toBe(true);
      },
    );

    it("should reject unknown resource types", () => {
      expect(isValidResourceType("unknown")).toBe(false);
      expect(isValidResourceType("")).toBe(false);
      expect(isValidResourceType("admin")).toBe(false);
    });
  });

  describe("sanitizeErrorMessage", () => {
    it("should return original message when no sensitive patterns found", () => {
      expect(sanitizeErrorMessage(new Error("Something went wrong"))).toBe("Something went wrong");
    });

    it("should sanitize messages containing file paths", () => {
      expect(sanitizeErrorMessage(new Error("Error at /home/user/app/file.ts"))).toBe(
        "An error occurred",
      );
    });

    it("should sanitize messages containing SQL references", () => {
      expect(sanitizeErrorMessage(new Error("column 'password' does not exist"))).toBe(
        "An error occurred",
      );
      expect(sanitizeErrorMessage(new Error("relation users does not exist"))).toBe(
        "An error occurred",
      );
    });

    it("should sanitize messages containing sensitive words", () => {
      expect(sanitizeErrorMessage(new Error("Invalid password format"))).toBe("An error occurred");
      expect(sanitizeErrorMessage(new Error("token verification failed"))).toBe(
        "An error occurred",
      );
      expect(sanitizeErrorMessage(new Error("secret key is missing"))).toBe("An error occurred");
    });

    it("should use custom default message", () => {
      expect(sanitizeErrorMessage(new Error("table not found"), "Operation failed")).toBe(
        "Operation failed",
      );
    });

    it("should truncate long messages to 200 chars", () => {
      const longMsg = "x".repeat(300);
      expect(sanitizeErrorMessage(new Error(longMsg))).toHaveLength(200);
    });

    it("should handle errors with no message", () => {
      expect(sanitizeErrorMessage(new Error(""))).toBe("");
    });
  });

  describe("safeSQLIdentifier", () => {
    it("should return valid identifiers unchanged", () => {
      expect(safeSQLIdentifier("users")).toBe("users");
      expect(safeSQLIdentifier("my_table_123")).toBe("my_table_123");
    });

    it("should throw for invalid identifiers", () => {
      expect(() => safeSQLIdentifier("users; DROP")).toThrow("Invalid SQL identifier");
      expect(() => safeSQLIdentifier("")).toThrow("Invalid SQL identifier");
    });
  });
});
