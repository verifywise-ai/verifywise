/**
 * AI Detection scan notifications.
 *
 * Called once when a scan ends (aiDetection.service.ts → executeScan and
 * executeIncrementalScan):
 *   - notifyAiDetectionScanFinished(scanId, organizationId) after a completed
 *     scan, once scoreCompletedScan has stored the governance score
 *   - notifyAiDetectionScanFailed(scanId, organizationId) after a failed scan
 *
 * What each sends:
 *   - In-app notice to the user who triggered the scan (for scheduled and
 *     webhook scans that is the repository's creator): "Scan of owner/repo
 *     finished: 7 findings, grade B" or "... failed: <reason>". Links to the
 *     scan details page.
 *   - Attention notice, in-app plus email, to the triggering user and every
 *     org Admin (the deadline sweep's recipient rule) when, compared with the
 *     previous completed scan of the same repository, the scan has new exposed
 *     secrets, new high-risk findings, or a lower governance grade. On a
 *     repository's first scan every high-risk finding counts as new.
 *   - Failure email, to the same recipients, only for scheduled and webhook
 *     scans: whoever started a manual scan sees the failure on screen.
 *   - Automations: ai_detection_scan_completed on every completed scan,
 *     ai_detection_high_risk_finding when there are new high-risk findings,
 *     ai_detection_scan_failed on every failed scan.
 *
 * The rule-based governance score is stored before the completed notifier
 * runs (optional LLM analysis may adjust it later; the notices use the score
 * stored at completion). Scoring can fail: then the notices leave the grade
 * out and the grade-drop check is skipped.
 *
 * The notifier never throws and each channel is isolated: a failed email,
 * in-app write or enqueue is logged and the others still run, and nothing here
 * can fail the scan. A scan is announced once: the notifier's own in-app rows
 * (entity ai_detection_scan + scan id) are the record, checked before sending.
 */

import logger from "../../utils/logger/fileLogger";
import { getScanByIdQuery } from "../../utils/aiDetection.utils";
import {
  getActiveAutomationActionsQuery,
  getCountedScanFindingsQuery,
  getPreviousCompletedScanQuery,
  getScanRecipientsQuery,
  hasScanNotificationQuery,
  IScanFindingKey,
  IScanRecipient,
} from "../../utils/aiDetectionNotification.utils";
import {
  buildAiDetectionScanReplacements,
  IAiDetectionScanSummary,
  listFindingNames,
} from "../../utils/automation/aiDetection.automation.utils";
import { replaceTemplateVariables } from "../../utils/automation/automation.utils";
import { escapeHtml } from "../../utils/sanitization.utils";
import { translate } from "../../utils/i18n.utils";
import { getUserLanguage } from "../../utils/userPreference.utils";
import { enqueueAutomationAction } from "../automations/automationProducer";
import { sendInAppNotification, buildEntityUrl } from "../inAppNotification.service";
import { EMAIL_TEMPLATES } from "../../constants/emailTemplates";
import {
  NotificationEntityType,
  NotificationType,
} from "../../domain.layer/interfaces/i.notification";
import { IScan } from "../../domain.layer/interfaces/i.aiDetection";

const MAX_REASON_LENGTH = 200;

/** Grades best to worst; a higher index is a worse grade. */
const GRADE_ORDER = ["A", "B", "C", "D", "F"];

const SCAN_NOTIFICATION_TYPES = [
  NotificationType.AI_DETECTION_SCAN_COMPLETED,
  NotificationType.AI_DETECTION_SCAN_FAILED,
  NotificationType.AI_DETECTION_SCAN_ATTENTION,
];

/** Trigger types whose runs nobody watches, so a failure is emailed. */
const UNATTENDED_TRIGGERS = new Set(["scheduled", "webhook"]);

const TRIGGER_LABELS: Record<string, string> = {
  manual: "Manual scan",
  scheduled: "Scheduled scan",
  webhook: "GitHub webhook",
};

const frontendUrl = () => process.env.FRONTEND_URL || "http://localhost:5173";

const findingKey = (f: IScanFindingKey) => `${f.finding_type}::${f.name}::${f.provider ?? ""}`;

const isHighRisk = (f: IScanFindingKey) => f.risk_level === "high";

/**
 * High-risk findings (secrets included) of `current` that `previous` did not
 * have as high-risk. With no previous scan every high-risk finding is new.
 */
export function newHighRiskFindings(
  current: IScanFindingKey[],
  previous: IScanFindingKey[] | null,
): IScanFindingKey[] {
  const seen = new Set((previous ?? []).filter(isHighRisk).map(findingKey));
  const result = new Map<string, IScanFindingKey>();
  for (const finding of current) {
    if (!isHighRisk(finding) || seen.has(findingKey(finding))) continue;
    result.set(findingKey(finding), finding);
  }
  return [...result.values()];
}

/** True when both grades are known and `current` is worse than `previous`. */
export function isGradeDrop(previous: string | null, current: string | null): boolean {
  if (!previous || !current) return false;
  const before = GRADE_ORDER.indexOf(previous);
  const after = GRADE_ORDER.indexOf(current);
  return before >= 0 && after >= 0 && after > before;
}

/**
 * First line of a scan error, capped, with any credentials in a URL removed
 * (a clone error can echo the URL it used).
 */
export function shortFailureReason(errorMessage: string | null | undefined): string {
  const firstLine = (errorMessage || "Unknown error").split("\n")[0].trim() || "Unknown error";
  const redacted = firstLine.replace(/(\w+:\/\/)[^/\s@]+@/g, "$1");
  return redacted.length > MAX_REASON_LENGTH
    ? `${redacted.slice(0, MAX_REASON_LENGTH - 1)}…`
    : redacted;
}

/** The attention reasons in `lang`, joined for a one-line message. */
export function attentionReasons(summary: IAiDetectionScanSummary, lang?: string): string[] {
  const reasons: string[] = [];
  const secrets = summary.newSecretNames.length;
  const otherHighRisk = summary.newHighRiskNames.length - secrets;
  if (secrets === 1) reasons.push(translate(lang, "1 new exposed secret"));
  if (secrets > 1) reasons.push(translate(lang, "{count} new exposed secrets", { count: secrets }));
  if (otherHighRisk === 1) reasons.push(translate(lang, "1 new high-risk finding"));
  if (otherHighRisk > 1) {
    reasons.push(translate(lang, "{count} new high-risk findings", { count: otherHighRisk }));
  }
  if (summary.gradeDropped) {
    reasons.push(
      translate(lang, "governance grade dropped from {from} to {to}", {
        from: summary.previousGrade ?? "",
        to: summary.grade ?? "",
      }),
    );
  }
  return reasons;
}

/** "Scan of owner/repo finished: 7 findings, grade B" in `lang`. */
export function completedMessage(summary: IAiDetectionScanSummary, lang?: string): string {
  const vars = {
    repository: summary.repository,
    count: summary.findingsCount,
    grade: summary.grade ?? "",
  };
  const one = summary.findingsCount === 1;
  if (summary.grade) {
    return one
      ? translate(lang, "Scan of {repository} finished: 1 finding, grade {grade}", vars)
      : translate(lang, "Scan of {repository} finished: {count} findings, grade {grade}", vars);
  }
  return one
    ? translate(lang, "Scan of {repository} finished: 1 finding", vars)
    : translate(lang, "Scan of {repository} finished: {count} findings", vars);
}

const repositoryOf = (scan: IScan) => `${scan.repository_owner}/${scan.repository_name}`;

const scanActionUrl = (scanId: number) =>
  buildEntityUrl(NotificationEntityType.AI_DETECTION_SCAN, scanId);

/** Enqueue every active automation of `triggerKey`; one failure does not stop the rest. */
async function runAutomations(
  organizationId: number,
  triggerKey: string,
  summary: IAiDetectionScanSummary,
): Promise<void> {
  const rows = await getActiveAutomationActionsQuery(organizationId, triggerKey);
  if (rows.length === 0) return;
  const replacements = buildAiDetectionScanReplacements(summary);
  for (const row of rows) {
    try {
      const params = row.params || {};
      await enqueueAutomationAction(row.action_key, {
        ...params,
        subject: replaceTemplateVariables(params.subject || "", replacements),
        body: replaceTemplateVariables(params.body || "", replacements),
        automation_id: row.automation_id,
        organizationId,
      });
    } catch (error) {
      logger.error(
        `[ai-detection] ${triggerKey} automation ${row.automation_id} enqueue failed for scan ${summary.scanId}: ${String(error)}`,
      );
    }
  }
}

/** Run one notification channel; log and swallow its failure. */
async function isolated(label: string, scanId: number, work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    logger.error(
      `[ai-detection] ${label} failed for scan ${scanId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function detailRows(rows: [string, string][]): string {
  return rows
    .map(
      ([label, value]) =>
        `<tr><td class="data-label">${escapeHtml(label)}</td><td class="data-value">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
}

async function sendAttention(
  organizationId: number,
  recipients: IScanRecipient[],
  summary: IAiDetectionScanSummary,
): Promise<void> {
  const englishReasons = attentionReasons(summary).join(", ");
  const details: [string, string][] = [];
  if (summary.newSecretNames.length > 0) {
    details.push(["New exposed secrets", listFindingNames(summary.newSecretNames)]);
  }
  // newHighRiskNames includes the secrets; take each secret out once.
  const otherNew = [...summary.newHighRiskNames];
  for (const secret of summary.newSecretNames) {
    const index = otherNew.indexOf(secret);
    if (index >= 0) otherNew.splice(index, 1);
  }
  if (otherNew.length > 0) details.push(["New high-risk findings", listFindingNames(otherNew)]);
  if (summary.gradeDropped) {
    details.push(["Governance grade", `${summary.previousGrade} to ${summary.grade}`]);
  }
  details.push(["Findings", String(summary.findingsCount)]);

  for (const recipient of recipients) {
    await isolated(`attention notice to user ${recipient.id}`, summary.scanId, async () => {
      const lang = await getUserLanguage(recipient.id);
      await sendInAppNotification(
        organizationId,
        {
          user_id: recipient.id,
          lang,
          type: NotificationType.AI_DETECTION_SCAN_ATTENTION,
          title: translate(lang, "Scan needs attention"),
          message: translate(lang, "Scan of {repository} needs attention: {reasons}", {
            repository: summary.repository,
            reasons: attentionReasons(summary, lang).join(", "),
          }),
          entity_type: NotificationEntityType.AI_DETECTION_SCAN,
          entity_id: summary.scanId,
          entity_name: summary.repository,
          action_url: scanActionUrl(summary.scanId),
          metadata: { scan_id: summary.scanId, trigger: summary.triggeredByType },
        },
        true,
        {
          template: EMAIL_TEMPLATES.AI_DETECTION_SCAN_ALERT,
          subjectKey: "Scan of {repository} needs attention",
          subjectVars: { repository: summary.repository },
          variables: {
            alert_title: "Scan needs attention",
            recipient_name: recipient.name || "there",
            intro_text: summary.isFirstScan
              ? "An AI Detection scan found something to review. This is the first scan of this repository, so every high-risk finding counts as new."
              : "An AI Detection scan found something to review, compared with the previous scan of this repository.",
            repository: summary.repository,
            summary_text: englishReasons,
            details_html: detailRows(details),
            trigger_label: TRIGGER_LABELS[summary.triggeredByType] ?? summary.triggeredByType,
            fired_at: new Date().toLocaleString("en-US"),
            action_url: summary.url,
          },
        },
      );
    });
  }
}

/**
 * Announce a completed scan. Never throws; safe to call without awaiting.
 */
export async function notifyAiDetectionScanFinished(
  scanId: number,
  organizationId: number,
): Promise<void> {
  try {
    const scan = await getScanByIdQuery(scanId, organizationId);
    if (!scan || scan.status !== "completed") return;
    if (await hasScanNotificationQuery(organizationId, scanId, SCAN_NOTIFICATION_TYPES)) return;

    const previous = await getPreviousCompletedScanQuery({ ...scan, id: scanId }, organizationId);
    const findings = await getCountedScanFindingsQuery(scanId, organizationId);
    const previousFindings = previous
      ? await getCountedScanFindingsQuery(previous.id!, organizationId)
      : null;
    const newHighRisk = newHighRiskFindings(findings, previousFindings);
    const grade = scan.risk_score_grade ?? null;
    const previousGrade = previous?.risk_score_grade ?? null;

    const summary: IAiDetectionScanSummary = {
      scanId,
      repository: repositoryOf(scan),
      status: "completed",
      triggeredByType: scan.triggered_by_type || "manual",
      url: `${frontendUrl()}${scanActionUrl(scanId)}`,
      findingsCount: Number(scan.findings_count ?? findings.length),
      highRiskCount: findings.filter(isHighRisk).length,
      secretCount: findings.filter((f) => f.finding_type === "secret").length,
      score: scan.risk_score != null ? Number(scan.risk_score) : null,
      grade,
      previousGrade,
      gradeDropped: isGradeDrop(previousGrade, grade),
      newHighRiskNames: newHighRisk.map((f) => f.name),
      newSecretNames: newHighRisk.filter((f) => f.finding_type === "secret").map((f) => f.name),
      isFirstScan: previous === null,
      errorMessage: null,
    };

    const recipients = await getScanRecipientsQuery(organizationId, scan.triggered_by);
    const triggeredBy = recipients.find((r) => r.isTriggeredBy);

    if (triggeredBy) {
      await isolated("completed notice", scanId, async () => {
        const lang = await getUserLanguage(triggeredBy.id);
        await sendInAppNotification(organizationId, {
          user_id: triggeredBy.id,
          lang,
          type: NotificationType.AI_DETECTION_SCAN_COMPLETED,
          title: translate(lang, "Scan finished"),
          message: completedMessage(summary, lang),
          entity_type: NotificationEntityType.AI_DETECTION_SCAN,
          entity_id: scanId,
          entity_name: summary.repository,
          action_url: scanActionUrl(scanId),
          metadata: { scan_id: scanId, trigger: summary.triggeredByType, grade },
        });
      });
    }

    if (attentionReasons(summary).length > 0 && recipients.length > 0) {
      await sendAttention(organizationId, recipients, summary);
    }

    await isolated("ai_detection_scan_completed automations", scanId, () =>
      runAutomations(organizationId, "ai_detection_scan_completed", summary),
    );
    if (summary.newHighRiskNames.length > 0) {
      await isolated("ai_detection_high_risk_finding automations", scanId, () =>
        runAutomations(organizationId, "ai_detection_high_risk_finding", summary),
      );
    }
  } catch (error) {
    logger.error(
      `[ai-detection] completed-scan notifications failed for scan ${scanId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Announce a failed scan. A cancelled scan is not announced. Never throws;
 * safe to call without awaiting.
 */
export async function notifyAiDetectionScanFailed(
  scanId: number,
  organizationId: number,
): Promise<void> {
  try {
    const scan = await getScanByIdQuery(scanId, organizationId);
    if (!scan || scan.status !== "failed") return;
    if (await hasScanNotificationQuery(organizationId, scanId, SCAN_NOTIFICATION_TYPES)) return;

    const triggeredByType = scan.triggered_by_type || "manual";
    const unattended = UNATTENDED_TRIGGERS.has(triggeredByType);
    const reason = shortFailureReason(scan.error_message);
    const summary: IAiDetectionScanSummary = {
      scanId,
      repository: repositoryOf(scan),
      status: "failed",
      triggeredByType,
      url: `${frontendUrl()}${scanActionUrl(scanId)}`,
      findingsCount: 0,
      highRiskCount: 0,
      secretCount: 0,
      score: null,
      grade: null,
      previousGrade: null,
      gradeDropped: false,
      newHighRiskNames: [],
      newSecretNames: [],
      isFirstScan: false,
      errorMessage: reason,
    };

    const recipients = (await getScanRecipientsQuery(organizationId, scan.triggered_by)).filter(
      (r) => r.isTriggeredBy || unattended,
    );

    for (const recipient of recipients) {
      await isolated(`failed notice to user ${recipient.id}`, scanId, async () => {
        const lang = await getUserLanguage(recipient.id);
        await sendInAppNotification(
          organizationId,
          {
            user_id: recipient.id,
            lang,
            type: NotificationType.AI_DETECTION_SCAN_FAILED,
            title: translate(lang, "Scan failed"),
            message: translate(lang, "Scan of {repository} failed: {reason}", {
              repository: summary.repository,
              reason,
            }),
            entity_type: NotificationEntityType.AI_DETECTION_SCAN,
            entity_id: scanId,
            entity_name: summary.repository,
            action_url: scanActionUrl(scanId),
            metadata: { scan_id: scanId, trigger: triggeredByType },
          },
          unattended,
          unattended
            ? {
                template: EMAIL_TEMPLATES.AI_DETECTION_SCAN_ALERT,
                subjectKey: "Scan of {repository} failed",
                subjectVars: { repository: summary.repository },
                variables: {
                  alert_title: "Scan failed",
                  recipient_name: recipient.name || "there",
                  intro_text:
                    "An AI Detection scan of this repository could not finish, so its findings and score were not updated.",
                  repository: summary.repository,
                  summary_text: reason,
                  details_html: "",
                  trigger_label: TRIGGER_LABELS[triggeredByType] ?? triggeredByType,
                  fired_at: new Date().toLocaleString("en-US"),
                  action_url: summary.url,
                },
              }
            : undefined,
        );
      });
    }

    await isolated("ai_detection_scan_failed automations", scanId, () =>
      runAutomations(organizationId, "ai_detection_scan_failed", summary),
    );
  } catch (error) {
    logger.error(
      `[ai-detection] failed-scan notifications failed for scan ${scanId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
