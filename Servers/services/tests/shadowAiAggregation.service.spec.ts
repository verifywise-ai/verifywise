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

jest.mock("../../utils/dataRetention.utils", () => ({
  safeRecordRetentionRun: jest.fn(),
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
import { safeRecordRetentionRun as recordRetentionRun } from "../../utils/dataRetention.utils";

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

  // A purge statement returns one row: the database's cutoff and the count.
  const CUTOFF = "2026-09-12 02:00:00.123+00";
  const purged = (count: number) => [[{ cutoff: CUTOFF, deleted_count: count }], 1] as any;

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
      mockQuery.mockResolvedValueOnce(purged(5));
      mockQuery.mockResolvedValueOnce(purged(2));
      mockQuery.mockResolvedValueOnce(purged(1));

      await purgeOldEvents();

      expect(mockGetSettings).toHaveBeenCalledWith(1);
      // 1 getAllOrgs + 3 delete queries
      expect(mockQuery).toHaveBeenCalledTimes(4);
      // The cutoff is computed in SQL and the DELETE compares against it.
      const deleteSql = String(mockQuery.mock.calls[1][0]);
      expect(deleteSql).toContain("SELECT NOW() - INTERVAL '1 day' * :days AS cutoff");
      expect(deleteSql).toContain("t.event_timestamp < params.cutoff");
      expect(recordRetentionRun).toHaveBeenCalledTimes(3);
      expect(recordRetentionRun).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 1,
          recordType: "shadow_ai_events",
          deletedCount: 5,
          status: "success",
          cutoff: CUTOFF,
        }),
      );
      expect(recordRetentionRun).toHaveBeenCalledWith(
        expect.objectContaining({ recordType: "shadow_ai_daily_rollups", deletedCount: 2 }),
      );
      expect(recordRetentionRun).toHaveBeenCalledWith(
        expect.objectContaining({ recordType: "shadow_ai_alert_history", deletedCount: 1 }),
      );
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
      expect(recordRetentionRun).not.toHaveBeenCalled();
      expect(mockGetSettings).toHaveBeenCalledWith(1);
    });

    it("should continue on org failure during purge", async () => {
      mockOrgIds([1, 2]);
      mockGetSettings.mockRejectedValueOnce(new Error("settings error")).mockResolvedValueOnce({
        retention_events_days: 30,
        retention_daily_rollups_days: 0,
        retention_alert_history_days: 0,
      } as any);
      mockQuery.mockResolvedValue(purged(0));

      await purgeOldEvents();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Data retention cleanup failed for organization 1"),
        expect.any(Error),
      );
      // Without its settings, org 1 records a failed run (no cutoff) per type.
      for (const recordType of [
        "shadow_ai_events",
        "shadow_ai_daily_rollups",
        "shadow_ai_alert_history",
      ]) {
        expect(recordRetentionRun).toHaveBeenCalledWith({
          organizationId: 1,
          recordType,
          cutoff: null,
          deletedCount: 0,
          status: "failed",
          error: expect.objectContaining({ message: "settings error" }),
        });
      }
      // Org 2 still ran its events cleanup.
      expect(recordRetentionRun).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 2,
          recordType: "shadow_ai_events",
          status: "success",
        }),
      );
      expect(recordRetentionRun).toHaveBeenCalledTimes(4);
    });

    it("records a failed run for a cleanup that fails and still runs the others", async () => {
      mockOrgIds([1]);
      mockGetSettings.mockResolvedValue({
        retention_events_days: 30,
        retention_daily_rollups_days: 90,
        retention_alert_history_days: 0,
      } as any);
      mockQuery.mockRejectedValueOnce(new Error("lock timeout"));
      mockQuery.mockResolvedValueOnce(purged(4));

      await purgeOldEvents();

      expect(recordRetentionRun).toHaveBeenCalledTimes(2);
      expect(recordRetentionRun).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 1,
          recordType: "shadow_ai_events",
          deletedCount: 0,
          status: "failed",
          cutoff: null,
          error: expect.objectContaining({ message: "lock timeout" }),
        }),
      );
      expect(recordRetentionRun).toHaveBeenCalledWith(
        expect.objectContaining({
          recordType: "shadow_ai_daily_rollups",
          deletedCount: 4,
          status: "success",
        }),
      );
      // Period 0 means keep forever: no run, failed or otherwise.
      expect(recordRetentionRun).not.toHaveBeenCalledWith(
        expect.objectContaining({ recordType: "shadow_ai_alert_history" }),
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
