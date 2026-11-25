/**
 * notifyApprovalComplete: the requester's "fully approved" notification links
 * to the approved artifact. A policy links to its editor by entity id.
 * notifyApprovalRequested: an approver of a policy request is told which
 * policy and linked to the approval request, where they decide.
 */
const mockQuery = jest.fn();
const mockCreate = jest.fn();
const mockSendTemplate = jest.fn();

jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));
jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: { publish: jest.fn().mockResolvedValue(1) },
}));
jest.mock("../../utils/notification.utils", () => ({
  createNotificationQuery: (...args: unknown[]) => mockCreate(...args),
  createBulkNotificationsQuery: jest.fn(),
}));
jest.mock("../../utils/userPreference.utils", () => ({
  getUserLanguage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../notificationService", () => ({
  notificationService: {
    sendEmailWithTemplate: (...args: unknown[]) => mockSendTemplate(...args),
  },
}));

import {
  notifyApprovalAutoApproved,
  notifyApprovalComplete,
  notifyApprovalRequested,
} from "../inAppNotification.service";
import { EMAIL_TEMPLATES } from "../../constants/emailTemplates";
import { NotificationEntityType } from "../../domain.layer/interfaces/i.notification";

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue([{ name: "Ada", surname: "L", email: "ada@x.io" }]);
  mockCreate.mockReset().mockImplementation(async (n: unknown) => ({ id: 1, ...(n as object) }));
  mockSendTemplate.mockReset().mockResolvedValue(undefined);
});

describe("notifyApprovalComplete", () => {
  it("links a policy to its editor and names it a policy", async () => {
    await notifyApprovalComplete(
      2,
      3,
      { id: 7, name: "Acceptable use", totalSteps: 2 },
      "https://app.test",
      "policy",
      55,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 3,
        title: "Policy fully approved",
        message: 'Your policy "Acceptable use" has been fully approved',
        entity_type: NotificationEntityType.POLICY,
        entity_id: 55,
        action_url: "/policies/55/edit",
      }),
      2,
    );
  });

  it("falls back to the policies list when the policy id is unknown", async () => {
    await notifyApprovalComplete(
      2,
      3,
      { id: 7, name: "Acceptable use", totalSteps: 1 },
      "https://app.test",
      "policy",
    );

    // 7 is the request id: it is never stored as the policy's id.
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: NotificationEntityType.POLICY,
        entity_id: undefined,
        action_url: "/policies",
      }),
      2,
    );
  });

  it("links a use case to its own page, not to the request id", async () => {
    await notifyApprovalComplete(
      2,
      3,
      { id: 7, name: "Chatbot", totalSteps: 1 },
      "https://app.test",
      "use_case",
      9,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Use case fully approved",
        entity_type: NotificationEntityType.USE_CASE,
        entity_id: 9,
        action_url: "/project-view?projectId=9",
      }),
      2,
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockSendTemplate).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      EMAIL_TEMPLATES.APPROVAL_COMPLETE,
      expect.objectContaining({ use_case_url: "https://app.test/project-view?projectId=9" }),
    );
  });

  it("links an AI action to the request in the approvals modal", async () => {
    await notifyApprovalComplete(
      2,
      3,
      { id: 7, name: "Send email", totalSteps: 1 },
      "https://app.test",
      "ai_action",
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: NotificationEntityType.AI_ACTION,
        entity_id: undefined,
        action_url: "/approval-workflows?request=7",
      }),
      2,
    );
  });
});

describe("notifyApprovalRequested", () => {
  const request = {
    id: 7,
    name: "Acceptable use",
    workflowName: "Legal review",
    stepNumber: 1,
    totalSteps: 2,
  };

  it("names the policy and links the approver to the approval request", async () => {
    await notifyApprovalRequested(2, 9, request, "Ada L", "https://app.test", {
      type: "policy",
      id: 55,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 9,
        entity_type: NotificationEntityType.POLICY,
        entity_id: 55,
        entity_name: "Acceptable use",
        action_url: "/approval-workflows?request=7",
      }),
      2,
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockSendTemplate).toHaveBeenCalledWith(
      "ada@x.io",
      expect.any(String),
      EMAIL_TEMPLATES.APPROVAL_REQUESTED,
      expect.objectContaining({ approval_url: "https://app.test/approval-workflows?request=7" }),
    );
  });

  it("links a use case approver to the use case, not to the request id", async () => {
    await notifyApprovalRequested(2, 9, request, "Ada L", "https://app.test", {
      type: "use_case",
      id: 58,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: NotificationEntityType.USE_CASE,
        entity_id: 58,
        action_url: "/project-view?projectId=58",
      }),
      2,
    );
  });

  it("links the request when there is no entity, and names none", async () => {
    await notifyApprovalRequested(2, 9, request, "Ada L", "https://app.test");

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: undefined,
        entity_id: undefined,
        action_url: "/approval-workflows?request=7",
      }),
      2,
    );
  });
});

describe("notifyApprovalAutoApproved", () => {
  const request = { id: 7, name: "Use Case: Chatbot" };

  it("links the use case itself, not the request id", async () => {
    await notifyApprovalAutoApproved(
      2,
      3,
      request,
      "Minimal risk",
      "High risk",
      "https://app.test",
      58,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: NotificationEntityType.USE_CASE,
        entity_id: 58,
        action_url: "/project-view?projectId=58",
      }),
      2,
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockSendTemplate).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      EMAIL_TEMPLATES.APPROVAL_COMPLETE,
      expect.objectContaining({ use_case_url: "https://app.test/project-view?projectId=58" }),
    );
  });

  it("links the request when the use case id is unknown", async () => {
    await notifyApprovalAutoApproved(
      2,
      3,
      request,
      "Minimal risk",
      "High risk",
      "https://app.test",
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_id: undefined,
        action_url: "/approval-workflows?request=7",
      }),
      2,
    );
  });
});
