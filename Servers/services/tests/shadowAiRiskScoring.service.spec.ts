/**
 * @fileoverview Shadow AI Risk Scoring Service Tests
 *
 * Tests for composite risk scoring: approval weight, data policy,
 * usage volume, department sensitivity, and org isolation.
 *
 * @module tests/shadowAiRiskScoring.service
 */

// Mock database BEFORE other imports
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { calculateRiskScoresForOrganization } from "../shadowAiRiskScoring.service";
import { sequelize } from "../../database/db";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

describe("shadowAiRiskScoring.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("calculateRiskScoresForOrganization", () => {
    it("should return early when no tools exist", async () => {
      mockQuery.mockResolvedValueOnce([[], []] as any);

      await calculateRiskScoresForOrganization(1);

      // Only one query (the SELECT), no UPDATE
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("should calculate composite risk score with correct weights", async () => {
      // Tools query
      mockQuery.mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "ChatGPT",
            model_inventory_id: null, // not approved
            status: "detected",
            trains_on_data: true,
            soc2_certified: false,
            gdpr_compliant: false,
            sso_support: false,
            encryption_at_rest: false,
            total_events: 100,
          },
        ],
        [],
      ] as any);

      // Department usage query
      mockQuery.mockResolvedValueOnce([
        [{ detected_tool_id: 1, department: "finance" }],
        [],
      ] as any);

      // UPDATE query
      mockQuery.mockResolvedValueOnce([[], []] as any);

      await calculateRiskScoresForOrganization(1);

      // Verify the UPDATE was called with correct risk score
      // approval: 100 * 0.4 = 40 (not in inventory)
      // data_policy: (30+25+25+10+10) = 100 * 0.25 = 25
      // usage_volume: min(round((100/100)*50), 100) = 50 * 0.15 = 7.5
      // department: finance = 80 * 0.2 = 16
      // Total: 40 + 25 + 7.5 + 16 = 88.5 → round = 89
      expect(mockQuery).toHaveBeenCalledTimes(3);
      const updateCall = mockQuery.mock.calls[2];
      expect(updateCall[1]).toEqual(
        expect.objectContaining({
          replacements: expect.objectContaining({
            riskScore: 89,
            organizationId: 1,
            toolId: 1,
          }),
        }),
      );
    });

    it("should score approved tools with 0 approval weight", async () => {
      mockQuery.mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "Copilot",
            model_inventory_id: 10,
            status: "approved",
            trains_on_data: false,
            soc2_certified: true,
            gdpr_compliant: true,
            sso_support: true,
            encryption_at_rest: true,
            total_events: 50,
          },
        ],
        [],
      ] as any);

      mockQuery.mockResolvedValueOnce([[], []] as any); // no dept usage
      mockQuery.mockResolvedValueOnce([[], []] as any); // UPDATE

      await calculateRiskScoresForOrganization(1);

      const updateCall = mockQuery.mock.calls[2];
      // approval: 0 * 0.4 = 0
      // data_policy: 0 * 0.25 = 0
      // usage: 50 * 0.15 = 7.5 (round to 8)
      // dept: 0 * 0.2 = 0
      // Total: 8
      expect(updateCall[1]).toEqual(
        expect.objectContaining({
          replacements: expect.objectContaining({
            riskScore: 8,
          }),
        }),
      );
    });

    it("should use default sensitivity of 30 for unknown departments", async () => {
      mockQuery.mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "Tool",
            model_inventory_id: null,
            status: "detected",
            trains_on_data: false,
            soc2_certified: true,
            gdpr_compliant: true,
            sso_support: true,
            encryption_at_rest: true,
            total_events: 0,
          },
        ],
        [],
      ] as any);

      mockQuery.mockResolvedValueOnce([
        [{ detected_tool_id: 1, department: "custom_dept" }],
        [],
      ] as any);
      mockQuery.mockResolvedValueOnce([[], []] as any);

      await calculateRiskScoresForOrganization(1);

      const updateCall = mockQuery.mock.calls[2];
      // approval: 100 * 0.4 = 40
      // data_policy: 0 * 0.25 = 0
      // usage: 0 * 0.15 = 0
      // dept: 30 * 0.2 = 6 (unknown dept default)
      // Total: 46
      expect(updateCall[1]).toEqual(
        expect.objectContaining({
          replacements: expect.objectContaining({
            riskScore: 46,
          }),
        }),
      );
    });

    it("should use max department sensitivity when multiple departments", async () => {
      mockQuery.mockResolvedValueOnce([
        [
          {
            id: 1,
            name: "Tool",
            model_inventory_id: null,
            status: "detected",
            trains_on_data: false,
            soc2_certified: true,
            gdpr_compliant: true,
            sso_support: true,
            encryption_at_rest: true,
            total_events: 0,
          },
        ],
        [],
      ] as any);

      mockQuery.mockResolvedValueOnce([
        [
          { detected_tool_id: 1, department: "marketing" }, // 20
          { detected_tool_id: 1, department: "finance" }, // 80
        ],
        [],
      ] as any);
      mockQuery.mockResolvedValueOnce([[], []] as any);

      await calculateRiskScoresForOrganization(1);

      const updateCall = mockQuery.mock.calls[2];
      // dept: max(20, 80) = 80 * 0.2 = 16
      expect(updateCall[1]).toEqual(
        expect.objectContaining({
          replacements: expect.objectContaining({
            riskScore: 56, // 40 + 0 + 0 + 16
          }),
        }),
      );
    });

    it("should pass organizationId to all queries for isolation", async () => {
      mockQuery.mockResolvedValueOnce([[], []] as any);

      await calculateRiskScoresForOrganization(42);

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), {
        replacements: { organizationId: 42 },
      });
    });
  });
});
