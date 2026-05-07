/**
 * @fileoverview Shadow AI Aggregation Service Tests
 *
 * Tests for daily/monthly rollups, data purge, and nightly risk scoring.
 *
 * @module tests/shadowAiAggregation.service
 */

// Mock database BEFORE other imports
jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
  },
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../shadowAiRiskScoring.service", () => ({
  calculateRiskScoresForOrganization: jest.fn(),
}));

jest.mock("../../utils/shadowAiConfig.utils", () => ({
  getSettingsQuery: jest.fn(),
}));

import {
  runDailyRollup,
  runMonthlyRollup,
  purgeOldEvents,
  runNightlyRiskScoring,
} from "../shadowAiAggregation.service";
import { sequelize } from "../../database/db";
import { calculateRiskScoresForOrganization } from "../shadowAiRiskScoring.service";
import { getSettingsQuery } from "../../utils/shadowAiConfig.utils";
import logger from "../../utils/logger/fileLogger";

// Cast mocks
const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const mockCalcRisk = calculateRiskScoresForOrganization as jest.MockedFunction<
  typeof calculateRiskScoresForOrganization
>;
const mockGetSettings = getSettingsQuery as jest.MockedFunction<typeof getSettingsQuery>;

describe("shadowAiAggregation.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper: mock getAllOrganizationIds to return specified org IDs
  const mockOrgIds = (orgIds: number[]) => {
    mockQuery.mockResolvedValueOnce([orgIds.map((id) => ({ organization_id: id }))] as any);
  };

  describe("runDailyRollup", () => {
    it("should query per organization", async () => {
      mockOrgIds([1, 2, 3]);
      // Each org query resolves
      mockQuery.mockResolvedValue(undefined as any);

      await runDailyRollup();

      // 1 call for getAllOrganizationIds + 3 calls for each org rollup
      expect(mockQuery).toHaveBeenCalledTimes(4);
    });

    it("should continue processing on org failure", async () => {
      mockOrgIds([1, 2]);
      // First org fails
      mockQuery.mockRejectedValueOnce(new Error("DB error org 1"));
      // Second org succeeds
      mockQuery.mockResolvedValueOnce(undefined as any);

      await runDailyRollup();

      // Should have tried both orgs (1 getAllOrgs + 2 org queries)
      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Daily rollup failed for organization 1"),
        expect.any(Error),
      );
    });

    it("should handle empty org list", async () => {
      mockOrgIds([]);

      await runDailyRollup();

      // Only the initial getAllOrganizationIds query
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe("runMonthlyRollup", () => {
    it("should query per organization", async () => {
      mockOrgIds([10, 20]);
      mockQuery.mockResolvedValue(undefined as any);

      await runMonthlyRollup();

      // 1 getAllOrgs + 2 org rollup queries
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it("should continue processing on org failure", async () => {
      mockOrgIds([10, 20]);
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      mockQuery.mockResolvedValueOnce(undefined as any);

      await runMonthlyRollup();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Monthly rollup failed for organization 10"),
        expect.any(Error),
      );
    });
  });

  describe("purgeOldEvents", () => {
    it("should respect retention settings and purge data", async () => {
      mockOrgIds([1]);
      mockGetSettings.mockResolvedValue({
        retention_events_days: 30,
        retention_daily_rollups_days: 90,
        retention_alert_history_days: 180,
      } as any);
      // Each delete query returns [undefined, rowCount]
      mockQuery.mockResolvedValueOnce([undefined, 5] as any);
      mockQuery.mockResolvedValueOnce([undefined, 2] as any);
      mockQuery.mockResolvedValueOnce([undefined, 1] as any);

      await purgeOldEvents();

      expect(mockGetSettings).toHaveBeenCalledWith(1);
      // 1 getAllOrgs + 3 delete queries
      expect(mockQuery).toHaveBeenCalledTimes(4);
    });

    it("should skip purge when retention days is 0", async () => {
      mockOrgIds([1]);
      mockGetSettings.mockResolvedValue({
        retention_events_days: 0,
        retention_daily_rollups_days: 0,
        retention_alert_history_days: 0,
      } as any);

      await purgeOldEvents();

      // 1 getAllOrgs only, no delete queries
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockGetSettings).toHaveBeenCalledWith(1);
    });

    it("should continue on org failure during purge", async () => {
      mockOrgIds([1, 2]);
      mockGetSettings.mockRejectedValueOnce(new Error("settings error")).mockResolvedValueOnce({
        retention_events_days: 30,
        retention_daily_rollups_days: 0,
        retention_alert_history_days: 0,
      } as any);
      mockQuery.mockResolvedValue([undefined, 0] as any);

      await purgeOldEvents();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Data retention cleanup failed for organization 1"),
        expect.any(Error),
      );
    });
  });

  describe("runNightlyRiskScoring", () => {
    it("should call calculateRiskScoresForOrganization per org", async () => {
      mockOrgIds([1, 2, 3]);
      mockCalcRisk.mockResolvedValue(undefined as any);

      await runNightlyRiskScoring();

      expect(mockCalcRisk).toHaveBeenCalledTimes(3);
      expect(mockCalcRisk).toHaveBeenCalledWith(1);
      expect(mockCalcRisk).toHaveBeenCalledWith(2);
      expect(mockCalcRisk).toHaveBeenCalledWith(3);
    });

    it("should continue on org failure during risk scoring", async () => {
      mockOrgIds([1, 2]);
      mockCalcRisk
        .mockRejectedValueOnce(new Error("scoring error"))
        .mockResolvedValueOnce(undefined as any);

      await runNightlyRiskScoring();

      expect(mockCalcRisk).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Risk scoring failed for organization 1"),
        expect.any(Error),
      );
    });
  });
});
