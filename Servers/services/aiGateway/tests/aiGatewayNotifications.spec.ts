/**
 * @fileoverview AI Gateway Notifications Tests
 *
 * Tests for budget, guardrail, and config change notifications.
 *
 * @module tests/aiGatewayNotifications
 */

jest.mock("../../inAppNotification.service", () => ({
  sendInAppNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

import { sendInAppNotification } from "../../inAppNotification.service";
import { sequelize } from "../../../database/db";
import {
  notifyBudgetWarning,
  notifyBudgetExhausted,
  notifyGuardrailSpike,
  notifyVirtualKeyBudgetExhausted,
  notifyConfigChange,
} from "../aiGatewayNotifications";

const mockSendInApp = sendInAppNotification as jest.MockedFunction<typeof sendInAppNotification>;
const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

describe("aiGatewayNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([
      { id: 1, name: "Admin One" },
      { id: 2, name: "Admin Two" },
    ] as any);
  });

  describe("notifyBudgetWarning", () => {
    it("should send notifications to all admins", async () => {
      await notifyBudgetWarning(1, {
        current_spend_usd: 80,
        monthly_limit_usd: 100,
        alert_threshold_pct: 80,
        is_hard_limit: false,
      });

      expect(mockSendInApp).toHaveBeenCalledTimes(2);
    });

    it("should calculate spend percentage correctly", async () => {
      await notifyBudgetWarning(1, {
        current_spend_usd: 75,
        monthly_limit_usd: 100,
        alert_threshold_pct: 70,
        is_hard_limit: true,
      });

      const firstCall = mockSendInApp.mock.calls[0];
      expect(firstCall[1].title).toBe("AI Gateway budget warning");
      expect(firstCall[1].message).toContain("75%");
      expect(firstCall[3].subject).toContain("75%");
      expect(firstCall[3].variables.hard_limit_status).toContain("Enabled");
    });

    it("should handle zero monthly limit gracefully", async () => {
      await notifyBudgetWarning(1, {
        current_spend_usd: 0,
        monthly_limit_usd: 0,
        alert_threshold_pct: 80,
        is_hard_limit: false,
      });

      expect(mockSendInApp).toHaveBeenCalledTimes(2);
    });

    it("should catch and log per-admin errors", async () => {
      mockSendInApp.mockRejectedValueOnce(new Error("Send failed"));
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await notifyBudgetWarning(1, {
        current_spend_usd: 80,
        monthly_limit_usd: 100,
        alert_threshold_pct: 80,
        is_hard_limit: false,
      });

      expect(mockSendInApp).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });
  });

  describe("notifyBudgetExhausted", () => {
    it("should send exhaustion notification to all admins", async () => {
      await notifyBudgetExhausted(1, {
        current_spend_usd: 100,
        monthly_limit_usd: 100,
      });

      expect(mockSendInApp).toHaveBeenCalledTimes(2);
      const firstCall = mockSendInApp.mock.calls[0];
      expect(firstCall[1].type).toBe("ai_gateway_budget_exhausted");
    });
  });

  describe("notifyGuardrailSpike", () => {
    it("should send guardrail spike alert", async () => {
      await notifyGuardrailSpike(1, {
        blocked_count: 10,
        masked_count: 5,
        pii_count: 3,
        content_filter_count: 2,
        active_rules: 4,
      });

      expect(mockSendInApp).toHaveBeenCalledTimes(2);
      const firstCall = mockSendInApp.mock.calls[0];
      expect(firstCall[1].type).toBe("ai_gateway_guardrail_spike");
      expect(firstCall[3].variables.blocked_count).toBe("10");
      expect(firstCall[3].variables.masked_count).toBe("5");
    });
  });

  describe("notifyVirtualKeyBudgetExhausted", () => {
    it("should send virtual key exhaustion alert", async () => {
      await notifyVirtualKeyBudgetExhausted(1, "prod-key", 50.0, 50.0);

      expect(mockSendInApp).toHaveBeenCalledTimes(2);
      const firstCall = mockSendInApp.mock.calls[0];
      expect(firstCall[1].type).toBe("ai_gateway_virtual_key_budget_exhausted");
      expect(firstCall[3].variables.key_name).toBe("prod-key");
    });
  });

  describe("notifyConfigChange", () => {
    it("should send config change notification to other admins", async () => {
      mockQuery
        .mockResolvedValueOnce([{ id: 1, name: "Admin One" }] as any)
        .mockResolvedValueOnce([{ name: "Jane", surname: "Doe" }] as any);

      await notifyConfigChange(1, 99, {
        entityType: "Endpoint",
        entityName: "prod-gpt4o",
        action: "created",
        detail: "Provider: openai",
        actionUrl: "/ai-gateway/endpoints",
        actionLabel: "View endpoints",
      });

      // Only admin 1 should get notified (not the changer, user 99)
      expect(mockSendInApp).toHaveBeenCalledTimes(1);
      const call = mockSendInApp.mock.calls[0];
      expect(call[1].user_id).toBe(1);
      expect(call[1].title).toBe("Endpoint created");
      expect(call[3].variables.change_description).toContain("Jane Doe created");
    });

    it("should use fallback name when user lookup fails", async () => {
      mockQuery
        .mockResolvedValueOnce([{ id: 1, name: "Admin One" }] as any)
        .mockResolvedValueOnce([] as any);

      await notifyConfigChange(1, 99, {
        entityType: "Guardrail rule",
        entityName: "Block PII",
        action: "deleted",
        actionUrl: "/ai-gateway/guardrails",
        actionLabel: "View guardrails",
      });

      const call = mockSendInApp.mock.calls[0];
      expect(call[3].variables.change_description).toContain("A user deleted");
    });

    it("should handle user lookup error gracefully", async () => {
      mockQuery
        .mockResolvedValueOnce([{ id: 1, name: "Admin One" }] as any)
        .mockRejectedValueOnce(new Error("DB error"));

      await notifyConfigChange(1, 99, {
        entityType: "API key",
        entityName: "key-1",
        action: "modified",
        actionUrl: "/ai-gateway/keys",
        actionLabel: "View keys",
      });

      expect(mockSendInApp).toHaveBeenCalledTimes(1);
    });

    it("should handle unknown action in description", async () => {
      mockQuery
        .mockResolvedValueOnce([{ id: 1, name: "Admin One" }] as any)
        .mockResolvedValueOnce([{ name: "Test" }] as any);

      await notifyConfigChange(1, 99, {
        entityType: "Endpoint",
        entityName: "test",
        action: "unknown_action" as any,
        actionUrl: "/",
        actionLabel: "View",
      });

      const call = mockSendInApp.mock.calls[0];
      expect(call[3].variables.change_description).toContain("changed");
    });

    it("should not notify anyone when changer is the only admin", async () => {
      mockQuery.mockResolvedValueOnce([{ id: 99, name: "Admin" }] as any);

      await notifyConfigChange(1, 99, {
        entityType: "Endpoint",
        entityName: "test",
        action: "created",
        actionUrl: "/",
        actionLabel: "View",
      });

      expect(mockSendInApp).not.toHaveBeenCalled();
    });
  });
});
