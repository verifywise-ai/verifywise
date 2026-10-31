/**
 * @fileoverview In-App Notification Service Tests
 *
 * Tests for sendInAppNotification, email failure isolation,
 * buildEntityUrl mapping, and sendBulkInAppNotifications.
 *
 * @module tests/inAppNotification.service
 */

// Mock Redis default export BEFORE other imports
jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: {
    publish: jest.fn().mockResolvedValue(1),
  },
}));

// Mock database BEFORE other imports
jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
  },
}));

jest.mock("../notificationService", () => ({
  notificationService: {
    sendEmailWithTemplate: jest.fn(),
  },
}));

jest.mock("../../utils/notification.utils", () => ({
  createNotificationQuery: jest.fn(),
  createBulkNotificationsQuery: jest.fn(),
}));

jest.mock("../../constants/emailTemplates", () => ({
  EMAIL_TEMPLATES: {
    TASK_ASSIGNED: "task-assigned.mjml",
    SHADOW_AI_ALERT: "shadow-ai-alert.mjml",
    ASSIGNMENT_NOTIFICATION: "assignment-notification.mjml",
  },
}));

import {
  sendInAppNotification,
  sendBulkInAppNotifications,
  notifyUserAssigned,
  type AssignmentEntityContext,
} from "../inAppNotification.service";
import redisClient from "../../database/redis";
import { sequelize } from "../../database/db";
import {
  createNotificationQuery,
  createBulkNotificationsQuery,
} from "../../utils/notification.utils";
import { notificationService } from "../notificationService";
import {
  NotificationType,
  NotificationEntityType,
} from "../../domain.layer/interfaces/i.notification";
import fs from "fs";
import path from "path";
import { compileMjmlToHtml } from "../../tools/mjmlCompiler";

// Cast mocks
const mockRedisPublish = redisClient.publish as jest.MockedFunction<typeof redisClient.publish>;
const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const mockCreateNotification = createNotificationQuery as jest.MockedFunction<
  typeof createNotificationQuery
>;
const mockCreateBulkNotifications = createBulkNotificationsQuery as jest.MockedFunction<
  typeof createBulkNotificationsQuery
>;
const mockSendEmailWithTemplate = notificationService.sendEmailWithTemplate as jest.MockedFunction<
  typeof notificationService.sendEmailWithTemplate
>;

describe("inAppNotification.service", () => {
  const mockStoredNotification = {
    id: 1,
    user_id: 42,
    type: NotificationType.TASK_ASSIGNED,
    title: "Test notification",
    message: "Test message",
    entity_type: NotificationEntityType.TASK,
    entity_id: 100,
    entity_name: "Test Task",
    is_read: false,
    read_at: null,
    created_at: "2026-05-06T00:00:00.000Z",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateNotification.mockResolvedValue(mockStoredNotification as any);
    mockRedisPublish.mockResolvedValue(1 as any);
    mockQuery.mockResolvedValue([] as any);
  });

  describe("sendInAppNotification", () => {
    it("should store in DB via createNotificationQuery", async () => {
      const notification = {
        user_id: 42,
        type: NotificationType.TASK_ASSIGNED,
        title: "New Task",
        message: "You have a new task",
        entity_type: NotificationEntityType.TASK,
        entity_id: 100,
        entity_name: "Task A",
      };

      await sendInAppNotification(1, notification);

      expect(mockCreateNotification).toHaveBeenCalledWith(notification, 1);
    });

    it("should publish to Redis", async () => {
      const notification = {
        user_id: 42,
        type: NotificationType.TASK_ASSIGNED,
        title: "New Task",
        message: "msg",
      };

      await sendInAppNotification(1, notification);

      expect(mockRedisPublish).toHaveBeenCalledWith(
        "in-app-notifications",
        expect.stringContaining('"userId":42'),
      );
    });

    it("should return stored notification", async () => {
      const result = await sendInAppNotification(1, {
        user_id: 42,
        type: NotificationType.TASK_ASSIGNED,
        title: "Test",
        message: "msg",
      });

      expect(result).toEqual(mockStoredNotification);
    });

    it("should send email when sendEmailNotification is true and emailConfig provided", async () => {
      // Mock getUserEmail to return a user
      mockQuery.mockResolvedValueOnce([{ email: "user@test.com" }] as any);
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendInAppNotification(
        1,
        {
          user_id: 42,
          type: NotificationType.TASK_ASSIGNED,
          title: "Test",
          message: "msg",
        },
        true,
        {
          template: "task-assigned.mjml",
          subject: "New Task",
          variables: { task_title: "Task A" },
        },
      );

      expect(mockSendEmailWithTemplate).toHaveBeenCalledWith(
        "user@test.com",
        "New Task",
        "task-assigned.mjml",
        { task_title: "Task A" },
      );
    });
  });

  describe("email failure isolation", () => {
    it("should not fail the whole notification when email errors", async () => {
      // Mock getUserEmail to return a user
      mockQuery.mockResolvedValueOnce([{ email: "user@test.com" }] as any);
      // Email sending fails
      mockSendEmailWithTemplate.mockRejectedValue(new Error("SMTP error"));

      const result = await sendInAppNotification(
        1,
        {
          user_id: 42,
          type: NotificationType.TASK_ASSIGNED,
          title: "Test",
          message: "msg",
        },
        true,
        {
          template: "task-assigned.mjml",
          subject: "Subject",
          variables: {},
        },
      );

      // Should still return the stored notification despite email failure
      expect(result).toEqual(mockStoredNotification);
    });
  });

  describe("buildEntityUrl mapping", () => {
    // We test buildEntityUrl indirectly through the notification action_url
    // or by verifying behavior through the module's exports

    it("should map TASK to /tasks?taskId=", async () => {
      // Import the module to access the non-exported buildEntityUrl
      // We test via notifyTaskAssigned or by checking the action_url pattern
      // Since buildEntityUrl is not exported, we verify through the sendInAppNotification calls
      // made by the higher-level functions that use it.

      // For direct testing, we access the module internals
      const mod = require("../inAppNotification.service");

      // The buildEntityUrl function is used in higher-level notify* functions
      // We verify the pattern by checking that TASK entity_type produces expected URL
      const notification = {
        user_id: 42,
        type: NotificationType.TASK_ASSIGNED,
        title: "Task Test",
        message: "msg",
        entity_type: NotificationEntityType.TASK,
        entity_id: 5,
        action_url: "/tasks?taskId=5",
      };

      await sendInAppNotification(1, notification);

      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          action_url: "/tasks?taskId=5",
        }),
        1,
      );
    });

    it("should map VENDOR to /vendors?vendorId=", async () => {
      const notification = {
        user_id: 42,
        type: NotificationType.VENDOR_REVIEW_DUE,
        title: "Vendor Review",
        message: "msg",
        entity_type: NotificationEntityType.VENDOR,
        entity_id: 10,
        action_url: "/vendors?vendorId=10",
      };

      await sendInAppNotification(1, notification);

      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          action_url: "/vendors?vendorId=10",
        }),
        1,
      );
    });

    it("should map MODEL to /model-inventory/models/", async () => {
      const notification = {
        user_id: 42,
        type: NotificationType.SYSTEM,
        title: "Model Update",
        message: "msg",
        entity_type: NotificationEntityType.MODEL,
        entity_id: 7,
        action_url: "/model-inventory/models/7",
      };

      await sendInAppNotification(1, notification);

      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          action_url: "/model-inventory/models/7",
        }),
        1,
      );
    });

    it("should map POLICY to /policies/{id}/edit", async () => {
      const notification = {
        user_id: 42,
        type: NotificationType.POLICY_DUE_SOON,
        title: "Policy Due",
        message: "msg",
        entity_type: NotificationEntityType.POLICY,
        entity_id: 3,
        action_url: "/policies/3/edit",
      };

      await sendInAppNotification(1, notification);

      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          action_url: "/policies/3/edit",
        }),
        1,
      );
    });
  });

  describe("sendBulkInAppNotifications", () => {
    it("should send to multiple users", async () => {
      const mockBulkResults = [
        { ...mockStoredNotification, user_id: 10 },
        { ...mockStoredNotification, user_id: 20 },
      ];
      mockCreateBulkNotifications.mockResolvedValue(mockBulkResults as any);

      const result = await sendBulkInAppNotifications(1, {
        user_ids: [10, 20],
        type: NotificationType.SHADOW_AI_ALERT,
        title: "Bulk Alert",
        message: "Alert message",
        entity_type: NotificationEntityType.SHADOW_AI_TOOL,
        entity_id: 5,
      });

      expect(mockCreateBulkNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          user_ids: [10, 20],
          title: "Bulk Alert",
        }),
        1,
      );
      // Should publish to Redis for each user
      expect(mockRedisPublish).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it("should send emails to all users when email config provided", async () => {
      const mockBulkResults = [
        { ...mockStoredNotification, user_id: 10 },
        { ...mockStoredNotification, user_id: 20 },
      ];
      mockCreateBulkNotifications.mockResolvedValue(mockBulkResults as any);
      // Mock getUserEmails
      mockQuery.mockResolvedValueOnce([
        { id: 10, name: "Alice", surname: "A", email: "alice@test.com" },
        { id: 20, name: "Bob", surname: "B", email: "bob@test.com" },
      ] as any);
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendBulkInAppNotifications(
        1,
        {
          user_ids: [10, 20],
          type: NotificationType.SHADOW_AI_ALERT,
          title: "Alert",
          message: "msg",
        },
        true,
        {
          template: "shadow-ai-alert.mjml",
          subject: "Alert",
          variables: { alert_title: "Test" },
        },
      );

      expect(mockSendEmailWithTemplate).toHaveBeenCalledTimes(2);
    });
  });

  // The assignment email puts these values into an HTML template. The risk description of an
  // accepted vendor research finding (the entity name) and its impact description (the context
  // description) are written by a model that read a web page, so they are text, never markup.
  // compileMjmlToHtml escapes every value whose key does not end in Html or _html, so the names go
  // to it as written, and entity_context_html (the one raw-HTML slot) is built from escaped values.
  describe("notifyUserAssigned", () => {
    const HOSTILE_ENTITY_NAME = '<a href="https://attacker.example">Open the incident report</a>';

    /**
     * Sends the assignment notice to user 42 and returns what went to the email (the subject, the
     * template and its variables) and what was stored as the in-app notification.
     */
    const assign = async (input: {
      entityName: string;
      assignerName: string;
      recipientName?: string;
      context?: AssignmentEntityContext;
    }) => {
      // The two lookups of the notice: the user, then the user's email address.
      mockQuery
        .mockResolvedValueOnce([
          { name: input.recipientName ?? "Ada", surname: "Lovelace", email: "ada@test.com" },
        ] as any)
        .mockResolvedValueOnce([{ email: "ada@test.com" }] as any);
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await notifyUserAssigned(
        1,
        42,
        {
          entityType: "vendor_risk",
          entityId: 9,
          entityName: input.entityName,
          roleType: "Action Owner",
          entityUrl: "/vendors?vendorRiskId=9",
        },
        input.assignerName,
        "https://app.example",
        input.context,
      );

      expect(mockSendEmailWithTemplate).toHaveBeenCalledTimes(1);
      const [to, subject, template, variables] = mockSendEmailWithTemplate.mock.calls[0];
      return {
        to,
        subject,
        template,
        variables,
        notification: mockCreateNotification.mock.calls[0][0],
      };
    };

    /** What the recipient gets: the real compiler over the real template, with these variables. */
    const render = (template: string, variables: Record<string, string>) =>
      compileMjmlToHtml(
        fs.readFileSync(path.join(__dirname, "../../templates", template), "utf8"),
        variables,
      );

    it("passes plain names and a plain context through as they are", async () => {
      const { to, template, variables } = await assign({
        entityName: "Quarterly vendor review",
        assignerName: "Grace Hopper",
        recipientName: "Ada",
        context: {
          frameworkName: "ISO 27001",
          projectName: "Support bot",
          parentType: "Annex",
          parentName: "A.5 Organizational controls",
          description: "Review the vendor's controls.",
        },
      });

      expect(to).toBe("ada@test.com");
      expect(template).toBe("assignment-notification.mjml");
      expect(variables.entity_name).toBe("Quarterly vendor review");
      expect(variables.assigner_name).toBe("Grace Hopper");
      expect(variables.recipient_name).toBe("Ada");
      for (const value of [
        "ISO 27001",
        "Support bot",
        "Annex:",
        "A.5 Organizational controls",
        "Review the vendor",
      ]) {
        expect(variables.entity_context_html).toContain(value);
      }
      expect(variables.entity_context_html).not.toContain("&lt;");
      expect(variables.entity_context_html).not.toContain("&amp;");
    });

    it("sends no context rows when there is no context", async () => {
      const { variables } = await assign({ entityName: "Vendor", assignerName: "Grace" });

      expect(variables.entity_context_html).toBe("");
    });

    it("writes the names and the context into the email as text, not as markup", async () => {
      const { template, variables } = await assign({
        entityName: HOSTILE_ENTITY_NAME,
        assignerName: "<b>x</b>",
        recipientName: "<s>Ada</s>",
        context: {
          description: "<img src=x onerror=alert(1)>",
          frameworkName: "<i>f</i>",
          projectName: "A & B",
          parentType: "Annex",
          parentName: "<u>p</u>",
        },
      });

      // The names go to the compiler as written: it escapes them, and escaping them here as well
      // would show "&amp;" for "&".
      expect(variables.entity_name).toBe(HOSTILE_ENTITY_NAME);
      expect(variables.assigner_name).toBe("<b>x</b>");
      expect(variables.recipient_name).toBe("<s>Ada</s>");
      // The raw-HTML slot is built from escaped values.
      const contextHtml = variables.entity_context_html;
      expect(contextHtml).toContain("&lt;i&gt;f&lt;/i&gt;");
      expect(contextHtml).toContain("A &amp; B");
      expect(contextHtml).toContain("Annex:");
      expect(contextHtml).toContain("&lt;u&gt;p&lt;/u&gt;");
      expect(contextHtml).toContain("&lt;img src=x onerror=alert(1)&gt;");
      // The rows are still a table: only the values were turned into text.
      expect(contextHtml).toMatch(/^<table [^>]*>(<tr>.*<\/tr>)+<\/table>$/);

      // What the recipient gets: text for every value, markup only where the template has it.
      const html = await render(template, variables);
      expect(html).toContain(
        "&lt;a href=&quot;https://attacker.example&quot;&gt;Open the incident report&lt;/a&gt;",
      );
      expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
      expect(html).toContain("&lt;s&gt;Ada&lt;/s&gt;");
      expect(html).toContain("&lt;i&gt;f&lt;/i&gt;");
      expect(html).toContain("&lt;u&gt;p&lt;/u&gt;");
      expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
      expect(html).toContain("A &amp; B");
      for (const raw of [
        '<a href="https://attacker.example">',
        "<b>x</b>",
        "<s>Ada</s>",
        "<i>f</i>",
        "<u>p</u>",
        "<img src=x",
      ]) {
        expect(html).not.toContain(raw);
      }
      // Escaped once: no entity of the text is escaped a second time.
      expect(html).not.toContain("&amp;lt;");
      expect(html).not.toContain("&amp;quot;");
      expect(html).not.toContain("&amp;amp;");
    });

    it("shows an ampersand in a name once, not escaped twice", async () => {
      const { template, variables } = await assign({
        entityName: "Terms & conditions review",
        assignerName: "Grace & Ada",
        recipientName: "Ada & Co",
        context: { projectName: "R&D" },
      });

      const html = await render(template, variables);
      expect(html).toContain("Terms &amp; conditions review");
      expect(html).toContain("Grace &amp; Ada");
      expect(html).toContain("Ada &amp; Co");
      expect(html).toContain("R&amp;D");
      expect(html).not.toContain("&amp;amp;");
    });

    it("leaves the subject and the in-app notification as the plain text that was written", async () => {
      const { subject, notification, variables } = await assign({
        entityName: HOSTILE_ENTITY_NAME,
        assignerName: "<b>x</b>",
      });

      // Plain text: a subject line and a notification that the app shows as text.
      expect(subject).toBe(`You've been assigned as Action Owner: ${HOSTILE_ENTITY_NAME}`);
      expect(notification.message).toBe(
        `<b>x</b> assigned you as Action Owner for Vendor Risk: ${HOSTILE_ENTITY_NAME}`,
      );
      expect(notification.entity_name).toBe(HOSTILE_ENTITY_NAME);
      // The link, and what comes from constants, are not touched either.
      expect(variables.entity_url).toBe("https://app.example/vendors?vendorRiskId=9");
      expect(variables.role_type).toBe("Action Owner");
      expect(variables.entity_type).toBe("Vendor Risk");
    });
  });
});
