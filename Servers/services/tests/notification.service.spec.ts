/**
 * @fileoverview Notification Service Tests
 *
 * Tests for notification.service.ts including type mapping,
 * sendNotification delegation, notifyStepApprovers and the links approval
 * notices carry.
 *
 * @module tests/notification.service
 */

// Mock database BEFORE other imports
jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
  },
}));

jest.mock("../inAppNotification.service", () => ({
  sendInAppNotification: jest.fn(),
  buildEntityUrl: jest.fn((type: string, id: number) =>
    type === "policy" ? `/policies/${id}/edit` : `/project-view?projectId=${id}`,
  ),
}));

jest.mock("../../constants/emailTemplates", () => ({
  EMAIL_TEMPLATES: {
    APPROVAL_REQUESTED: "approval-requested.mjml",
    APPROVAL_COMPLETE: "approval-complete.mjml",
    APPROVAL_REJECTED: "approval-rejected.mjml",
    APPROVAL_STEP_COMPLETED: "approval-step-completed.mjml",
  },
}));

jest.mock("../../domain.layer/interfaces/i.notification", () => ({
  NotificationType: {
    APPROVAL_REQUESTED: "approval_requested",
    APPROVAL_APPROVED: "approval_approved",
    APPROVAL_REJECTED: "approval_rejected",
    APPROVAL_COMPLETE: "approval_complete",
    SYSTEM: "system",
  },
  NotificationEntityType: {
    USE_CASE: "use_case",
    POLICY: "policy",
  },
}));

import {
  sendNotification,
  notifyStepApprovers,
  notifyRequesterRejected,
  notifyRequesterStepCompleted,
} from "../notification.service";
import { sendInAppNotification } from "../inAppNotification.service";
import { sequelize } from "../../database/db";

// Cast mocks
const mockSendInApp = sendInAppNotification as jest.MockedFunction<typeof sendInAppNotification>;
const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

describe("notification.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendInApp.mockResolvedValue({} as any);
  });

  describe("mapNotificationType (via sendNotification)", () => {
    it("should map 'approval_request' to APPROVAL_REQUESTED", async () => {
      await sendNotification(1, 10, {
        title: "Test",
        message: "msg",
        type: "approval_request",
        entityId: 5,
      });

      expect(mockSendInApp).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: "approval_requested" }),
        true,
        expect.any(Object),
      );
    });

    it("should map 'approval_approved' to APPROVAL_APPROVED", async () => {
      await sendNotification(1, 10, {
        title: "Test",
        message: "msg",
        type: "approval_approved",
        entityId: 5,
      });

      expect(mockSendInApp).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: "approval_approved" }),
        true,
        expect.any(Object),
      );
    });

    it("should map 'approval_rejected' to APPROVAL_REJECTED", async () => {
      await sendNotification(1, 10, {
        title: "Test",
        message: "msg",
        type: "approval_rejected",
        entityId: 5,
      });

      expect(mockSendInApp).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: "approval_rejected" }),
        true,
        expect.any(Object),
      );
    });

    it("should map 'approval_complete' to APPROVAL_COMPLETE", async () => {
      await sendNotification(1, 10, {
        title: "Test",
        message: "msg",
        type: "approval_complete",
        entityId: 5,
      });

      expect(mockSendInApp).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: "approval_complete" }),
        true,
        expect.any(Object),
      );
    });
  });

  describe("sendNotification", () => {
    it("should delegate to sendInAppNotification with correct params", async () => {
      await sendNotification(1, 42, {
        title: "New Approval",
        message: "Please approve",
        type: "approval_request",
        entityId: 100,
      });

      expect(mockSendInApp).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          user_id: 42,
          title: "New Approval",
          message: "Please approve",
          entity_id: 100,
        }),
        true,
        expect.objectContaining({
          template: "approval-requested.mjml",
          subject: "New Approval",
        }),
      );
    });

    it("should propagate errors from sendInAppNotification", async () => {
      mockSendInApp.mockRejectedValue(new Error("send failed"));

      await expect(
        sendNotification(1, 10, {
          title: "Test",
          message: "msg",
          type: "approval_request",
          entityId: 5,
        }),
      ).rejects.toThrow("send failed");
    });
  });

  describe("notifyStepApprovers", () => {
    it("should send notifications in parallel to all approvers", async () => {
      // Mock getApproversForStep
      mockQuery
        .mockResolvedValueOnce([
          { approver_id: 10, approver_name: "Alice" },
          { approver_id: 20, approver_name: "Bob" },
        ] as any)
        // Mock getApprovalContext
        .mockResolvedValueOnce([
          {
            requester_name: "Charlie",
            workflow_name: "Review Flow",
            total_steps: 3,
            use_case_name: "AI Model",
          },
        ] as any);

      await notifyStepApprovers(1, 100, 2, "AI Model Review");

      // sendInAppNotification is called via sendNotificationWithContext for each approver
      expect(mockSendInApp).toHaveBeenCalledTimes(2);
    });

    it("should propagate errors from approver query", async () => {
      mockQuery.mockRejectedValue(new Error("DB error"));

      await expect(notifyStepApprovers(1, 100, 1, "Test")).rejects.toThrow("DB error");
    });
  });

  describe("approval notice links", () => {
    const BASE = "https://app.test";
    const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;
    beforeAll(() => {
      process.env.FRONTEND_URL = BASE;
    });
    afterAll(() => {
      if (ORIGINAL_FRONTEND_URL === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL;
    });

    const stepContext = {
      completed_step: 1,
      next_step: 2,
      total_steps: 2,
      approver_name: "Alice",
    };

    it("links a step approver to the request, and names no entity", async () => {
      mockQuery
        .mockResolvedValueOnce([{ approver_id: 10, approver_name: "Alice" }] as any)
        .mockResolvedValueOnce([] as any);

      await notifyStepApprovers(1, 100, 1, "File Approval: a.pdf");

      const [, notice, , email] = mockSendInApp.mock.calls[0];
      expect(notice).toEqual(
        expect.objectContaining({
          entity_type: undefined,
          entity_id: undefined,
          action_url: "/approval-workflows?request=100",
        }),
      );
      expect(email!.variables.approval_url).toBe(`${BASE}/approval-workflows?request=100`);
    });

    it("links a rejection to the request, and names no entity", async () => {
      await notifyRequesterRejected(1, 5, 100, "Policy: Acceptable use", {
        requester_name: "Charlie",
      });

      const [, notice, , email] = mockSendInApp.mock.calls[0];
      expect(notice).toEqual(
        expect.objectContaining({
          entity_type: undefined,
          entity_id: undefined,
          action_url: "/approval-workflows?request=100",
        }),
      );
      expect(email!.variables.request_url).toBe(`${BASE}/approval-workflows?request=100`);
    });

    it("links step progress on a use case to the use case, not to the request id", async () => {
      mockQuery.mockResolvedValueOnce([] as any);

      await notifyRequesterStepCompleted(1, 5, 100, "Use Case: Chatbot", stepContext, {
        type: "use_case",
        id: 58,
      });

      const [, notice, , email] = mockSendInApp.mock.calls[0];
      expect(notice).toEqual(
        expect.objectContaining({
          entity_type: "use_case",
          entity_id: 58,
          action_url: "/project-view?projectId=58",
        }),
      );
      expect(email!.variables.request_url).toBe(`${BASE}/project-view?projectId=58`);
    });

    it("links step progress to the request when the entity has no page", async () => {
      mockQuery.mockResolvedValueOnce([] as any);

      await notifyRequesterStepCompleted(1, 5, 100, "AI action", stepContext, {
        type: "ai_action",
        id: 7,
      });

      const [, notice, , email] = mockSendInApp.mock.calls[0];
      expect(notice).toEqual(
        expect.objectContaining({
          entity_type: undefined,
          entity_id: undefined,
          action_url: "/approval-workflows?request=100",
        }),
      );
      expect(email!.variables.request_url).toBe(`${BASE}/approval-workflows?request=100`);
    });
  });

  it("links an approval email to the local frontend when FRONTEND_URL is not set", async () => {
    const saved = process.env.FRONTEND_URL;
    delete process.env.FRONTEND_URL;
    try {
      mockQuery
        .mockResolvedValueOnce([{ approver_id: 10, approver_name: "Alice" }] as any)
        .mockResolvedValueOnce([] as any);

      await notifyStepApprovers(1, 100, 1, "File Approval: a.pdf");

      const [, , , email] = mockSendInApp.mock.calls[0];
      expect(email!.variables.approval_url).toBe(
        "http://localhost:5173/approval-workflows?request=100",
      );
    } finally {
      if (saved !== undefined) process.env.FRONTEND_URL = saved;
    }
  });
});
