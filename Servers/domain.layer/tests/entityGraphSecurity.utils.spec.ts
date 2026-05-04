/**
 * @fileoverview Entity Graph Security Utils Tests
 *
 * Tests for security validation and sanitization functions.
 * These are critical security functions that validate user input.
 *
 * @module tests/entityGraphSecurity.utils
 */

import {
  isValidSchemaName,
  isValidEntityType,
  isValidEntityId,
  sanitizeAnnotationContent,
  sanitizeViewName,
  sanitizeViewConfig,
  validateGapRules,
  sanitizeErrorMessage,
  VALID_ENTITY_TYPES,
} from "../../utils/entityGraphSecurity.utils";

describe("entityGraphSecurity.utils", () => {
  // ============================================
  // isValidSchemaName Tests
  // ============================================
  describe("isValidSchemaName", () => {
    describe("valid schema names", () => {
      it("should return true for alphanumeric schema name", () => {
        expect(isValidSchemaName("abc123")).toBe(true);
      });

      it("should return true for lowercase letters only", () => {
        expect(isValidSchemaName("abcdefgh")).toBe(true);
      });

      it("should return true for uppercase letters only", () => {
        expect(isValidSchemaName("ABCDEFGH")).toBe(true);
      });

      it("should return true for numbers only", () => {
        expect(isValidSchemaName("12345678")).toBe(true);
      });

      it("should return true for mixed case alphanumeric", () => {
        expect(isValidSchemaName("AbC123XyZ")).toBe(true);
      });

      it("should return true for single character", () => {
        expect(isValidSchemaName("a")).toBe(true);
      });

      it("should return true for 63 character schema name (max length)", () => {
        const maxLengthName = "a".repeat(63);
        expect(isValidSchemaName(maxLengthName)).toBe(true);
      });
    });

    describe("invalid schema names", () => {
      it("should return false for empty string", () => {
        expect(isValidSchemaName("")).toBe(false);
      });

      it("should return false for null", () => {
        expect(isValidSchemaName(null as any)).toBe(false);
      });

      it("should return false for undefined", () => {
        expect(isValidSchemaName(undefined as any)).toBe(false);
      });

      it("should return false for schema name with spaces", () => {
        expect(isValidSchemaName("abc 123")).toBe(false);
      });

      it("should return false for schema name with hyphens", () => {
        expect(isValidSchemaName("abc-123")).toBe(false);
      });

      it("should return false for schema name with underscores", () => {
        expect(isValidSchemaName("abc_123")).toBe(false);
      });

      it("should return false for schema name with special characters", () => {
        expect(isValidSchemaName("abc@123")).toBe(false);
        expect(isValidSchemaName("abc!123")).toBe(false);
        expect(isValidSchemaName("abc#123")).toBe(false);
      });

      it("should return false for schema name with SQL injection attempt", () => {
        expect(isValidSchemaName("abc'; DROP TABLE--")).toBe(false);
      });

      it("should return false for schema name exceeding 63 characters", () => {
        const tooLongName = "a".repeat(64);
        expect(isValidSchemaName(tooLongName)).toBe(false);
      });

      it("should return false for non-string input", () => {
        expect(isValidSchemaName(123 as any)).toBe(false);
        expect(isValidSchemaName({} as any)).toBe(false);
        expect(isValidSchemaName([] as any)).toBe(false);
      });
    });
  });

  // ============================================
  // isValidEntityType Tests
  // ============================================
  describe("isValidEntityType", () => {
    describe("valid entity types", () => {
      it.each(VALID_ENTITY_TYPES)("should return true for valid entity type: %s", (entityType) => {
        expect(isValidEntityType(entityType)).toBe(true);
      });
    });

    describe("invalid entity types", () => {
      it("should return false for empty string", () => {
        expect(isValidEntityType("")).toBe(false);
      });

      it("should return false for null", () => {
        expect(isValidEntityType(null as any)).toBe(false);
      });

      it("should return false for undefined", () => {
        expect(isValidEntityType(undefined as any)).toBe(false);
      });

      it("should return false for unknown entity type", () => {
        expect(isValidEntityType("unknown")).toBe(false);
        expect(isValidEntityType("table")).toBe(false);
        expect(isValidEntityType("document")).toBe(false);
      });

      it("should return false for case-sensitive mismatch", () => {
        expect(isValidEntityType("UseCase")).toBe(false);
        expect(isValidEntityType("MODEL")).toBe(false);
        expect(isValidEntityType("RISK")).toBe(false);
      });

      it("should return false for entity type with extra characters", () => {
        expect(isValidEntityType("useCase ")).toBe(false);
        expect(isValidEntityType(" model")).toBe(false);
      });
    });
  });

  // ============================================
  // isValidEntityId Tests
  // ============================================
  describe("isValidEntityId", () => {
    describe("valid entity IDs", () => {
      it("should return true for valid entity ID format", () => {
        expect(isValidEntityId("useCase-123")).toBe(true);
        expect(isValidEntityId("model-456")).toBe(true);
        expect(isValidEntityId("risk-789")).toBe(true);
        expect(isValidEntityId("vendor-1")).toBe(true);
        expect(isValidEntityId("control-abc")).toBe(true);
        expect(isValidEntityId("evidence-xyz")).toBe(true);
        expect(isValidEntityId("framework-test")).toBe(true);
        expect(isValidEntityId("user-admin")).toBe(true);
      });

      it("should return true for entity ID with relation suffix", () => {
        expect(isValidEntityId("model-123-risks")).toBe(true);
        expect(isValidEntityId("useCase-456-controls")).toBe(true);
      });

      it("should return true for entity ID with underscores", () => {
        expect(isValidEntityId("model-123_test")).toBe(true);
      });

      it("should return true for entity ID at max length (100 chars)", () => {
        const maxLengthId = "useCase-" + "a".repeat(92);
        expect(isValidEntityId(maxLengthId)).toBe(true);
      });
    });

    describe("invalid entity IDs", () => {
      it("should return false for empty string", () => {
        expect(isValidEntityId("")).toBe(false);
      });

      it("should return false for null", () => {
        expect(isValidEntityId(null as any)).toBe(false);
      });

      it("should return false for undefined", () => {
        expect(isValidEntityId(undefined as any)).toBe(false);
      });

      it("should return false for entity ID not starting with valid type", () => {
        expect(isValidEntityId("invalid-123")).toBe(false);
        expect(isValidEntityId("123-model")).toBe(false);
        expect(isValidEntityId("test")).toBe(false);
      });

      it("should return false for entity ID with special characters", () => {
        expect(isValidEntityId("model-123@test")).toBe(false);
        expect(isValidEntityId("useCase-456!")).toBe(false);
        expect(isValidEntityId("risk-789#abc")).toBe(false);
      });

      it("should return false for entity ID with spaces", () => {
        expect(isValidEntityId("model-123 test")).toBe(false);
        expect(isValidEntityId("useCase 456")).toBe(false);
      });

      it("should return false for entity ID exceeding 100 characters", () => {
        const tooLongId = "useCase-" + "a".repeat(93);
        expect(isValidEntityId(tooLongId)).toBe(false);
      });

      it("should return false for SQL injection attempts", () => {
        expect(isValidEntityId("model-'; DROP TABLE--")).toBe(false);
      });
    });
  });

  // ============================================
  // sanitizeAnnotationContent Tests
  // ============================================
  describe("sanitizeAnnotationContent", () => {
    describe("valid content", () => {
      it("should return valid and sanitized content", () => {
        const result = sanitizeAnnotationContent("Test annotation");
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe("Test annotation");
        expect(result.error).toBeUndefined();
      });

      it("should trim whitespace from content", () => {
        const result = sanitizeAnnotationContent("  Test annotation  ");
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe("Test annotation");
      });

      it("should allow content at max length (2000 chars)", () => {
        const maxContent = "a".repeat(2000);
        const result = sanitizeAnnotationContent(maxContent);
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe(maxContent);
      });

      it("should allow special characters in content", () => {
        const content = "Test <b>annotation</b> with @mentions and #tags!";
        const result = sanitizeAnnotationContent(content);
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe(content);
      });

      it("should allow unicode characters", () => {
        const content = "Test annotation with emoji 🎉 and unicode: 你好";
        const result = sanitizeAnnotationContent(content);
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe(content);
      });
    });

    describe("invalid content", () => {
      it("should return invalid for empty string", () => {
        const result = sanitizeAnnotationContent("");
        expect(result.valid).toBe(false);
        expect(result.sanitized).toBe("");
        expect(result.error).toBe("Content is required");
      });

      it("should return invalid for whitespace-only string", () => {
        const result = sanitizeAnnotationContent("   ");
        expect(result.valid).toBe(false);
        expect(result.sanitized).toBe("");
        expect(result.error).toBe("Content cannot be empty");
      });

      it("should return invalid for null", () => {
        const result = sanitizeAnnotationContent(null as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Content is required");
      });

      it("should return invalid for undefined", () => {
        const result = sanitizeAnnotationContent(undefined as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Content is required");
      });

      it("should return invalid for content exceeding 2000 characters", () => {
        const tooLongContent = "a".repeat(2001);
        const result = sanitizeAnnotationContent(tooLongContent);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Content cannot exceed 2000 characters");
      });

      it("should return invalid for non-string input", () => {
        const result = sanitizeAnnotationContent(123 as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Content is required");
      });
    });
  });

  // ============================================
  // sanitizeViewName Tests
  // ============================================
  describe("sanitizeViewName", () => {
    describe("valid view names", () => {
      it("should return valid and sanitized name", () => {
        const result = sanitizeViewName("My View");
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe("My View");
        expect(result.error).toBeUndefined();
      });

      it("should trim whitespace from name", () => {
        const result = sanitizeViewName("  My View  ");
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe("My View");
      });

      it("should allow name at max length (100 chars)", () => {
        const maxName = "a".repeat(100);
        const result = sanitizeViewName(maxName);
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe(maxName);
      });
    });

    describe("invalid view names", () => {
      it("should return invalid for empty string", () => {
        const result = sanitizeViewName("");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("View name is required");
      });

      it("should return invalid for whitespace-only string", () => {
        const result = sanitizeViewName("   ");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("View name cannot be empty");
      });

      it("should return invalid for null", () => {
        const result = sanitizeViewName(null as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("View name is required");
      });

      it("should return invalid for name exceeding 100 characters", () => {
        const tooLongName = "a".repeat(101);
        const result = sanitizeViewName(tooLongName);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("View name cannot exceed 100 characters");
      });
    });
  });

  // ============================================
  // sanitizeViewConfig Tests
  // ============================================
  describe("sanitizeViewConfig", () => {
    describe("valid configs", () => {
      it("should return valid for empty config object", () => {
        const result = sanitizeViewConfig({});
        expect(result.valid).toBe(true);
        expect(result.sanitized).toEqual({});
      });

      it("should sanitize visibleEntities array", () => {
        const config = { visibleEntities: ["model", "risk", "control"] };
        const result = sanitizeViewConfig(config);
        expect(result.valid).toBe(true);
        expect(result.sanitized.visibleEntities).toEqual(["model", "risk", "control"]);
      });

      it("should sanitize visibleRelationships array", () => {
        const config = { visibleRelationships: ["hasRisk", "hasControl"] };
        const result = sanitizeViewConfig(config);
        expect(result.valid).toBe(true);
        expect(result.sanitized.visibleRelationships).toEqual(["hasRisk", "hasControl"]);
      });

      it("should sanitize boolean flags", () => {
        const config = { showProblemsOnly: true, showGapsOnly: false };
        const result = sanitizeViewConfig(config);
        expect(result.valid).toBe(true);
        expect(result.sanitized.showProblemsOnly).toBe(true);
        expect(result.sanitized.showGapsOnly).toBe(false);
      });

      it("should sanitize query object", () => {
        const config = {
          query: {
            entityType: "model",
            condition: "equals",
            attribute: "status",
          },
        };
        const result = sanitizeViewConfig(config);
        expect(result.valid).toBe(true);
        expect(result.sanitized.query).toEqual({
          entityType: "model",
          condition: "equals",
          attribute: "status",
        });
      });

      it("should allow null query", () => {
        const config = { query: null };
        const result = sanitizeViewConfig(config);
        expect(result.valid).toBe(true);
        expect(result.sanitized.query).toBeNull();
      });

      it("should limit visibleEntities to 20 items", () => {
        const config = {
          visibleEntities: Array(25)
            .fill(null)
            .map((_, i) => `entity${i}`),
        };
        const result = sanitizeViewConfig(config);
        expect(result.valid).toBe(true);
        expect(result.sanitized.visibleEntities?.length).toBe(20);
      });

      it("should filter out strings exceeding 50 chars in arrays", () => {
        const config = {
          visibleEntities: ["valid", "a".repeat(51), "alsoValid"],
        };
        const result = sanitizeViewConfig(config);
        expect(result.valid).toBe(true);
        expect(result.sanitized.visibleEntities).toEqual(["valid", "alsoValid"]);
      });
    });

    describe("invalid configs", () => {
      it("should return invalid for null", () => {
        const result = sanitizeViewConfig(null);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Valid config object is required");
      });

      it("should return invalid for undefined", () => {
        const result = sanitizeViewConfig(undefined);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Valid config object is required");
      });

      it("should return invalid for non-object", () => {
        const result = sanitizeViewConfig("string" as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Valid config object is required");
      });

      it("should return invalid for non-array visibleEntities", () => {
        const config = { visibleEntities: "not-array" as any };
        const result = sanitizeViewConfig(config);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("visibleEntities must be an array");
      });

      it("should return invalid for non-array visibleRelationships", () => {
        const config = { visibleRelationships: "not-array" as any };
        const result = sanitizeViewConfig(config);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("visibleRelationships must be an array");
      });

      it("should return invalid for query missing required fields", () => {
        const config = { query: { entityType: "model" } as any };
        const result = sanitizeViewConfig(config);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("query must have entityType, condition, and attribute strings");
      });

      it("should return invalid for query fields exceeding 50 chars", () => {
        const config = {
          query: {
            entityType: "a".repeat(51),
            condition: "equals",
            attribute: "status",
          },
        };
        const result = sanitizeViewConfig(config);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("query fields cannot exceed 50 characters");
      });
    });
  });

  // ============================================
  // validateGapRules Tests
  // ============================================
  describe("validateGapRules", () => {
    describe("valid rules", () => {
      it("should return valid for empty array", () => {
        const result = validateGapRules([]);
        expect(result.valid).toBe(true);
      });

      it("should return valid for valid rule array", () => {
        const rules = [
          {
            entityType: "model",
            requirement: "has_risk",
            severity: "warning",
            enabled: true,
          },
          {
            entityType: "risk",
            requirement: "has_control",
            severity: "critical",
            enabled: false,
          },
        ];
        const result = validateGapRules(rules);
        expect(result.valid).toBe(true);
      });

      it("should return valid for all entity types", () => {
        const entityTypes = ["model", "risk", "control", "vendor", "useCase"];
        const rules = entityTypes.map((entityType) => ({
          entityType,
          requirement: "test",
          severity: "warning" as const,
          enabled: true,
        }));
        const result = validateGapRules(rules);
        expect(result.valid).toBe(true);
      });

      it("should return valid for all severity levels", () => {
        const severities = ["critical", "warning", "info"];
        const rules = severities.map((severity) => ({
          entityType: "model",
          requirement: "test",
          severity,
          enabled: true,
        }));
        const result = validateGapRules(rules);
        expect(result.valid).toBe(true);
      });
    });

    describe("invalid rules", () => {
      it("should return invalid for non-array", () => {
        const result = validateGapRules("not-array" as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Rules must be an array");
      });

      it("should return invalid for more than 50 rules", () => {
        const rules = Array(51)
          .fill(null)
          .map(() => ({
            entityType: "model",
            requirement: "test",
            severity: "warning",
            enabled: true,
          }));
        const result = validateGapRules(rules);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Maximum of 50 gap rules allowed");
      });

      it("should return invalid for rule with invalid entityType", () => {
        const rules = [
          {
            entityType: "invalid",
            requirement: "test",
            severity: "warning",
            enabled: true,
          },
        ];
        const result = validateGapRules(rules);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("entityType must be one of");
      });

      it("should return invalid for rule without requirement", () => {
        const rules = [
          {
            entityType: "model",
            requirement: "",
            severity: "warning",
            enabled: true,
          },
        ];
        const result = validateGapRules(rules);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("requirement is required");
      });

      it("should return invalid for requirement exceeding 100 chars", () => {
        const rules = [
          {
            entityType: "model",
            requirement: "a".repeat(101),
            severity: "warning",
            enabled: true,
          },
        ];
        const result = validateGapRules(rules);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("requirement cannot exceed 100 characters");
      });

      it("should return invalid for rule with invalid severity", () => {
        const rules = [
          {
            entityType: "model",
            requirement: "test",
            severity: "invalid",
            enabled: true,
          },
        ];
        const result = validateGapRules(rules);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("severity must be one of");
      });

      it("should return invalid for rule with non-boolean enabled", () => {
        const rules = [
          {
            entityType: "model",
            requirement: "test",
            severity: "warning",
            enabled: "true" as any,
          },
        ];
        const result = validateGapRules(rules);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("enabled must be a boolean");
      });

      it("should return invalid for null rule in array", () => {
        const rules = [null];
        const result = validateGapRules(rules);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("must be an object");
      });
    });
  });

  // ============================================
  // sanitizeErrorMessage Tests
  // ============================================
  describe("sanitizeErrorMessage", () => {
    const fallbackMessage = "An error occurred";

    describe("safe messages", () => {
      it("should return original message for safe error", () => {
        const error = new Error("User not found");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe("User not found");
      });

      it("should return original message for short safe error", () => {
        const error = new Error("Invalid input");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe("Invalid input");
      });
    });

    describe("unsafe messages - should return fallback", () => {
      it("should sanitize stack trace patterns", () => {
        const error = new Error("Error at Object.method (file.ts:10:5)");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize SQL keywords", () => {
        const error = new Error("SELECT * FROM users failed");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize INSERT statements", () => {
        const error = new Error("INSERT INTO table failed");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize UPDATE statements", () => {
        const error = new Error("UPDATE table SET column failed");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize DELETE statements", () => {
        const error = new Error("DELETE FROM table failed");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize file path patterns (.ts)", () => {
        const error = new Error("Error in /src/service.ts:50");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize file path patterns (.js)", () => {
        const error = new Error("Error in /dist/service.js:50");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize node_modules paths", () => {
        const error = new Error("Error in node_modules/sequelize");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize system errors (ENOENT)", () => {
        const error = new Error("ENOENT: no such file or directory");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize system errors (ECONNREFUSED)", () => {
        const error = new Error("ECONNREFUSED: connection refused");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize unique constraint errors", () => {
        const error = new Error("UNIQUE constraint failed: users.email");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize foreign key errors", () => {
        const error = new Error("foreign key constraint failed");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize duplicate key errors", () => {
        const error = new Error("duplicate key value violates unique");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize syntax errors", () => {
        const error = new Error("syntax error at or near SELECT");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize relation not found errors", () => {
        const error = new Error('relation "users" does not exist');
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize column not found errors", () => {
        const error = new Error('column "email" does not exist');
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should sanitize very long messages (> 200 chars)", () => {
        const error = new Error("a".repeat(201));
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });
    });

    describe("edge cases", () => {
      it("should return fallback for error with empty message", () => {
        const error = new Error("");
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });

      it("should return fallback for error with undefined message", () => {
        const error = new Error();
        error.message = undefined as any;
        const result = sanitizeErrorMessage(error, fallbackMessage);
        expect(result).toBe(fallbackMessage);
      });
    });
  });
});
