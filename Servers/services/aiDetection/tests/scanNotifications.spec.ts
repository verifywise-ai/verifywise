/**
 * AI Detection scan notifier: who gets what, a missing score, de-duplication,
 * failure isolation, and the Automations triggers it fires.
 */

import {
  notifyAiDetectionScanFinished,
  notifyAiDetectionScanFailed,
  newHighRiskFindings,
  isGradeDrop,
  shortFailureReason,
} from "../scanNotifications";
import { getScanByIdQuery } from "../../../utils/aiDetection.utils";
import {
  getActiveAutomationActionsQuery,
  getCountedScanFindingsQuery,
  getPreviousCompletedScanQuery,
  getScanRecipientsQuery,
  hasScanNotificationQuery,
  IScanFindingKey,
  IScanRecipient,
} from "../../../utils/aiDetectionNotification.utils";
import { sendInAppNotification } from "../../inAppNotification.service";
import { enqueueAutomationAction } from "../../automations/automationProducer";
import { buildAiDetectionScanReplacements } from "../../../utils/automation/aiDetection.automation.utils";
import { IScan } from "../../../domain.layer/interfaces/i.aiDetection";

jest.mock("../../../utils/aiDetection.utils", () => ({ getScanByIdQuery: jest.fn() }));
jest.mock("../../../utils/aiDetectionNotification.utils", () => ({
  getActiveAutomationActionsQuery: jest.fn(),
  getCountedScanFindingsQuery: jest.fn(),
  getPreviousCompletedScanQuery: jest.fn(),
  getScanRecipientsQuery: jest.fn(),
  hasScanNotificationQuery: jest.fn(),
}));
jest.mock("../../inAppNotification.service", () => ({
  sendInAppNotification: jest.fn(),
  buildEntityUrl: (_type: string, id: number) => `/ai-detection/scans/${id}`,
}));
jest.mock("../../automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../../../utils/userPreference.utils", () => ({
  getUserLanguage: jest.fn().mockResolvedValue("en"),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockScan = getScanByIdQuery as jest.Mock;
const mockAutomations = getActiveAutomationActionsQuery as jest.Mock;
const mockFindings = getCountedScanFindingsQuery as jest.Mock;
const mockPrevious = getPreviousCompletedScanQuery as jest.Mock;
const mockRecipients = getScanRecipientsQuery as jest.Mock;
const mockDedup = hasScanNotificationQuery as jest.Mock;
const mockSend = sendInAppNotification as jest.Mock;
const mockEnqueue = enqueueAutomationAction as jest.Mock;

const ORG = 7;

const scan = (overrides: Partial<IScan> = {}): IScan => ({
  id: 42,
  repository_url: "https://github.com/acme/app",
  repository_owner: "acme",
  repository_name: "app",
  status: "completed",
  findings_count: 7,
  triggered_by: 5,
  triggered_by_type: "manual",
  risk_score: 82,
  risk_score_grade: "B",
  completed_at: new Date("2026-11-12T10:00:00Z"),
  ...overrides,
});

const finding = (overrides: Partial<IScanFindingKey> = {}): IScanFindingKey => ({
  name: "openai",
  provider: "OpenAI",
  finding_type: "library",
  risk_level: "medium",
  ...overrides,
});

const secret = (name: string) =>
  finding({ name, provider: null, finding_type: "secret", risk_level: "high" });

const triggerer: IScanRecipient = { id: 5, name: "Ada", isTriggeredBy: true, isAdmin: false };
const admin: IScanRecipient = { id: 9, name: "Grace", isTriggeredBy: false, isAdmin: true };

/** Recipients the in-app sends went to, by notification type. */
const sentTo = (type: string) =>
  mockSend.mock.calls.filter(([, input]) => input.type === type).map(([, input]) => input.user_id);

beforeEach(() => {
  jest.clearAllMocks();
  mockScan.mockResolvedValue(scan());
  mockDedup.mockResolvedValue(false);
  mockPrevious.mockResolvedValue(null);
  mockFindings.mockResolvedValue([]);
  mockRecipients.mockResolvedValue([triggerer, admin]);
  mockAutomations.mockResolvedValue([]);
  mockSend.mockResolvedValue({});
  mockEnqueue.mockResolvedValue({});
});

describe("notifyAiDetectionScanFinished", () => {
  it("tells only the triggering user, links to the scan, and sends no email when nothing needs attention", async () => {
    mockPrevious.mockResolvedValue(scan({ id: 41, risk_score_grade: "B" }));
    mockFindings.mockResolvedValue([finding()]);

    await notifyAiDetectionScanFinished(42, ORG);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [org, input, sendEmail] = mockSend.mock.calls[0];
    expect(org).toBe(ORG);
    expect(input).toMatchObject({
      user_id: 5,
      type: "ai_detection_scan_completed",
      title: "Scan finished",
      message: "Scan of acme/app finished: 7 findings, grade B",
      entity_type: "ai_detection_scan",
      entity_id: 42,
      action_url: "/ai-detection/scans/42",
    });
    expect(sendEmail).toBeUndefined();
  });

  it("emails the triggering user and every admin once each about new secrets, new high-risk findings and a grade drop", async () => {
    mockScan.mockResolvedValue(scan({ risk_score_grade: "D" }));
    mockPrevious.mockResolvedValue(scan({ id: 41, risk_score_grade: "B" }));
    mockFindings.mockImplementation(async (scanId: number) =>
      scanId === 42
        ? [secret("AWS key"), finding({ name: "eval", risk_level: "high" }), finding()]
        : [finding()],
    );
    // The triggering user is also an admin: one row, one notice.
    mockRecipients.mockResolvedValue([{ ...triggerer, isAdmin: true }, admin]);

    await notifyAiDetectionScanFinished(42, ORG);

    expect(sentTo("ai_detection_scan_attention")).toEqual([5, 9]);
    const [, input, sendEmail, email] = mockSend.mock.calls.find(
      ([, i]) => i.type === "ai_detection_scan_attention",
    )!;
    expect(input.message).toBe(
      "Scan of acme/app needs attention: 1 new exposed secret, 1 new high-risk finding, governance grade dropped from B to D",
    );
    expect(sendEmail).toBe(true);
    expect(email).toMatchObject({
      template: "ai-detection-scan-alert.mjml",
      subjectKey: "Scan of {repository} needs attention",
      subjectVars: { repository: "acme/app" },
    });
    expect(email.variables.action_url).toMatch(/\/ai-detection\/scans\/42$/);
    expect(email.variables.details_html).toContain("AWS key");
  });

  it("does not count a high-risk finding the previous scan already had", async () => {
    mockPrevious.mockResolvedValue(scan({ id: 41 }));
    mockFindings.mockResolvedValue([finding({ name: "eval", risk_level: "high" })]);

    await notifyAiDetectionScanFinished(42, ORG);

    expect(sentTo("ai_detection_scan_attention")).toEqual([]);
  });

  it("treats every high-risk finding as new on a repository's first scan", async () => {
    mockFindings.mockResolvedValue([secret("Token")]);

    await notifyAiDetectionScanFinished(42, ORG);

    const [, , , email] = mockSend.mock.calls.find(
      ([, i]) => i.type === "ai_detection_scan_attention",
    )!;
    expect(email.variables.intro_text).toContain("first scan");
  });

  it("uses the score stored at completion without waiting or re-reading the scan", async () => {
    await notifyAiDetectionScanFinished(42, ORG);

    expect(mockScan).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][1].message).toBe(
      "Scan of acme/app finished: 7 findings, grade B",
    );
  });

  it("leaves the grade out, and skips the grade-drop check, when scoring failed", async () => {
    mockScan.mockResolvedValue(
      scan({ risk_score: null, risk_score_grade: null, findings_count: 1 }),
    );
    mockPrevious.mockResolvedValue(scan({ id: 41, risk_score_grade: "A" }));

    await notifyAiDetectionScanFinished(42, ORG);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][1].message).toBe("Scan of acme/app finished: 1 finding");
  });

  it("sends nothing for a scan that was already announced", async () => {
    mockDedup.mockResolvedValue(true);
    mockAutomations.mockResolvedValue([
      { automation_id: 3, action_key: "send_email", params: { subject: "s", body: "b" } },
    ]);

    await notifyAiDetectionScanFinished(42, ORG);

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("sends nothing for a scan that did not complete", async () => {
    mockScan.mockResolvedValue(scan({ status: "failed" }));

    await notifyAiDetectionScanFinished(42, ORG);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("skips a triggering user who has left the organization", async () => {
    mockRecipients.mockResolvedValue([admin]);
    mockFindings.mockResolvedValue([secret("Key")]);

    await notifyAiDetectionScanFinished(42, ORG);

    expect(sentTo("ai_detection_scan_completed")).toEqual([]);
    expect(sentTo("ai_detection_scan_attention")).toEqual([9]);
  });

  it("keeps going when one channel fails, and never throws", async () => {
    mockFindings.mockResolvedValue([secret("Key")]);
    mockSend.mockRejectedValueOnce(new Error("redis down"));
    mockAutomations.mockResolvedValue([
      { automation_id: 3, action_key: "send_email", params: { subject: "s", body: "b" } },
    ]);

    await expect(notifyAiDetectionScanFinished(42, ORG)).resolves.toBeUndefined();

    // The completed notice failed; both attention notices and the automations still ran.
    expect(sentTo("ai_detection_scan_attention")).toEqual([5, 9]);
    expect(mockEnqueue).toHaveBeenCalled();
  });

  it("never throws when the scan cannot be read", async () => {
    mockScan.mockRejectedValue(new Error("db down"));

    await expect(notifyAiDetectionScanFinished(42, ORG)).resolves.toBeUndefined();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("fires the completed trigger on every scan and the high-risk trigger only on new high-risk findings", async () => {
    mockAutomations.mockImplementation(async (_org: number, key: string) => [
      {
        automation_id: key === "ai_detection_scan_completed" ? 1 : 2,
        action_key: "send_email",
        params: {
          to: ["a@example.com"],
          subject: "{{scan.repository}} grade {{scan.grade}}",
          body: "{{scan.new_high_risk_count}} new: {{scan.new_high_risk_findings}} {{scan.url}}",
        },
      },
    ]);

    await notifyAiDetectionScanFinished(42, ORG);
    expect(mockAutomations.mock.calls.map(([, key]) => key)).toEqual([
      "ai_detection_scan_completed",
    ]);
    expect(mockEnqueue).toHaveBeenCalledWith(
      "send_email",
      expect.objectContaining({
        subject: "acme/app grade B",
        automation_id: 1,
        organizationId: ORG,
        to: ["a@example.com"],
      }),
    );

    jest.clearAllMocks();
    mockDedup.mockResolvedValue(false);
    mockFindings.mockResolvedValue([finding({ name: "eval", risk_level: "high" })]);
    await notifyAiDetectionScanFinished(42, ORG);

    expect(mockAutomations.mock.calls.map(([, key]) => key)).toEqual([
      "ai_detection_scan_completed",
      "ai_detection_high_risk_finding",
    ]);
    const highRiskJob = mockEnqueue.mock.calls.find(([, data]) => data.automation_id === 2)![1];
    expect(highRiskJob.body).toMatch(/^1 new: eval http.*\/ai-detection\/scans\/42$/);
  });
});

describe("notifyAiDetectionScanFailed", () => {
  it("emails the triggering user and admins about a failed scheduled scan, with a short redacted reason", async () => {
    mockScan.mockResolvedValue(
      scan({
        status: "failed",
        triggered_by_type: "scheduled",
        error_message:
          "Clone failed for https://x-access-token:abc123@github.com/acme/app\nstack...",
      }),
    );
    mockAutomations.mockResolvedValue([
      {
        automation_id: 4,
        action_key: "send_email",
        params: { subject: "{{scan.error}}", body: "" },
      },
    ]);

    await notifyAiDetectionScanFailed(42, ORG);

    expect(sentTo("ai_detection_scan_failed")).toEqual([5, 9]);
    const [, input, sendEmail, email] = mockSend.mock.calls[0];
    expect(input.message).toBe(
      "Scan of acme/app failed: Clone failed for https://github.com/acme/app",
    );
    expect(sendEmail).toBe(true);
    expect(email.subjectKey).toBe("Scan of {repository} failed");
    expect(mockEnqueue).toHaveBeenCalledWith(
      "send_email",
      expect.objectContaining({ subject: "Clone failed for https://github.com/acme/app" }),
    );
  });

  it("tells only the triggering user, in-app only, about a failed manual scan", async () => {
    mockScan.mockResolvedValue(scan({ status: "failed", error_message: "Repository too large" }));

    await notifyAiDetectionScanFailed(42, ORG);

    expect(sentTo("ai_detection_scan_failed")).toEqual([5]);
    expect(mockSend.mock.calls[0][2]).toBe(false);
    expect(mockSend.mock.calls[0][3]).toBeUndefined();
  });

  it("emails a failed webhook scan too", async () => {
    mockScan.mockResolvedValue(scan({ status: "failed", triggered_by_type: "webhook" }));

    await notifyAiDetectionScanFailed(42, ORG);

    expect(sentTo("ai_detection_scan_failed")).toEqual([5, 9]);
  });

  it("says nothing about a cancelled scan or one already announced", async () => {
    mockScan.mockResolvedValue(scan({ status: "cancelled" }));
    await notifyAiDetectionScanFailed(42, ORG);

    mockScan.mockResolvedValue(scan({ status: "failed" }));
    mockDedup.mockResolvedValue(true);
    await notifyAiDetectionScanFailed(42, ORG);

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    mockScan.mockResolvedValue(scan({ status: "failed" }));
    mockRecipients.mockRejectedValue(new Error("db down"));

    await expect(notifyAiDetectionScanFailed(42, ORG)).resolves.toBeUndefined();
  });
});

describe("helpers", () => {
  it("newHighRiskFindings compares by type, name and provider, high risk only", () => {
    const previous = [finding({ name: "eval", risk_level: "high" }), finding({ name: "x" })];
    const current = [
      finding({ name: "eval", risk_level: "high" }),
      finding({ name: "x", risk_level: "high" }), // was medium: newly high
      finding({ name: "eval", provider: "Other", risk_level: "high" }),
      finding({ name: "y" }),
    ];
    expect(newHighRiskFindings(current, previous).map((f) => `${f.name}/${f.provider}`)).toEqual([
      "x/OpenAI",
      "eval/Other",
    ]);
    expect(newHighRiskFindings(current, null)).toHaveLength(3);
  });

  it("isGradeDrop needs both grades and a worse one", () => {
    expect(isGradeDrop("B", "D")).toBe(true);
    expect(isGradeDrop("D", "B")).toBe(false);
    expect(isGradeDrop("B", "B")).toBe(false);
    expect(isGradeDrop(null, "F")).toBe(false);
    expect(isGradeDrop("A", null)).toBe(false);
  });

  it("shortFailureReason keeps the first line, caps it, and has a fallback", () => {
    expect(shortFailureReason(undefined)).toBe("Unknown error");
    expect(shortFailureReason("a\nb")).toBe("a");
    expect(shortFailureReason("x".repeat(500))).toHaveLength(200);
  });

  it("the trigger variables say when the score could not be calculated", () => {
    const replacements = buildAiDetectionScanReplacements({
      scanId: 1,
      repository: "acme/app",
      status: "completed",
      triggeredByType: "manual",
      url: "u",
      findingsCount: 0,
      highRiskCount: 0,
      secretCount: 0,
      score: null,
      grade: null,
      previousGrade: null,
      gradeDropped: false,
      newHighRiskNames: [],
      newSecretNames: [],
      isFirstScan: true,
      errorMessage: null,
    });
    expect(replacements["scan.grade"]).toBe("Not calculated");
    expect(replacements["scan.score"]).toBe("Not calculated");
    expect(replacements["scan.new_high_risk_findings"]).toBe("None");
  });
});

describe("migration 20261112143741-ai-detection-notifications-and-triggers", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const migration = require("../../../database/migrations/20261112143741-ai-detection-notifications-and-triggers.js");

  it("adds the notification enum values and seeds the three triggers linked to send_email", async () => {
    const sql: { query: string; options?: any }[] = [];
    const transaction = { commit: jest.fn(), rollback: jest.fn() };
    const queryInterface = {
      sequelize: {
        query: jest.fn(async (query: string, options?: any) => {
          sql.push({ query, options });
          return [[], 0];
        }),
        transaction: jest.fn(async () => transaction),
      },
    };

    await migration.up(queryInterface);

    const all = sql.map((s) => s.query).join("\n");
    for (const value of [
      "ai_detection_scan_completed",
      "ai_detection_scan_failed",
      "ai_detection_scan_attention",
    ]) {
      expect(all).toContain(`enum_notification_type ADD VALUE IF NOT EXISTS '${value}'`);
    }
    expect(all).toContain(
      "enum_notification_entity_type ADD VALUE IF NOT EXISTS 'ai_detection_scan'",
    );
    for (const key of [
      "ai_detection_scan_completed",
      "ai_detection_high_risk_finding",
      "ai_detection_scan_failed",
    ]) {
      expect(all).toContain(`('${key}',`);
    }
    const link = sql.find((s) => s.query.includes("automation_triggers_actions"))!;
    expect(link.query).toContain("a.key = 'send_email'");
    expect(link.options.replacements.keys).toHaveLength(3);
    expect(transaction.commit).toHaveBeenCalled();
  });
});
