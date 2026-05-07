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
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: mockAdd,
      obliterate: mockObliterate,
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
} from "../automationProducer";

const mockAdd = automationQueue.add as jest.MockedFunction<typeof automationQueue.add>;
const mockObliterate = automationQueue.obliterate as jest.MockedFunction<
  typeof automationQueue.obliterate
>;

describe("automationProducer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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
      expect(mockAdd).toHaveBeenCalledWith(
        "send_vendor_notification",
        { type: "review_date" },
        expect.objectContaining({
          repeat: { pattern: "0 0 * * *" },
          removeOnComplete: true,
          removeOnFail: false,
        }),
      );
    });
  });

  describe("schedulePolicyDueSoonNotification", () => {
    it("should add a repeating job at 8 AM daily", async () => {
      await schedulePolicyDueSoonNotification();

      expect(mockAdd).toHaveBeenCalledWith(
        "send_policy_due_soon_notification",
        { type: "policy_due_soon" },
        expect.objectContaining({
          repeat: { pattern: "0 8 * * *" },
        }),
      );
    });
  });

  describe("scheduleReportNotification", () => {
    it("should obliterate queue and add a repeating job", async () => {
      await scheduleReportNotification();

      expect(mockObliterate).toHaveBeenCalledWith({ force: true });
      expect(mockAdd).toHaveBeenCalledWith(
        "send_report_notification",
        { type: "report_notification" },
        expect.objectContaining({
          repeat: { pattern: "0 0 * * *" },
        }),
      );
    });
  });

  describe("schedulePMMHourlyCheck", () => {
    it("should add a repeating job every hour", async () => {
      await schedulePMMHourlyCheck();

      expect(mockAdd).toHaveBeenCalledWith(
        "pmm_hourly_check",
        { type: "pmm" },
        expect.objectContaining({
          repeat: { pattern: "0 * * * *" },
        }),
      );
    });
  });

  describe("scheduleShadowAiJobs", () => {
    it("should schedule 5 shadow AI jobs", async () => {
      await scheduleShadowAiJobs();

      expect(mockAdd).toHaveBeenCalledTimes(5);
      expect(mockAdd).toHaveBeenCalledWith(
        "shadow_ai_daily_rollup",
        expect.any(Object),
        expect.any(Object),
      );
      expect(mockAdd).toHaveBeenCalledWith(
        "shadow_ai_monthly_rollup",
        expect.any(Object),
        expect.any(Object),
      );
      expect(mockAdd).toHaveBeenCalledWith(
        "shadow_ai_risk_scoring",
        expect.any(Object),
        expect.any(Object),
      );
      expect(mockAdd).toHaveBeenCalledWith(
        "shadow_ai_purge_events",
        expect.any(Object),
        expect.any(Object),
      );
      expect(mockAdd).toHaveBeenCalledWith(
        "ai_gateway_budget_reset",
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe("scheduleAgentDiscoverySync", () => {
    it("should add a repeating job every 6 hours", async () => {
      await scheduleAgentDiscoverySync();

      expect(mockAdd).toHaveBeenCalledWith(
        "agent_discovery_sync",
        { type: "agent_discovery" },
        expect.objectContaining({
          repeat: { pattern: "0 */6 * * *" },
        }),
      );
    });
  });

  describe("scheduleAiDetectionScanCheck", () => {
    it("should add a repeating job every 5 minutes", async () => {
      await scheduleAiDetectionScanCheck();

      expect(mockAdd).toHaveBeenCalledWith(
        "ai_detection_scheduled_scan_check",
        { type: "ai_detection" },
        expect.objectContaining({
          repeat: { pattern: "*/5 * * * *" },
        }),
      );
    });
  });

  describe("scheduleAiGatewayRiskDetection", () => {
    it("should add a repeating job at 6 AM daily", async () => {
      await scheduleAiGatewayRiskDetection();

      expect(mockAdd).toHaveBeenCalledWith(
        "ai_gateway_risk_detection",
        { type: "ai_gateway_risk" },
        expect.objectContaining({
          repeat: { pattern: "0 6 * * *" },
        }),
      );
    });
  });

  describe("scheduleAiGatewayCacheCleanup", () => {
    it("should add a repeating job at 3 AM daily", async () => {
      await scheduleAiGatewayCacheCleanup();

      expect(mockAdd).toHaveBeenCalledWith(
        "ai_gateway_cache_cleanup",
        { type: "ai_gateway_cache" },
        expect.objectContaining({
          repeat: { pattern: "0 3 * * *" },
        }),
      );
    });
  });

  describe("scheduleMcpGatewayCleanup", () => {
    it("should add a repeating job at 3 AM daily", async () => {
      await scheduleMcpGatewayCleanup();

      expect(mockAdd).toHaveBeenCalledWith(
        "mcp_audit_cleanup",
        { type: "mcp_gateway" },
        expect.objectContaining({
          repeat: { pattern: "0 3 * * *" },
        }),
      );
    });
  });
});
