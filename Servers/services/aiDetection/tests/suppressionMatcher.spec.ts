/**
 * @fileoverview Suppression Matcher Tests
 *
 * Tests for applySuppressions pure function.
 *
 * @module tests/suppressionMatcher
 */

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

import { applySuppressions } from "../suppressionMatcher";
import { ICreateFindingInput, ISuppression } from "../../../domain.layer/interfaces/i.aiDetection";

describe("suppressionMatcher", () => {
  describe("applySuppressions", () => {
    it("should return empty findings unchanged", () => {
      const result = applySuppressions([], []);
      expect(result).toEqual([]);
    });

    it("should return findings unchanged when no rules exist", () => {
      const findings: ICreateFindingInput[] = [
        { name: "test", finding_type: "secret", category: "security", provider: "openai" },
      ];
      const result = applySuppressions(findings, []);
      expect(result[0].suppressed).toBeUndefined();
    });

    it("should suppress findings with exact match", () => {
      const findings: ICreateFindingInput[] = [
        {
          name: "hardcoded-api-key",
          finding_type: "secret",
          category: "security",
          provider: "openai",
        },
      ];
      const rules: ISuppression[] = [
        { id: 1, field: "name", match_type: "exact", value: "hardcoded-api-key" } as ISuppression,
      ];
      const result = applySuppressions(findings, rules);
      expect(result[0].suppressed).toBe(true);
      expect(result[0].suppression_rule_id).toBe(1);
    });

    it("should suppress findings with pattern match", () => {
      const findings: ICreateFindingInput[] = [
        {
          name: "test-api-key-123",
          finding_type: "secret",
          category: "security",
          provider: "openai",
        },
      ];
      const rules: ISuppression[] = [
        { id: 2, field: "name", match_type: "pattern", value: "api-key-\\d+" } as ISuppression,
      ];
      const result = applySuppressions(findings, rules);
      expect(result[0].suppressed).toBe(true);
      expect(result[0].suppression_rule_id).toBe(2);
    });

    it("should not suppress when pattern does not match", () => {
      const findings: ICreateFindingInput[] = [
        { name: "safe-name", finding_type: "secret", category: "security", provider: "openai" },
      ];
      const rules: ISuppression[] = [
        { id: 3, field: "name", match_type: "pattern", value: "^prefix-" } as ISuppression,
      ];
      const result = applySuppressions(findings, rules);
      expect(result[0].suppressed).toBeUndefined();
    });

    it("should skip rule with invalid regex and log warning", () => {
      const findings: ICreateFindingInput[] = [
        { name: "anything", finding_type: "secret", category: "security", provider: "openai" },
      ];
      const rules: ISuppression[] = [
        { id: 4, field: "name", match_type: "pattern", value: "[invalid" } as ISuppression,
      ];
      const result = applySuppressions(findings, rules);
      expect(result[0].suppressed).toBeUndefined();
    });

    it("should match on different fields (finding_type, category, provider)", () => {
      const findings: ICreateFindingInput[] = [
        { name: "x", finding_type: "secret", category: "security", provider: "openai" },
        { name: "y", finding_type: "secret", category: "security", provider: "anthropic" },
      ];
      const rules: ISuppression[] = [
        { id: 5, field: "provider", match_type: "exact", value: "openai" } as ISuppression,
      ];
      const result = applySuppressions(findings, rules);
      expect(result[0].suppressed).toBe(true);
      expect(result[1].suppressed).toBeUndefined();
    });

    it("should use first matching rule and stop checking", () => {
      const findings: ICreateFindingInput[] = [
        { name: "match", finding_type: "secret", category: "security", provider: "openai" },
      ];
      const rules: ISuppression[] = [
        { id: 10, field: "name", match_type: "exact", value: "match" } as ISuppression,
        { id: 11, field: "name", match_type: "exact", value: "match" } as ISuppression,
      ];
      const result = applySuppressions(findings, rules);
      expect(result[0].suppression_rule_id).toBe(10);
    });

    it("should not suppress when finding field value is undefined", () => {
      const findings: ICreateFindingInput[] = [
        {
          name: undefined as any,
          finding_type: "secret",
          category: "security",
          provider: "openai",
        },
      ];
      const rules: ISuppression[] = [
        { id: 6, field: "name", match_type: "exact", value: "anything" } as ISuppression,
      ];
      const result = applySuppressions(findings, rules);
      expect(result[0].suppressed).toBeUndefined();
    });

    it("should handle null rule id by setting suppression_rule_id to null", () => {
      const findings: ICreateFindingInput[] = [
        { name: "test", finding_type: "secret", category: "security", provider: "openai" },
      ];
      const rules: ISuppression[] = [
        { id: null as any, field: "name", match_type: "exact", value: "test" } as ISuppression,
      ];
      const result = applySuppressions(findings, rules);
      expect(result[0].suppressed).toBe(true);
      expect(result[0].suppression_rule_id).toBeNull();
    });

    it("should process multiple findings against multiple rules", () => {
      const findings: ICreateFindingInput[] = [
        { name: "alpha", finding_type: "secret", category: "security", provider: "openai" },
        { name: "beta", finding_type: "secret", category: "ops", provider: "openai" },
        { name: "gamma", finding_type: "secret", category: "security", provider: "anthropic" },
      ];
      const rules: ISuppression[] = [
        { id: 20, field: "name", match_type: "exact", value: "alpha" } as ISuppression,
        { id: 21, field: "category", match_type: "exact", value: "ops" } as ISuppression,
      ];
      const result = applySuppressions(findings, rules);
      expect(result[0].suppressed).toBe(true);
      expect(result[0].suppression_rule_id).toBe(20);
      expect(result[1].suppressed).toBe(true);
      expect(result[1].suppression_rule_id).toBe(21);
      expect(result[2].suppressed).toBeUndefined();
    });
  });
});
