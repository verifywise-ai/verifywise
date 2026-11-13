/**
 * AI Detection scan notifier: who gets what, a missing score, the new-finding
 * and grade comparisons, the announce-once claim, failure isolation, and the
 * Automations triggers it fires.
 */

import {
  notifyAiDetectionScanFinished,
  notifyAiDetectionScanFailed,
  newHighRiskFindings,
  newFindingLabel,
  isGradeDrop,
  previousGradeToCompare,
  sameScoreBasis,
  shortFailureReason,
} from "../scanNotifications";
import { getScanByIdQuery } from "../../../utils/aiDetection.utils";
import {
  claimScanNotificationQuery,
  getActiveAutomationActionsQuery,
  getCountedScanFindingsQuery,
  getPreviousCompletedScanQuery,
  getPreviousScanFindingsQuery,
  getScanRecipientsQuery,
  IScanFindingKey,
  IScanRecipient,
} from "../../../utils/aiDetectionNotification.utils";
import { sendInAppNotification } from "../../inAppNotification.service";
import { enqueueAutomationAction } from "../../automations/automationProducer";
import {
  buildAiDetectionScanReplacements,
  formatUtcTimestamp,
} from "../../../utils/automation/aiDetection.automation.utils";
import { IScan, IRiskScoreDetails } from "../../../domain.layer/interfaces/i.aiDetection";
import { getUserLanguage } from "../../../utils/userPreference.utils";
import { translate } from "../../../utils/i18n.utils";

jest.mock("../../../utils/aiDetection.utils", () => ({ getScanByIdQuery: jest.fn() }));
jest.mock("../../../utils/aiDetectionNotification.utils", () => ({
  claimScanNotificationQuery: jest.fn(),
  getActiveAutomationActionsQuery: jest.fn(),
  getCountedScanFindingsQuery: jest.fn(),
  getPreviousCompletedScanQuery: jest.fn(),
  getPreviousScanFindingsQuery: jest.fn(),
  getScanRecipientsQuery: jest.fn(),
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
const mockPreviousFindings = getPreviousScanFindingsQuery as jest.Mock;
const mockPrevious = getPreviousCompletedScanQuery as jest.Mock;
const mockRecipients = getScanRecipientsQuery as jest.Mock;
const mockClaim = claimScanNotificationQuery as jest.Mock;
const mockLanguage = getUserLanguage as jest.Mock;
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

const secret = (name: string, paths: string[] = [".env"]) =>
  finding({
    name,
    provider: null,
    finding_type: "secret",
    risk_level: "high",
    paths,
  });

const llmDetails = (llm_enhanced: boolean, rule_grade?: string) =>
  ({ llm_enhanced, ...(rule_grade ? { rule_grade } : {}) }) as unknown as IRiskScoreDetails;

const triggerer: IScanRecipient = { id: 5, name: "Ada", isTriggeredBy: true, isAdmin: false };
const admin: IScanRecipient = { id: 9, name: "Grace", isTriggeredBy: false, isAdmin: true };

/** Recipients the in-app sends went to, by notification type. */
const sentTo = (type: string) =>
  mockSend.mock.calls.filter(([, input]) => input.type === type).map(([, input]) => input.user_id);

/** Title and message as the recipient reads them (keys translated like sendInAppNotification does). */
const rendered = (input: any) => ({
  title: input.titleKey ? translate(input.lang, input.titleKey, input.titleVars) : input.title,
  message: input.messageKey
    ? translate(input.lang, input.messageKey, input.messageVars)
    : input.message,
});

const attentionCall = () =>
  mockSend.mock.calls.find(([, i]) => i.type === "ai_detection_scan_attention");

beforeEach(() => {
  jest.clearAllMocks();
  mockScan.mockResolvedValue(scan());
  mockClaim.mockResolvedValue(true);
  mockPrevious.mockResolvedValue(null);
  mockFindings.mockResolvedValue([]);
  // By default the previous scan's findings are what the counted query returns for it.
  mockPreviousFindings.mockImplementation((scanId: number, org: number) =>
    mockFindings(scanId, org),
  );
  mockLanguage.mockResolvedValue("en");
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
      titleKey: "Scan finished",
      messageKey: "Scan of {repository} finished: {count} findings, grade {grade}",
      entity_type: "ai_detection_scan",
      entity_id: 42,
      action_url: "/ai-detection/scans/42",
    });
    // The scan's own findings_count (7), as on the scan page the notice links to.
    expect(rendered(input)).toEqual({
      title: "Scan finished",
      message: "Scan of acme/app finished: 7 findings, grade B",
    });
    expect(sendEmail).toBeUndefined();
    expect(mockClaim).toHaveBeenCalledWith(42, ORG, "completed");
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
    const [, input, sendEmail, email] = attentionCall()!;
    expect(input.titleKey).toBe("Scan needs attention");
    expect(input.messageKey).toBe("Scan of {repository} needs attention: {reasons}");
    expect(rendered(input).message).toBe(
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
    // The secret is listed once, under secrets only.
    expect(email.variables.details_html).toMatch(
      /New high-risk findings<\/td><td class="data-value">eval</,
    );
    expect(email.variables.fired_at).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{2}:\d{2} UTC$/);
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

    const [, , , email] = attentionCall()!;
    expect(email.variables.intro_text).toContain("first scan");
  });

  it("uses the score stored at completion without waiting or re-reading the scan", async () => {
    await notifyAiDetectionScanFinished(42, ORG);

    expect(mockScan).toHaveBeenCalledTimes(1);
    expect(rendered(mockSend.mock.calls[0][1]).message).toBe(
      "Scan of acme/app finished: 7 findings, grade B",
    );
  });

  it("leaves the grade out, and skips the grade-drop check, when scoring failed", async () => {
    mockScan.mockResolvedValue(
      scan({ risk_score: null, risk_score_grade: null, findings_count: 1 }),
    );
    mockPrevious.mockResolvedValue(scan({ id: 41, risk_score_grade: "A" }));
    mockFindings.mockResolvedValue([finding()]);

    await notifyAiDetectionScanFinished(42, ORG);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(rendered(mockSend.mock.calls[0][1]).message).toBe(
      "Scan of acme/app finished: 1 finding",
    );
  });

  it("sends nothing, and reads nothing further, when another call already claimed the scan", async () => {
    mockClaim.mockResolvedValue(false);
    mockAutomations.mockResolvedValue([
      { automation_id: 3, action_key: "send_email", params: { subject: "s", body: "b" } },
    ]);

    await notifyAiDetectionScanFinished(42, ORG);

    expect(mockClaim).toHaveBeenCalledWith(42, ORG, "completed");
    expect(mockFindings).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("does not report a finding the previous scan had, even if a reviewer accepted it there", async () => {
    mockPrevious.mockResolvedValue(scan({ id: 41 }));
    // The counted findings of the previous scan would leave the accepted one
    // out; the baseline query keeps it.
    mockFindings.mockImplementation(async (scanId: number) =>
      scanId === 42 ? [finding({ name: "eval", risk_level: "high" })] : [],
    );
    mockPreviousFindings.mockResolvedValue([finding({ name: "eval", risk_level: "high" })]);

    await notifyAiDetectionScanFinished(42, ORG);

    expect(mockPreviousFindings).toHaveBeenCalledWith(41, ORG);
    expect(mockFindings).not.toHaveBeenCalledWith(41, ORG);
    expect(sentTo("ai_detection_scan_attention")).toEqual([]);
  });

  it("compares vulnerability findings only when both scans ran the vulnerability checks", async () => {
    const injection = finding({
      name: "prompt",
      finding_type: "prompt_injection",
      risk_level: "high",
    });
    mockFindings.mockImplementation(async (scanId: number) => (scanId === 42 ? [injection] : []));

    // The previous scan was incremental: its missing vulnerability is not news.
    mockScan.mockResolvedValue(scan({ vulnerability_check_status: "ran" }));
    mockPrevious.mockResolvedValue(scan({ id: 41, vulnerability_check_status: "incremental" }));
    await notifyAiDetectionScanFinished(42, ORG);
    expect(sentTo("ai_detection_scan_attention")).toEqual([]);

    mockSend.mockClear();
    mockPrevious.mockResolvedValue(scan({ id: 41, vulnerability_check_status: "ran" }));
    await notifyAiDetectionScanFinished(42, ORG);
    expect(sentTo("ai_detection_scan_attention")).toEqual([5, 9]);
  });

  it("reports a known secret found in a new file, with the new path", async () => {
    mockPrevious.mockResolvedValue(scan({ id: 41 }));
    mockFindings.mockImplementation(async (scanId: number) =>
      scanId === 42 ? [secret("AWS key", [".env", "deploy/prod.env"])] : [secret("AWS key")],
    );

    await notifyAiDetectionScanFinished(42, ORG);

    const [, input, , email] = attentionCall()!;
    expect(rendered(input).message).toBe("Scan of acme/app needs attention: 1 new exposed secret");
    expect(email.variables.details_html).toContain("AWS key (deploy/prod.env)");
  });

  it("does not report a known secret in the same files", async () => {
    mockPrevious.mockResolvedValue(scan({ id: 41 }));
    mockFindings.mockResolvedValue([secret("AWS key", [".env"])]);

    await notifyAiDetectionScanFinished(42, ORG);

    expect(sentTo("ai_detection_scan_attention")).toEqual([]);
  });

  it("compares the previous scan's rule-based grade, kept through its LLM adjustment", async () => {
    mockScan.mockResolvedValue(
      scan({ risk_score_grade: "C", risk_score_details: llmDetails(false, "C") }),
    );
    // Shown as A after LLM analysis, but its rule-based grade was B.
    mockPrevious.mockResolvedValue(
      scan({ id: 41, risk_score_grade: "A", risk_score_details: llmDetails(true, "B") }),
    );

    await notifyAiDetectionScanFinished(42, ORG);

    expect(rendered(attentionCall()![1]).message).toBe(
      "Scan of acme/app needs attention: governance grade dropped from B to C",
    );
  });

  it("reports no drop when the rule-based grades are equal, whatever the LLM-adjusted one was", async () => {
    mockScan.mockResolvedValue(
      scan({ risk_score_grade: "C", risk_score_details: llmDetails(false, "C") }),
    );
    mockPrevious.mockResolvedValue(
      scan({ id: 41, risk_score_grade: "A", risk_score_details: llmDetails(true, "C") }),
    );

    await notifyAiDetectionScanFinished(42, ORG);

    expect(sentTo("ai_detection_scan_attention")).toEqual([]);
  });

  it("skips the grade-drop check when an older LLM-adjusted previous score has no rule grade", async () => {
    mockScan.mockResolvedValue(
      scan({ risk_score_grade: "D", risk_score_details: llmDetails(false) }),
    );
    mockPrevious.mockResolvedValue(
      scan({ id: 41, risk_score_grade: "B", risk_score_details: llmDetails(true) }),
    );

    await notifyAiDetectionScanFinished(42, ORG);

    expect(sentTo("ai_detection_scan_attention")).toEqual([]);
  });

  it("reads each recipient's language once and passes it on", async () => {
    mockScan.mockResolvedValue(scan({ risk_score_grade: "D" }));
    mockPrevious.mockResolvedValue(scan({ id: 41, risk_score_grade: "B" }));

    await notifyAiDetectionScanFinished(42, ORG);

    // The triggering user gets two notices but one lookup.
    expect(mockLanguage.mock.calls.map(([id]) => id).sort()).toEqual([5, 9]);
    expect(mockSend.mock.calls.every(([, input]) => input.lang === "en")).toBe(true);
  });

  it("reports a known vulnerability in a new file, with the new path", async () => {
    const vuln = (paths: string[]) =>
      finding({
        name: "Prompt injection: index.ts",
        provider: "LLM01",
        finding_type: "prompt_injection",
        risk_level: "high",
        paths,
      });
    mockScan.mockResolvedValue(scan({ vulnerability_check_status: "ran" }));
    mockPrevious.mockResolvedValue(scan({ id: 41, vulnerability_check_status: "ran" }));
    mockFindings.mockImplementation(async (scanId: number) =>
      scanId === 42 ? [vuln(["src/a/index.ts", "src/b/index.ts"])] : [vuln(["src/a/index.ts"])],
    );

    await notifyAiDetectionScanFinished(42, ORG);

    const [, input, , email] = attentionCall()!;
    expect(rendered(input).message).toBe(
      "Scan of acme/app needs attention: 1 new high-risk finding",
    );
    expect(email.variables.details_html).toContain("Prompt injection: index.ts (src/b/index.ts)");
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
    expect(input).toMatchObject({
      titleKey: "Scan failed",
      messageKey: "Scan of {repository} failed: {reason}",
    });
    expect(rendered(input).message).toBe(
      "Scan of acme/app failed: Clone failed for https://github.com/acme/app",
    );
    expect(mockClaim).toHaveBeenCalledWith(42, ORG, "failed");
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

  it("announces a stale-swept scan without taking the notified_at claim", async () => {
    mockScan.mockResolvedValue(scan({ status: "failed", error_message: "Scan timed out" }));

    await notifyAiDetectionScanFailed(42, ORG, { claim: false });

    expect(mockClaim).not.toHaveBeenCalled();
    expect(sentTo("ai_detection_scan_failed")).toEqual([5]);
  });

  it("says nothing about a cancelled scan or one already announced", async () => {
    mockScan.mockResolvedValue(scan({ status: "cancelled" }));
    await notifyAiDetectionScanFailed(42, ORG);
    expect(mockClaim).not.toHaveBeenCalled();

    mockScan.mockResolvedValue(scan({ status: "failed" }));
    mockClaim.mockResolvedValue(false);
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

  it("newHighRiskFindings reports a known secret only for new paths, and gates vulnerabilities", () => {
    const vuln = finding({ name: "v", finding_type: "pii_exposure", risk_level: "high" });
    const previous = [secret("Key", ["a.env"])];
    const current = [secret("Key", ["a.env", "b.env", "c.env", "d.env", "e.env"]), vuln];

    const found = newHighRiskFindings(current, previous);
    expect(found.map(newFindingLabel)).toEqual(["Key (b.env, c.env, d.env and 1 more)"]);
    expect(
      newHighRiskFindings(current, previous, { compareVulnerabilities: true }).map((f) => f.name),
    ).toEqual(["Key", "v"]);
    // First scan: every high-risk finding counts, vulnerabilities included, no path detail.
    expect(newHighRiskFindings(current, null).map(newFindingLabel)).toEqual(["Key", "v"]);
    expect(newHighRiskFindings([secret("Key", ["a.env"])], previous)).toEqual([]);
  });

  it("previousGradeToCompare prefers the stored rule grade and falls back to the same basis", () => {
    const current = { risk_score_details: llmDetails(false, "C") };
    expect(
      previousGradeToCompare(current, {
        risk_score_grade: "A",
        risk_score_details: llmDetails(true, "B"),
      }),
    ).toBe("B");
    // Older previous score without a rule grade.
    expect(
      previousGradeToCompare(current, {
        risk_score_grade: "A",
        risk_score_details: llmDetails(true),
      }),
    ).toBeNull();
    expect(
      previousGradeToCompare(current, {
        risk_score_grade: "B",
        risk_score_details: llmDetails(false),
      }),
    ).toBe("B");
    // This scan's LLM write already landed: compare stored grades on the same basis.
    expect(
      previousGradeToCompare(
        { risk_score_details: llmDetails(true, "C") },
        { risk_score_grade: "A", risk_score_details: llmDetails(true, "B") },
      ),
    ).toBe("A");
  });

  it("formatUtcTimestamp is UTC and labelled", () => {
    expect(formatUtcTimestamp(new Date("2026-11-13T00:05:00Z"))).toBe("Nov 13, 2026, 00:05 UTC");
    expect(formatUtcTimestamp(new Date("2026-11-13T14:00:00Z"))).toBe("Nov 13, 2026, 14:00 UTC");
  });

  it("sameScoreBasis compares LLM-adjusted grades only with LLM-adjusted ones", () => {
    const rule = { risk_score_details: llmDetails(false) };
    const llm = { risk_score_details: llmDetails(true) };
    expect(sameScoreBasis(rule, rule)).toBe(true);
    expect(sameScoreBasis(llm, llm)).toBe(true);
    expect(sameScoreBasis(rule, llm)).toBe(false);
    expect(sameScoreBasis({ risk_score_details: null }, rule)).toBe(true);
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
    expect(all).toMatch(/ai_detection_scans\s+ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ/);
    expect(transaction.commit).toHaveBeenCalled();

    sql.length = 0;
    await migration.down(queryInterface);
    expect(sql.map((s) => s.query).join("\n")).toContain(
      "ai_detection_scans DROP COLUMN IF EXISTS notified_at",
    );
  });
});
