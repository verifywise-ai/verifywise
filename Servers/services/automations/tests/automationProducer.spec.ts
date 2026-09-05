/**
 * @fileoverview Automation Producer Tests
 *
 * Tests for enqueueAutomationAction and schedule* functions.
 *
 * @module tests/automationProducer
 */

jest.mock("bullmq", () => {
  const mockAdd = jest.fn().mockResolvedValue({ id: "job-1" });
  const mockObliterate = jest.fn().mockResolvedValue(undefined);
  const mockUpsertJobScheduler = jest.fn().mockResolvedValue({ id: "job-1" });
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: mockAdd,
      obliterate: mockObliterate,
      upsertJobScheduler: mockUpsertJobScheduler,
    })),
  };
});

jest.mock("../../../database/redis", () => ({
  REDIS_URL: "redis://localhost:6379",
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

import {
  enqueueAutomationAction,
  automationQueue,
  scheduleVendorReviewDateNotification,
  schedulePolicyDueSoonNotification,
  scheduleReportNotification,
  schedulePMMHourlyCheck,
  scheduleShadowAiJobs,
  scheduleAgentDiscoverySync,
  scheduleAiDetectionScanCheck,
  scheduleAiGatewayRiskDetection,
  scheduleAiGatewayCacheCleanup,
  scheduleMcpGatewayCleanup,
  scheduleEvidenceExpirySweep,
} from "../automationProducer";

const mockAdd = automationQueue.add as jest.MockedFunction<typeof automationQueue.add>;
const mockObliterate = automationQueue.obliterate as jest.MockedFunction<
  typeof automationQueue.obliterate
>;
const mockUpsertJobScheduler = automationQueue.upsertJobScheduler as jest.MockedFunction<
  typeof automationQueue.upsertJobScheduler
>;

describe("automationProducer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const expectSchedulerCall = (name: string, data: object, pattern: string, tz?: string) => {
    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      name,
      tz ? { pattern, tz } : { pattern },
      expect.objectContaining({
        name,
        data,
        opts: expect.objectContaining({
          removeOnComplete: true,
          removeOnFail: false,
        }),
      }),
    );
  };

  describe("enqueueAutomationAction", () => {
    it("should add a job to the queue", async () => {
      const result = await enqueueAutomationAction("test_action", { key: "value" });

      expect(mockAdd).toHaveBeenCalledWith("test_action", { key: "value" }, {});
      expect(result).toEqual({ id: "job-1" });
    });

    it("should pass options to the queue", async () => {
      await enqueueAutomationAction("test_action", { key: "value" }, { delay: 5000 });

      expect(mockAdd).toHaveBeenCalledWith("test_action", { key: "value" }, { delay: 5000 });
    });
  });

  describe("scheduleVendorReviewDateNotification", () => {
    it("should obliterate queue and add a repeating job", async () => {
      await scheduleVendorReviewDateNotification();

      expect(mockObliterate).toHaveBeenCalledWith({ force: true });
      expectSchedulerCall("send_vendor_notification", { type: "review_date" }, "0 0 * * *");
    });
  });

  describe("schedulePolicyDueSoonNotification", () => {
    it("should add a repeating job at 8 AM daily", async () => {
      await schedulePolicyDueSoonNotification();

      expectSchedulerCall(
        "send_policy_due_soon_notification",
        { type: "policy_due_soon" },
        "0 8 * * *",
      );
    });
  });

  describe("scheduleReportNotification", () => {
    it("should obliterate queue and add a repeating job", async () => {
      await scheduleReportNotification();

      expect(mockObliterate).toHaveBeenCalledWith({ force: true });
      expectSchedulerCall("send_report_notification", { type: "report_notification" }, "0 0 * * *");
    });
  });

  describe("schedulePMMHourlyCheck", () => {
    it("should add a repeating job every hour", async () => {
      await schedulePMMHourlyCheck();

      expectSchedulerCall("pmm_hourly_check", { type: "pmm" }, "0 * * * *");
    });
  });

  describe("scheduleShadowAiJobs", () => {
    it("should schedule 5 shadow AI jobs", async () => {
      await scheduleShadowAiJobs();

      expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(5);
      expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
        "shadow_ai_daily_rollup",
        expect.any(Object),
        expect.any(Object),
      );
      expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
        "shadow_ai_monthly_rollup",
        expect.any(Object),
        expect.any(Object),
      );
      expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
        "shadow_ai_risk_scoring",
        expect.any(Object),
        expect.any(Object),
      );
      expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
        "shadow_ai_purge_events",
        expect.any(Object),
        expect.any(Object),
      );
      expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
        "ai_gateway_budget_reset",
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe("scheduleAgentDiscoverySync", () => {
    it("should add a repeating job every 6 hours", async () => {
      await scheduleAgentDiscoverySync();

      expectSchedulerCall("agent_discovery_sync", { type: "agent_discovery" }, "0 */6 * * *");
    });
  });

  describe("scheduleAiDetectionScanCheck", () => {
    it("should add a repeating job every 5 minutes", async () => {
      await scheduleAiDetectionScanCheck();

      expectSchedulerCall(
        "ai_detection_scheduled_scan_check",
        { type: "ai_detection" },
        "*/5 * * * *",
      );
    });
  });

  describe("scheduleAiGatewayRiskDetection", () => {
    it("should add a repeating job at 6 AM daily", async () => {
      await scheduleAiGatewayRiskDetection();

      expectSchedulerCall("ai_gateway_risk_detection", { type: "ai_gateway_risk" }, "0 6 * * *");
    });
  });

  describe("scheduleAiGatewayCacheCleanup", () => {
    it("should add a repeating job at 3 AM daily", async () => {
      await scheduleAiGatewayCacheCleanup();

      expectSchedulerCall("ai_gateway_cache_cleanup", { type: "ai_gateway_cache" }, "0 3 * * *");
    });
  });

  describe("scheduleMcpGatewayCleanup", () => {
    it("should add a repeating job at 3 AM daily", async () => {
      await scheduleMcpGatewayCleanup();

      expectSchedulerCall("mcp_audit_cleanup", { type: "mcp_gateway" }, "0 3 * * *");
    });
  });

  describe("scheduleEvidenceExpirySweep", () => {
    it("should add a repeating job at 4:30 AM daily without obliterating", async () => {
      await scheduleEvidenceExpirySweep();

      expect(mockObliterate).not.toHaveBeenCalled();
      expectSchedulerCall("evidence_expiry_sweep", { type: "evidence_retention" }, "30 4 * * *");
    });
  });
});
