/**
 * @fileoverview Shadow AI Alert Notification Service Tests
 *
 * Tests for processTriggeredRules, buildAlertDescription, and alert context.
 *
 * @module tests/shadowAiAlertNotification.service
 */

// Mock dependencies BEFORE imports
jest.mock("../inAppNotification.service", () => ({
  sendInAppNotification: jest.fn(),
  sendBulkInAppNotifications: jest.fn(),
}));

jest.mock("../../constants/emailTemplates", () => ({
  EMAIL_TEMPLATES: {
    SHADOW_AI_ALERT: "shadow-ai-alert.mjml",
  },
}));

jest.mock("../../domain.layer/interfaces/i.shadowAi", () => ({
  // Re-export types are not needed at runtime, just the trigger type values
}));

jest.mock("../../domain.layer/interfaces/i.notification", () => ({
  NotificationType: {
    SHADOW_AI_ALERT: "shadow_ai_alert",
  },
  NotificationEntityType: {
    SHADOW_AI_TOOL: "shadow_ai_tool",
  },
}));

jest.mock("../../utils/shadowAiRules.utils", () => ({
  insertAlertHistoryQuery: jest.fn(),
  getActiveRulesQuery: jest.fn(),
  getRecentAlertKeys: jest.fn(),
}));

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

import { evaluateRulesForBatch, processTriggeredRules } from "../shadowAiAlertNotification.service";
import { sendInAppNotification, sendBulkInAppNotifications } from "../inAppNotification.service";
import {
  getActiveRulesQuery,
  getRecentAlertKeys,
  insertAlertHistoryQuery,
} from "../../utils/shadowAiRules.utils";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

// Cast mocks
const mockSendInApp = sendInAppNotification as jest.MockedFunction<typeof sendInAppNotification>;
const mockSendBulkInApp = sendBulkInAppNotifications as jest.MockedFunction<
  typeof sendBulkInAppNotifications
>;
const mockInsertAlert = insertAlertHistoryQuery as jest.MockedFunction<
  typeof insertAlertHistoryQuery
>;

describe("shadowAiAlertNotification.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInsertAlert.mockResolvedValue(undefined as any);
    mockSendInApp.mockResolvedValue({} as any);
    mockSendBulkInApp.mockResolvedValue([] as any);
  });

  describe("processTriggeredRules", () => {
    it("should call sendRuleAlert for each rule", async () => {
      const rules = [
        {
          id: 1,
          name: "Rule 1",
          is_active: true,
          trigger_type: "new_tool_detected" as const,
          trigger_config: {},
          actions: [{ type: "send_alert" as const }],
          notification_user_ids: [10],
          created_by: 1,
        },
        {
          id: 2,
          name: "Rule 2",
          is_active: true,
          trigger_type: "blocked_attempt" as const,
          trigger_config: {},
          actions: [{ type: "send_alert" as const }],
          notification_user_ids: [20],
          created_by: 1,
        },
      ];

      await processTriggeredRules(1, rules, { toolName: "ChatGPT", toolId: 5 });

      // Should insert alert history for each rule
      expect(mockInsertAlert).toHaveBeenCalledTimes(2);
      // Should send in-app notification for each rule (single user each)
      expect(mockSendInApp).toHaveBeenCalledTimes(2);
    });

    it("should continue processing on rule failure", async () => {
      const rules = [
        {
          id: 1,
          name: "Failing Rule",
          is_active: true,
          trigger_type: "new_tool_detected" as const,
          trigger_config: {},
          actions: [],
          notification_user_ids: [10],
          created_by: 1,
        },
        {
          id: 2,
          name: "OK Rule",
          is_active: true,
          trigger_type: "new_tool_detected" as const,
          trigger_config: {},
          actions: [],
          notification_user_ids: [20],
          created_by: 1,
        },
      ];

      // First rule fails at alert history insertion
      mockInsertAlert
        .mockRejectedValueOnce(new Error("insert failed"))
        .mockResolvedValueOnce(undefined as any);

      await processTriggeredRules(1, rules, { toolName: "Test" });

      // Should log error for first rule
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to process alert for rule 1"),
        expect.any(Error),
      );
      // Should still process second rule
      expect(mockInsertAlert).toHaveBeenCalledTimes(2);
    });

    it("should use sendBulkInAppNotifications when multiple user IDs", async () => {
      const rules = [
        {
          id: 1,
          name: "Multi-user Rule",
          is_active: true,
          trigger_type: "new_tool_detected" as const,
          trigger_config: {},
          actions: [{ type: "send_alert" as const }],
          notification_user_ids: [10, 20, 30],
          created_by: 1,
        },
      ];

      await processTriggeredRules(1, rules, { toolName: "ChatGPT", toolId: 5 });

      expect(mockSendBulkInApp).toHaveBeenCalledTimes(1);
      expect(mockSendInApp).not.toHaveBeenCalled();
    });

    it("should skip notification when no user IDs configured", async () => {
      const rules = [
        {
          id: 1,
          name: "No Users Rule",
          is_active: true,
          trigger_type: "new_tool_detected" as const,
          trigger_config: {},
          actions: [],
          notification_user_ids: [],
          created_by: 1,
        },
      ];

      await processTriggeredRules(1, rules, { toolName: "Test" });

      // Alert history should still be inserted
      expect(mockInsertAlert).toHaveBeenCalledTimes(1);
      // No notifications sent
      expect(mockSendInApp).not.toHaveBeenCalled();
      expect(mockSendBulkInApp).not.toHaveBeenCalled();
    });
  });

  describe("buildAlertDescription (via processTriggeredRules)", () => {
    const makeRule = (triggerType: string) => ({
      id: 1,
      name: "Test Rule",
      is_active: true,
      trigger_type: triggerType as any,
      trigger_config: {},
      actions: [{ type: "send_alert" as const }],
      notification_user_ids: [10],
      created_by: 1,
    });

    it("should build correct message for new_tool_detected", async () => {
      await processTriggeredRules(1, [makeRule("new_tool_detected")], { toolName: "Copilot" });

      expect(mockSendInApp).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          message: expect.stringContaining("Copilot"),
        }),
        true,
        expect.any(Object),
      );
    });

    it("should build correct message for usage_threshold_exceeded", async () => {
      await processTriggeredRules(1, [makeRule("usage_threshold_exceeded")], {
        toolName: "ChatGPT",
        eventCount: 150,
        threshold: 100,
      });

      expect(mockSendInApp).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          message: expect.stringContaining("150"),
        }),
        true,
        expect.any(Object),
      );
    });

    it("should build correct message for sensitive_department", async () => {
      await processTriggeredRules(1, [makeRule("sensitive_department")], {
        department: "Legal",
        userEmail: "alice@test.com",
      });

      expect(mockSendInApp).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          message: expect.stringContaining("Legal"),
        }),
        true,
        expect.any(Object),
      );
    });

    it("should build correct message for blocked_attempt", async () => {
      await processTriggeredRules(1, [makeRule("blocked_attempt")], {
        toolName: "BlockedTool",
        userEmail: "bob@test.com",
      });

      expect(mockSendInApp).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          message: expect.stringContaining("BlockedTool"),
        }),
        true,
        expect.any(Object),
      );
    });

    it("should build correct message for risk_score_exceeded", async () => {
      await processTriggeredRules(1, [makeRule("risk_score_exceeded")], {
        toolName: "RiskyTool",
        riskScore: 85,
      });

      expect(mockSendInApp).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          message: expect.stringContaining("85"),
        }),
        true,
        expect.any(Object),
      );
    });

    it("should build correct message for new_user_detected", async () => {
      await processTriggeredRules(1, [makeRule("new_user_detected")], {
        userEmail: "newuser@test.com",
        department: "Engineering",
      });

      expect(mockSendInApp).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          message: expect.stringContaining("newuser@test.com"),
        }),
        true,
        expect.any(Object),
      );
    });
  });

  describe("alert context building", () => {
    it("should include tool name, user email, and department in alert", async () => {
      const rule = {
        id: 1,
        name: "Context Rule",
        is_active: true,
        trigger_type: "sensitive_department" as const,
        trigger_config: {},
        actions: [{ type: "send_alert" as const }],
        notification_user_ids: [10],
        created_by: 1,
      };

      await processTriggeredRules(1, [rule], {
        toolName: "Bard",
        toolId: 42,
        userEmail: "user@corp.com",
        department: "Finance",
      });

      // Check alert history was recorded with trigger data
      expect(mockInsertAlert).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          trigger_data: expect.objectContaining({
            tool_name: "Bard",
            tool_id: 42,
            user_email: "user@corp.com",
            department: "Finance",
          }),
        }),
      );

      // Check notification includes context in email config
      expect(mockSendInApp).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          entity_name: "Bard",
          entity_id: 42,
        }),
        true,
        expect.objectContaining({
          variables: expect.objectContaining({
            tool_name: "Bard",
          }),
        }),
      );
    });
  });

  describe("evaluateRulesForBatch", () => {
    const blockedRule = {
      id: 5,
      name: "Blocked",
      is_active: true,
      trigger_type: "blocked_attempt" as const,
      trigger_config: {},
      actions: [{ type: "send_alert" as const }],
      notification_user_ids: [10],
      cooldown_minutes: 60,
      created_by: 1,
    };

    const batchWith = (
      blockedAttempts: { toolId: number; toolName: string; userEmail: string }[],
    ) => ({
      newToolIds: [],
      newToolNames: new Map<number, string>(),
      toolEventCounts: new Map(blockedAttempts.map((a) => [a.toolId, 1])),
      toolDepartments: new Map<number, Set<string>>(),
      toolEmails: new Map<number, Set<string>>(),
      blockedAttempts,
      allDepartments: new Set<string>(),
      allEmails: new Set<string>(),
      firstEventId: null,
    });

    beforeEach(() => {
      (getActiveRulesQuery as jest.Mock).mockResolvedValue([blockedRule]);
      (getRecentAlertKeys as jest.Mock).mockResolvedValue(new Set<string>());
      (sequelize.query as jest.Mock).mockResolvedValue([
        [
          { id: 7, name: "Blocked AI", risk_score: null, total_events: 3, status: "blocked" },
          { id: 8, name: "Other AI", risk_score: null, total_events: 1, status: "blocked" },
        ],
      ]);
    });

    it("sends one blocked-attempt alert per tool when a batch repeats it", async () => {
      await evaluateRulesForBatch(
        1,
        batchWith([
          { toolId: 7, toolName: "Blocked AI", userEmail: "a@corp.com" },
          { toolId: 7, toolName: "Blocked AI", userEmail: "b@corp.com" },
          { toolId: 7, toolName: "Blocked AI", userEmail: "a@corp.com" },
          { toolId: 8, toolName: "Other AI", userEmail: "a@corp.com" },
        ]) as any,
      );

      expect(mockInsertAlert).toHaveBeenCalledTimes(2);
      const toolIds = mockInsertAlert.mock.calls.map((c) => (c[1] as any).trigger_data.tool_id);
      expect(toolIds.sort()).toEqual([7, 8]);
    });

    it("sends nothing for a tool still in its cooldown from an earlier batch", async () => {
      (getRecentAlertKeys as jest.Mock).mockResolvedValue(new Set(["5:tool:7"]));
      await evaluateRulesForBatch(
        1,
        batchWith([{ toolId: 7, toolName: "Blocked AI", userEmail: "a@corp.com" }]) as any,
      );
      expect(mockInsertAlert).not.toHaveBeenCalled();
    });
  });
});
