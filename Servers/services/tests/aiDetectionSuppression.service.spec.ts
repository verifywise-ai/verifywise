/**
 * @fileoverview AI Detection Suppression Service Tests
 *
 * Tests for suppression rule CRUD operations.
 *
 * @module tests/aiDetectionSuppression.service
 */

jest.mock("../../utils/aiDetectionSuppression.utils", () => ({
  createSuppressionQuery: jest.fn(),
  listSuppressionsQuery: jest.fn(),
  deleteSuppressionQuery: jest.fn(),
}));

import {
  createSuppression,
  listSuppressions,
  deleteSuppression,
} from "../aiDetectionSuppression.service";
import {
  createSuppressionQuery,
  listSuppressionsQuery,
  deleteSuppressionQuery,
} from "../../utils/aiDetectionSuppression.utils";

const mockCreateSuppressionQuery = createSuppressionQuery as jest.MockedFunction<
  typeof createSuppressionQuery
>;
const mockListSuppressionsQuery = listSuppressionsQuery as jest.MockedFunction<
  typeof listSuppressionsQuery
>;
const mockDeleteSuppressionQuery = deleteSuppressionQuery as jest.MockedFunction<
  typeof deleteSuppressionQuery
>;

const ctx = { organizationId: 1, userId: 2, role: "Admin", tenantId: "1" };

describe("aiDetectionSuppression.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createSuppression", () => {
    it("should create a suppression rule with valid input", async () => {
      const input = {
        match_type: "exact" as const,
        field: "name" as const,
        value: "test-rule",
      };
      mockCreateSuppressionQuery.mockResolvedValue({ id: 1, ...input } as any);

      const result = await createSuppression(input, ctx);

      expect(mockCreateSuppressionQuery).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          match_type: "exact",
          field: "name",
          value: "test-rule",
          reason: null,
          expires_at: null,
        }),
        2,
      );
      expect(result.id).toBe(1);
    });

    it("should trim the value", async () => {
      const input = {
        match_type: "exact" as const,
        field: "name" as const,
        value: "  spaced  ",
      };
      mockCreateSuppressionQuery.mockResolvedValue({ id: 1 } as any);

      await createSuppression(input, ctx);

      expect(mockCreateSuppressionQuery).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ value: "spaced" }),
        2,
      );
    });

    it("should handle optional reason and expires_at", async () => {
      const input = {
        match_type: "pattern" as const,
        field: "finding_type" as const,
        value: "^prefix-.*",
        reason: "Testing",
        expires_at: "2026-12-31T00:00:00Z" as any,
      };
      mockCreateSuppressionQuery.mockResolvedValue({ id: 2 } as any);

      await createSuppression(input, ctx);

      expect(mockCreateSuppressionQuery).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          reason: "Testing",
          expires_at: expect.any(Date),
        }),
        2,
      );
    });

    it("should throw for invalid match_type", async () => {
      const input = { match_type: "invalid" as any, field: "name", value: "test" };
      await expect(createSuppression(input, ctx)).rejects.toThrow(
        "match_type must be one of: exact, pattern",
      );
    });

    it("should throw for invalid field", async () => {
      const input = { match_type: "exact" as const, field: "invalid" as any, value: "test" };
      await expect(createSuppression(input, ctx)).rejects.toThrow(
        "field must be one of: name, finding_type, category, provider",
      );
    });

    it("should throw for empty value", async () => {
      const input = { match_type: "exact" as const, field: "name" as const, value: "  " };
      await expect(createSuppression(input, ctx)).rejects.toThrow("value is required");
    });

    it("should throw for invalid regex in pattern mode", async () => {
      const input = { match_type: "pattern" as const, field: "name" as const, value: "[bad" };
      await expect(createSuppression(input, ctx)).rejects.toThrow(
        "value must be a valid regular expression",
      );
    });

    it("should throw for invalid expires_at", async () => {
      const input = {
        match_type: "exact" as const,
        field: "name" as const,
        value: "test",
        expires_at: "not-a-date" as any,
      };
      await expect(createSuppression(input, ctx)).rejects.toThrow(
        "expires_at must be a valid date",
      );
    });

    it("should allow null expires_at", async () => {
      const input = {
        match_type: "exact" as const,
        field: "name" as const,
        value: "test",
        expires_at: null,
      };
      mockCreateSuppressionQuery.mockResolvedValue({ id: 1 } as any);

      await createSuppression(input, ctx);

      expect(mockCreateSuppressionQuery).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ expires_at: null }),
        2,
      );
    });

    it("should throw for missing input body", async () => {
      await expect(createSuppression(null as any, ctx)).rejects.toThrow("Request body is required");
    });
  });

  describe("listSuppressions", () => {
    it("should return suppression rules for the organization", async () => {
      const rules = [{ id: 1 }, { id: 2 }] as any[];
      mockListSuppressionsQuery.mockResolvedValue(rules);

      const result = await listSuppressions(ctx);

      expect(mockListSuppressionsQuery).toHaveBeenCalledWith(1, {});
      expect(result).toEqual(rules);
    });

    it("should pass includeExpired option", async () => {
      mockListSuppressionsQuery.mockResolvedValue([]);

      await listSuppressions(ctx, { includeExpired: true });

      expect(mockListSuppressionsQuery).toHaveBeenCalledWith(1, { includeExpired: true });
    });
  });

  describe("deleteSuppression", () => {
    it("should delete an existing suppression rule", async () => {
      mockDeleteSuppressionQuery.mockResolvedValue(true);

      await deleteSuppression(5, ctx);

      expect(mockDeleteSuppressionQuery).toHaveBeenCalledWith(5, 1);
    });

    it("should throw NotFoundException for non-existent rule", async () => {
      mockDeleteSuppressionQuery.mockResolvedValue(false);

      await expect(deleteSuppression(999, ctx)).rejects.toThrow("Suppression rule 999 not found");
    });
  });
});
