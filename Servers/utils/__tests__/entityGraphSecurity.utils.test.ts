import { describe, it, expect } from "@jest/globals";
import {
  VALID_ENTITY_TYPES,
  isValidSchemaName,
  isValidEntityType,
  isValidEntityId,
  sanitizeAnnotationContent,
  sanitizeViewName,
  sanitizeViewConfig,
  validateGapRules,
  sanitizeErrorMessage,
} from "../entityGraphSecurity.utils";

describe("entityGraphSecurity.utils", () => {
  describe("VALID_ENTITY_TYPES", () => {
    it("should contain the expected entity types", () => {
      expect(VALID_ENTITY_TYPES).toEqual([
        "useCase",
        "model",
        "risk",
        "vendor",
        "control",
        "evidence",
        "framework",
        "user",
      ]);
    });
  });

  describe("isValidSchemaName", () => {
    it("should accept alphanumeric names between 1 and 63 characters", () => {
      expect(isValidSchemaName("a")).toBe(true);
      expect(isValidSchemaName("abc123")).toBe(true);
      expect(isValidSchemaName("A1B2C3")).toBe(true);
      expect(isValidSchemaName("a".repeat(63))).toBe(true);
    });

    it("should reject empty strings", () => {
      expect(isValidSchemaName("")).toBe(false);
    });

    it("should reject non-string values", () => {
      expect(isValidSchemaName(null as unknown as string)).toBe(false);
      expect(isValidSchemaName(undefined as unknown as string)).toBe(false);
      expect(isValidSchemaName(123 as unknown as string)).toBe(false);
    });

    it("should reject names with special characters", () => {
      expect(isValidSchemaName("abc_def")).toBe(false);
      expect(isValidSchemaName("abc-def")).toBe(false);
      expect(isValidSchemaName("abc.def")).toBe(false);
      expect(isValidSchemaName("abc def")).toBe(false);
      expect(isValidSchemaName("abc!@#")).toBe(false);
    });

    it("should reject names longer than 63 characters", () => {
      expect(isValidSchemaName("a".repeat(64))).toBe(false);
      expect(isValidSchemaName("a".repeat(100))).toBe(false);
    });
  });

  describe("isValidEntityType", () => {
    it("should accept whitelisted entity types", () => {
      expect(isValidEntityType("useCase")).toBe(true);
      expect(isValidEntityType("model")).toBe(true);
      expect(isValidEntityType("risk")).toBe(true);
      expect(isValidEntityType("vendor")).toBe(true);
      expect(isValidEntityType("control")).toBe(true);
      expect(isValidEntityType("evidence")).toBe(true);
      expect(isValidEntityType("framework")).toBe(true);
      expect(isValidEntityType("user")).toBe(true);
    });

    it("should reject unknown entity types", () => {
      expect(isValidEntityType("unknown")).toBe(false);
      expect(isValidEntityType("project")).toBe(false);
      expect(isValidEntityType("admin")).toBe(false);
    });

    it("should reject empty or non-string values", () => {
      expect(isValidEntityType("")).toBe(false);
      expect(isValidEntityType(null as unknown as string)).toBe(false);
      expect(isValidEntityType(undefined as unknown as string)).toBe(false);
      expect(isValidEntityType(123 as unknown as string)).toBe(false);
    });
  });

  describe("isValidEntityId", () => {
    it("should accept valid entity IDs in {type}-{id} format", () => {
      expect(isValidEntityId("useCase-123")).toBe(true);
      expect(isValidEntityId("model-abc")).toBe(true);
      expect(isValidEntityId("risk-1_2")).toBe(true);
      expect(isValidEntityId("user-a-b-c")).toBe(true);
    });

    it("should reject empty or non-string values", () => {
      expect(isValidEntityId("")).toBe(false);
      expect(isValidEntityId(null as unknown as string)).toBe(false);
      expect(isValidEntityId(undefined as unknown as string)).toBe(false);
      expect(isValidEntityId(123 as unknown as string)).toBe(false);
    });

    it("should reject IDs longer than 100 characters", () => {
      expect(isValidEntityId("useCase-" + "a".repeat(92))).toBe(true);
      expect(isValidEntityId("useCase-" + "a".repeat(93))).toBe(false);
    });

    it("should reject IDs with invalid characters", () => {
      expect(isValidEntityId("useCase-123!")).toBe(false);
      expect(isValidEntityId("useCase-123@")).toBe(false);
      expect(isValidEntityId("useCase-123 ")).toBe(false);
      expect(isValidEntityId("useCase-123.")).toBe(false);
    });

    it("should reject IDs without a valid entity type prefix", () => {
      expect(isValidEntityId("invalid-123")).toBe(false);
      expect(isValidEntityId("project-123")).toBe(false);
      expect(isValidEntityId("123-useCase")).toBe(false);
    });

    it("should reject IDs without a hyphen separator", () => {
      expect(isValidEntityId("useCase123")).toBe(false);
      expect(isValidEntityId("modelabc")).toBe(false);
    });
  });

  describe("sanitizeAnnotationContent", () => {
    it("should trim whitespace and return valid content", () => {
      const result = sanitizeAnnotationContent("  hello world  ");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("hello world");
    });

    it("should accept content at boundary lengths", () => {
      const min = sanitizeAnnotationContent("a");
      expect(min.valid).toBe(true);
      expect(min.sanitized).toBe("a");

      const max = sanitizeAnnotationContent("a".repeat(2000));
      expect(max.valid).toBe(true);
      expect(max.sanitized).toBe("a".repeat(2000));
    });

    it("should return error for empty or whitespace-only content", () => {
      const empty = sanitizeAnnotationContent("");
      expect(empty.valid).toBe(false);
      expect(empty.error).toBe("Content is required");

      const whitespace = sanitizeAnnotationContent("   ");
      expect(whitespace.valid).toBe(false);
      expect(whitespace.error).toBe("Content cannot be empty");
    });

    it("should return error for non-string content", () => {
      const result = sanitizeAnnotationContent(null as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Content is required");
    });

    it("should return error for content exceeding 2000 characters", () => {
      const result = sanitizeAnnotationContent("a".repeat(2001));
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Content cannot exceed 2000 characters");
    });
  });

  describe("sanitizeViewName", () => {
    it("should trim whitespace and return valid name", () => {
      const result = sanitizeViewName("  My View  ");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("My View");
    });

    it("should accept names at boundary lengths", () => {
      const min = sanitizeViewName("a");
      expect(min.valid).toBe(true);
      expect(min.sanitized).toBe("a");

      const max = sanitizeViewName("a".repeat(100));
      expect(max.valid).toBe(true);
      expect(max.sanitized).toBe("a".repeat(100));
    });

    it("should return error for empty or whitespace-only name", () => {
      const empty = sanitizeViewName("");
      expect(empty.valid).toBe(false);
      expect(empty.error).toBe("View name is required");

      const whitespace = sanitizeViewName("   ");
      expect(whitespace.valid).toBe(false);
      expect(whitespace.error).toBe("View name cannot be empty");
    });

    it("should return error for non-string name", () => {
      const result = sanitizeViewName(null as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("View name is required");
    });

    it("should return error for name exceeding 100 characters", () => {
      const result = sanitizeViewName("a".repeat(101));
      expect(result.valid).toBe(false);
      expect(result.error).toBe("View name cannot exceed 100 characters");
    });
  });

  describe("sanitizeViewConfig", () => {
    it("should accept a valid config object", () => {
      const config = {
        visibleEntities: ["useCase", "model"],
        visibleRelationships: ["hasRisk"],
        showProblemsOnly: true,
        showGapsOnly: false,
        query: {
          entityType: "model",
          condition: "active",
          attribute: "name",
        },
      };
      const result = sanitizeViewConfig(config);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toEqual(config);
    });

    it("should return error for non-object config", () => {
      expect(sanitizeViewConfig(null).valid).toBe(false);
      expect(sanitizeViewConfig(null).error).toBe("Valid config object is required");
      expect(sanitizeViewConfig("string").valid).toBe(false);
      expect(sanitizeViewConfig(123).valid).toBe(false);
    });

    it("should filter visibleEntities to valid strings with max 20 items and 50 chars", () => {
      const config = {
        visibleEntities: [
          ...Array.from({ length: 25 }, (_, i) => `entity${i}`),
          123,
          "a".repeat(51),
        ],
      };
      const result = sanitizeViewConfig(config);
      expect(result.valid).toBe(true);
      expect(result.sanitized.visibleEntities).toHaveLength(20);
      expect(result.sanitized.visibleEntities![0]).toBe("entity0");
    });

    it("should return error when visibleEntities is not an array", () => {
      const result = sanitizeViewConfig({ visibleEntities: "not-array" });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("visibleEntities must be an array");
    });

    it("should filter visibleRelationships similarly", () => {
      const config = {
        visibleRelationships: [
          "rel1",
          123,
          "a".repeat(51),
          ...Array.from({ length: 25 }, (_, i) => `rel${i}`),
        ],
      };
      const result = sanitizeViewConfig(config);
      expect(result.valid).toBe(true);
      expect(result.sanitized.visibleRelationships).toHaveLength(20);
    });

    it("should return error when visibleRelationships is not an array", () => {
      const result = sanitizeViewConfig({ visibleRelationships: true });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("visibleRelationships must be an array");
    });

    it("should validate boolean fields", () => {
      const truthy = sanitizeViewConfig({ showProblemsOnly: 1 });
      expect(truthy.valid).toBe(true);
      expect(truthy.sanitized.showProblemsOnly).toBe(true);

      const falsy = sanitizeViewConfig({ showGapsOnly: 0 });
      expect(falsy.valid).toBe(true);
      expect(falsy.sanitized.showGapsOnly).toBe(false);
    });

    it("should validate query sub-object with required string fields", () => {
      const result = sanitizeViewConfig({ query: { entityType: "model" } });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("query must have entityType, condition, and attribute strings");
    });

    it("should validate query field lengths", () => {
      const result = sanitizeViewConfig({
        query: {
          entityType: "a".repeat(51),
          condition: "active",
          attribute: "name",
        },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("query fields cannot exceed 50 characters");
    });

    it("should accept null query", () => {
      const result = sanitizeViewConfig({ query: null });
      expect(result.valid).toBe(true);
      expect(result.sanitized.query).toBeNull();
    });

    it("should omit undefined properties", () => {
      const result = sanitizeViewConfig({});
      expect(result.valid).toBe(true);
      expect(result.sanitized).toEqual({});
    });
  });

  describe("validateGapRules", () => {
    it("should accept a valid array of gap rules", () => {
      const rules = [
        {
          entityType: "model",
          requirement: "Must have owner",
          severity: "critical",
          enabled: true,
        },
        {
          entityType: "risk",
          requirement: "Must be assessed",
          severity: "warning",
          enabled: false,
        },
      ];
      expect(validateGapRules(rules)).toEqual({ valid: true });
    });

    it("should reject non-array input", () => {
      expect(validateGapRules(null)).toEqual({ valid: false, error: "Rules must be an array" });
      expect(validateGapRules({})).toEqual({ valid: false, error: "Rules must be an array" });
    });

    it("should reject arrays with more than 50 rules", () => {
      const rules = Array.from({ length: 51 }, (_, i) => ({
        entityType: "model",
        requirement: `Rule ${i}`,
        severity: "info",
        enabled: true,
      }));
      expect(validateGapRules(rules)).toEqual({
        valid: false,
        error: "Maximum of 50 gap rules allowed",
      });
    });

    it("should reject rules with invalid entityType", () => {
      const rules = [
        { entityType: "user", requirement: "Must exist", severity: "critical", enabled: true },
      ];
      expect(validateGapRules(rules)).toEqual({
        valid: false,
        error: "Rule 1: entityType must be one of: model, risk, control, vendor, useCase",
      });
    });

    it("should reject rules with missing or non-string requirement", () => {
      const rules = [{ entityType: "model", requirement: "", severity: "critical", enabled: true }];
      expect(validateGapRules(rules)).toEqual({
        valid: false,
        error: "Rule 1: requirement is required",
      });
    });

    it("should reject rules with requirement exceeding 100 characters", () => {
      const rules = [
        { entityType: "model", requirement: "a".repeat(101), severity: "critical", enabled: true },
      ];
      expect(validateGapRules(rules)).toEqual({
        valid: false,
        error: "Rule 1: requirement cannot exceed 100 characters",
      });
    });

    it("should reject rules with invalid severity", () => {
      const rules = [
        { entityType: "model", requirement: "Must have owner", severity: "high", enabled: true },
      ];
      expect(validateGapRules(rules)).toEqual({
        valid: false,
        error: "Rule 1: severity must be one of: critical, warning, info",
      });
    });

    it("should reject rules with non-boolean enabled", () => {
      const rules = [
        {
          entityType: "model",
          requirement: "Must have owner",
          severity: "critical",
          enabled: "yes",
        },
      ];
      expect(validateGapRules(rules)).toEqual({
        valid: false,
        error: "Rule 1: enabled must be a boolean",
      });
    });

    it("should reject non-object rules", () => {
      const rules = [null];
      expect(validateGapRules(rules)).toEqual({
        valid: false,
        error: "Rule 1: must be an object",
      });
    });
  });

  describe("sanitizeErrorMessage", () => {
    it("should return the original message when it is safe", () => {
      const error = new Error("Something went wrong");
      expect(sanitizeErrorMessage(error, "Fallback")).toBe("Something went wrong");
    });

    it("should return fallback for messages containing stack traces", () => {
      const error = new Error("Error at someFunction (/path/to/file.js:10:5)");
      expect(sanitizeErrorMessage(error, "An error occurred")).toBe("An error occurred");
    });

    it("should return fallback for messages containing system errors", () => {
      expect(
        sanitizeErrorMessage(new Error("ECONNREFUSED connection failed"), "An error occurred"),
      ).toBe("An error occurred");
      expect(sanitizeErrorMessage(new Error("ENOENT file not found"), "An error occurred")).toBe(
        "An error occurred",
      );
    });

    it("should return fallback for messages containing SQL keywords", () => {
      expect(sanitizeErrorMessage(new Error("SELECT * FROM users"), "An error occurred")).toBe(
        "An error occurred",
      );
      expect(sanitizeErrorMessage(new Error("INSERT INTO users"), "An error occurred")).toBe(
        "An error occurred",
      );
      expect(sanitizeErrorMessage(new Error("UPDATE users SET"), "An error occurred")).toBe(
        "An error occurred",
      );
      expect(sanitizeErrorMessage(new Error("DELETE FROM users"), "An error occurred")).toBe(
        "An error occurred",
      );
    });

    it("should return fallback for messages containing file paths", () => {
      expect(
        sanitizeErrorMessage(new Error("Error at /home/user/app.ts:10:5"), "An error occurred"),
      ).toBe("An error occurred");
      expect(
        sanitizeErrorMessage(new Error("Error at /path/to/file.js:20"), "An error occurred"),
      ).toBe("An error occurred");
    });

    it("should return fallback for messages containing node_modules", () => {
      expect(
        sanitizeErrorMessage(new Error("Error in node_modules/package"), "An error occurred"),
      ).toBe("An error occurred");
    });

    it("should return fallback for database constraint errors", () => {
      expect(sanitizeErrorMessage(new Error("UNIQUE constraint failed"), "An error occurred")).toBe(
        "An error occurred",
      );
      expect(
        sanitizeErrorMessage(new Error("foreign key constraint failed"), "An error occurred"),
      ).toBe("An error occurred");
      expect(
        sanitizeErrorMessage(
          new Error("duplicate key value violates unique constraint"),
          "An error occurred",
        ),
      ).toBe("An error occurred");
    });

    it("should return fallback for SQL syntax errors", () => {
      expect(
        sanitizeErrorMessage(new Error("syntax error at or near 'SELECT'"), "An error occurred"),
      ).toBe("An error occurred");
      expect(
        sanitizeErrorMessage(new Error("relation users does not exist"), "An error occurred"),
      ).toBe("An error occurred");
      expect(sanitizeErrorMessage(new Error("column id does not exist"), "An error occurred")).toBe(
        "An error occurred",
      );
    });

    it("should return fallback for messages exceeding 200 characters", () => {
      const error = new Error("a".repeat(201));
      expect(sanitizeErrorMessage(error, "An error occurred")).toBe("An error occurred");
    });

    it("should return fallback for empty messages", () => {
      const error = new Error("");
      expect(sanitizeErrorMessage(error, "An error occurred")).toBe("An error occurred");
    });
  });
});
