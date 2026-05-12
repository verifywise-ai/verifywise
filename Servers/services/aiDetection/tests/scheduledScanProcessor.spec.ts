/**
 * @fileoverview Scheduled Scan Processor Tests
 *
 * Tests for BullMQ worker processing scheduled AI detection scans.
 *
 * @module tests/scheduledScanProcessor
 */

jest.mock("../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
}));

jest.mock("../../../utils/aiDetectionRepository.utils", () => ({
  getRepositoriesDueForScanQuery: jest.fn(),
  updateRepositoryNextScanAtQuery: jest.fn(),
  computeNextScanAt: jest.fn(),
}));

jest.mock("../../../utils/aiDetection.utils", () => ({
  getActiveScanForRepoQuery: jest.fn(),
  markStaleScansFailed: jest.fn(),
}));

jest.mock("../../aiDetection.service", () => ({
  startScan: jest.fn(),
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();

jest.mock("../../../database/redis", () => ({
  default: {
    set: (...args: any[]) => mockRedisSet(...args),
    del: (...args: any[]) => mockRedisDel(...args),
  },
  __esModule: true,
}));

import { processScheduledAiDetectionScans } from "../scheduledScanProcessor";
import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import {
  getRepositoriesDueForScanQuery,
  updateRepositoryNextScanAtQuery,
  computeNextScanAt,
} from "../../../utils/aiDetectionRepository.utils";
import { getActiveScanForRepoQuery, markStaleScansFailed } from "../../../utils/aiDetection.utils";
import { startScan } from "../../aiDetection.service";

const mockGetAllOrgs = getAllOrganizationsQuery as jest.MockedFunction<
  typeof getAllOrganizationsQuery
>;
const mockGetDueRepos = getRepositoriesDueForScanQuery as jest.MockedFunction<
  typeof getRepositoriesDueForScanQuery
>;
const mockUpdateNextScan = updateRepositoryNextScanAtQuery as jest.MockedFunction<
  typeof updateRepositoryNextScanAtQuery
>;
const mockComputeNextScan = computeNextScanAt as jest.MockedFunction<typeof computeNextScanAt>;
const mockGetActiveScan = getActiveScanForRepoQuery as jest.MockedFunction<
  typeof getActiveScanForRepoQuery
>;
const mockMarkStale = markStaleScansFailed as jest.MockedFunction<typeof markStaleScansFailed>;
const mockStartScan = startScan as jest.MockedFunction<typeof startScan>;

describe("scheduledScanProcessor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisSet.mockResolvedValue("OK");
    mockRedisDel.mockResolvedValue(1);
  });

  describe("processScheduledAiDetectionScans", () => {
    it("should do nothing when no organizations exist", async () => {
      mockGetAllOrgs.mockResolvedValue([]);
      await processScheduledAiDetectionScans();
      expect(mockGetDueRepos).not.toHaveBeenCalled();
    });

    it("should skip organization when lock is already held", async () => {
      mockGetAllOrgs.mockResolvedValue([{ id: 1 }] as any);
      mockRedisSet.mockResolvedValue(null);

      await processScheduledAiDetectionScans();

      expect(mockRedisSet).toHaveBeenCalledWith(
        "ai-detection-scan-lock:org-1",
        expect.any(String),
        "PX",
        240000,
        "NX",
      );
      expect(mockGetDueRepos).not.toHaveBeenCalled();
    });

    it("should mark stale scans before processing", async () => {
      mockGetAllOrgs.mockResolvedValue([{ id: 1 }] as any);
      mockMarkStale.mockResolvedValue(3);
      mockGetDueRepos.mockResolvedValue([]);

      await processScheduledAiDetectionScans();

      expect(mockMarkStale).toHaveBeenCalledWith(1, 30);
    });

    it("should skip repo with active scan in progress", async () => {
      mockGetAllOrgs.mockResolvedValue([{ id: 1 }] as any);
      mockMarkStale.mockResolvedValue(0);
      mockGetDueRepos.mockResolvedValue([
        {
          id: 10,
          repository_owner: "owner",
          repository_name: "repo",
          repository_url: "https://github.com/owner/repo",
          created_by: 5,
          schedule_frequency: "daily",
          schedule_hour: 2,
          schedule_minute: 0,
        },
      ] as any);
      mockGetActiveScan.mockResolvedValue({ id: 99 } as any);

      await processScheduledAiDetectionScans();

      expect(mockGetActiveScan).toHaveBeenCalledWith("owner", "repo", 1);
      expect(mockStartScan).not.toHaveBeenCalled();
    });

    it("should start scan for due repository", async () => {
      const nextScanAt = new Date("2026-01-01T00:00:00Z");
      mockGetAllOrgs.mockResolvedValue([{ id: 1 }] as any);
      mockMarkStale.mockResolvedValue(0);
      mockGetDueRepos.mockResolvedValue([
        {
          id: 10,
          repository_owner: "owner",
          repository_name: "repo",
          repository_url: "https://github.com/owner/repo",
          created_by: 5,
          schedule_frequency: "daily",
          schedule_day_of_week: null,
          schedule_day_of_month: null,
          schedule_hour: 2,
          schedule_minute: 0,
        },
      ] as any);
      mockGetActiveScan.mockResolvedValue(null);
      mockComputeNextScan.mockReturnValue(nextScanAt);

      await processScheduledAiDetectionScans();

      expect(mockUpdateNextScan).toHaveBeenCalledWith(10, nextScanAt, 1);
      expect(mockStartScan).toHaveBeenCalledWith(
        "https://github.com/owner/repo",
        expect.objectContaining({
          userId: 5,
          organizationId: 1,
          role: "Admin",
          tenantId: "1",
        }),
        { repositoryId: 10, triggeredByType: "scheduled" },
      );
    });

    it("should not update next_scan_at when schedule_frequency is null", async () => {
      mockGetAllOrgs.mockResolvedValue([{ id: 1 }] as any);
      mockMarkStale.mockResolvedValue(0);
      mockGetDueRepos.mockResolvedValue([
        {
          id: 10,
          repository_owner: "owner",
          repository_name: "repo",
          repository_url: "https://github.com/owner/repo",
          created_by: 5,
          schedule_frequency: null,
        },
      ] as any);
      mockGetActiveScan.mockResolvedValue(null);

      await processScheduledAiDetectionScans();

      expect(mockUpdateNextScan).not.toHaveBeenCalled();
      expect(mockStartScan).toHaveBeenCalled();
    });

    it("should release lock after processing", async () => {
      mockGetAllOrgs.mockResolvedValue([{ id: 1 }] as any);
      mockMarkStale.mockResolvedValue(0);
      mockGetDueRepos.mockResolvedValue([]);

      await processScheduledAiDetectionScans();

      expect(mockRedisDel).toHaveBeenCalledWith("ai-detection-scan-lock:org-1");
    });

    it("should release lock even on tenant error", async () => {
      mockGetAllOrgs.mockResolvedValue([{ id: 1 }] as any);
      mockMarkStale.mockRejectedValue(new Error("DB error"));

      await processScheduledAiDetectionScans();

      expect(mockRedisDel).toHaveBeenCalledWith("ai-detection-scan-lock:org-1");
    });

    it("should handle repo-level errors without stopping other repos", async () => {
      mockGetAllOrgs.mockResolvedValue([{ id: 1 }] as any);
      mockMarkStale.mockResolvedValue(0);
      mockGetDueRepos.mockResolvedValue([
        {
          id: 10,
          repository_owner: "owner",
          repository_name: "repo",
          repository_url: "https://github.com/owner/repo",
          created_by: 5,
          schedule_frequency: null,
        },
      ] as any);
      mockGetActiveScan.mockRejectedValue(new Error("DB error"));

      await processScheduledAiDetectionScans();

      expect(mockStartScan).not.toHaveBeenCalled();
      expect(mockRedisDel).toHaveBeenCalled();
    });

    it("should process multiple organizations", async () => {
      mockGetAllOrgs.mockResolvedValue([{ id: 1 }, { id: 2 }] as any);
      mockMarkStale.mockResolvedValue(0);
      mockGetDueRepos.mockResolvedValue([]);

      await processScheduledAiDetectionScans();

      expect(mockRedisSet).toHaveBeenCalledTimes(2);
      expect(mockRedisDel).toHaveBeenCalledTimes(2);
    });
  });
});
