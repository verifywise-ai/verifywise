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
 *     secrets (a new secret, or a known one in a new file), new high-risk
 *     findings (a vulnerability also counts in a new file), or a lower
 *     governance grade. On a repository's first scan
 *     every high-risk finding counts as new. Vulnerability findings are only
 *     compared when both scans ran the vulnerability checks on every file.
 *   - Failure email, to the same recipients, only for scheduled and webhook
 *     scans: whoever started a manual scan sees the failure on screen.
 *   - Automations: ai_detection_scan_completed on every completed scan,
 *     ai_detection_high_risk_finding when there are new high-risk findings,
 *     ai_detection_scan_failed on every failed scan.
 *
 * The rule-based governance score is stored before the completed notifier
 * runs (optional LLM analysis may adjust it later; the notices use the score
 * stored at completion). Scoring can fail: then the notices leave the grade
 * out and the grade-drop check is skipped. Grades are compared on the
 * rule-based basis: the previous scan's `risk_score_details.rule_grade`,
 * which survives its LLM adjustment. Older scores have no rule_grade; then
 * the stored grades are compared only when neither or both are LLM-adjusted.
 *
 * The notifier never throws and each channel is isolated: a failed email,
 * in-app write or enqueue is logged and the others still run, and nothing here
 * can fail the scan. A scan is announced at most once: before sending, the
 * notifier claims it by setting ai_detection_scans.notified_at in one
 * conditional UPDATE, and only the call that wins the claim sends anything.
 * Scans that the scheduler marks failed as stale (crash or restart) are
 * announced through notifyAiDetectionScanFailed with `claim: false`: the
 * sweep's UPDATE ... RETURNING hands each scan over once, and leaving
 * notified_at free lets a scan that was only slow still announce its
 * completion.
 */

import logger from "../../utils/logger/fileLogger";
import { getScanByIdQuery } from "../../utils/aiDetection.utils";
import {
  claimScanNotificationQuery,
  getActiveAutomationActionsQuery,
  getCountedScanFindingsQuery,
  getPreviousCompletedScanQuery,
  getPreviousScanFindingsQuery,
  getScanRecipientsQuery,
  IScanFindingKey,
  IScanRecipient,
} from "../../utils/aiDetectionNotification.utils";
import {
  buildAiDetectionScanReplacements,
  formatUtcTimestamp,
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
  ITranslationVars,
  NotificationEntityType,
  NotificationType,
} from "../../domain.layer/interfaces/i.notification";
import { IScan, VULNERABILITY_FINDING_TYPES } from "../../domain.layer/interfaces/i.aiDetection";

const MAX_REASON_LENGTH = 200;

/** Grades best to worst; a higher index is a worse grade. */
const GRADE_ORDER = ["A", "B", "C", "D", "F"];

const VULNERABILITY_TYPES = new Set<string>(VULNERABILITY_FINDING_TYPES);

const MAX_LISTED_PATHS = 3;

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

const isPathTracked = (f: IScanFindingKey) =>
  f.finding_type === "secret" || VULNERABILITY_TYPES.has(f.finding_type);

/** A new high-risk finding; `addedPaths` is set for a known secret or vulnerability in new files. */
export interface INewHighRiskFinding extends IScanFindingKey {
  addedPaths: string[] | null;
}

/**
 * High-risk findings (secrets included) of `current` that `previous` did not
 * have as high-risk. With no previous scan every high-risk finding is new.
 *
 * - A secret or vulnerability the previous scan had counts again when it is
 *   in a file the previous scan did not list: a scan keeps one row per name
 *   and provider (a vulnerability's name only has the file's basename), so a
 *   second one of the same kind is only visible as a new path.
 * - Vulnerability findings count only with `compareVulnerabilities` (both
 *   scans ran the checks on every file). Otherwise a vulnerability missing
 *   from a scan that skipped or did not finish the checks would look new.
 */
export function newHighRiskFindings(
  current: IScanFindingKey[],
  previous: IScanFindingKey[] | null,
  options: { compareVulnerabilities?: boolean } = {},
): INewHighRiskFinding[] {
  const known = new Map<string, Set<string>>();
  for (const finding of previous ?? []) {
    if (!isHighRisk(finding)) continue;
    const paths = known.get(findingKey(finding)) ?? new Set<string>();
    for (const path of finding.paths ?? []) paths.add(path);
    known.set(findingKey(finding), paths);
  }

  const result = new Map<string, INewHighRiskFinding>();
  for (const finding of current) {
    if (!isHighRisk(finding)) continue;
    const key = findingKey(finding);
    if (previous !== null) {
      if (VULNERABILITY_TYPES.has(finding.finding_type) && !options.compareVulnerabilities) {
        continue;
      }
      const knownPaths = known.get(key);
      if (knownPaths) {
        if (!isPathTracked(finding)) continue;
        const added = [...new Set(finding.paths ?? [])].filter((p) => !knownPaths.has(p));
        if (added.length === 0) continue;
        result.set(key, { ...finding, addedPaths: added });
        continue;
      }
    }
    if (!result.has(key)) result.set(key, { ...finding, addedPaths: null });
  }
  return [...result.values()];
}

/** "AWS key" for a new finding, "AWS key (config/prod.env)" for a known one in new files. */
export function newFindingLabel(finding: INewHighRiskFinding): string {
  if (!finding.addedPaths || finding.addedPaths.length === 0) return finding.name;
  const shown = finding.addedPaths.slice(0, MAX_LISTED_PATHS).join(", ");
  const rest = finding.addedPaths.length - MAX_LISTED_PATHS;
  return `${finding.name} (${rest > 0 ? `${shown} and ${rest} more` : shown})`;
}

/**
 * Whether two scans' stored grades are on the same basis: either both or
 * neither include the LLM adjustment (up to LLM_ADJUSTMENT_CAP per dimension).
 */
export function sameScoreBasis(
  current: Pick<IScan, "risk_score_details">,
  previous: Pick<IScan, "risk_score_details">,
): boolean {
  return (
    Boolean(current.risk_score_details?.llm_enhanced) ===
    Boolean(previous.risk_score_details?.llm_enhanced)
  );
}

/**
 * The previous grade to compare `current`'s grade with, or null when the two
 * are not comparable. The notifier normally sees this scan's rule-based grade
 * (its LLM analysis, if any, is still running), so the previous scan's
 * rule-based grade (`rule_grade`, kept through its LLM write) is the match.
 * Without a rule_grade (older scores), or if this scan's LLM write already
 * landed, the stored grades are compared only on the same basis.
 */
export function previousGradeToCompare(
  current: Pick<IScan, "risk_score_details">,
  previous: Pick<IScan, "risk_score_details" | "risk_score_grade">,
): string | null {
  const previousRuleGrade = previous.risk_score_details?.rule_grade;
  if (previousRuleGrade && !current.risk_score_details?.llm_enhanced) return previousRuleGrade;
  return sameScoreBasis(current, previous) ? (previous.risk_score_grade ?? null) : null;
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

/** True when the attention notice goes out (same test as attentionReasons being non-empty). */
const needsAttention = (summary: IAiDetectionScanSummary) =>
  summary.newHighRiskNames.length > 0 || summary.gradeDropped;

/**
 * Message key and vars of "Scan of owner/repo finished: 7 findings, grade B";
 * sendInAppNotification translates it for the recipient.
 */
export function completedMessageKey(summary: IAiDetectionScanSummary): {
  messageKey: string;
  messageVars: ITranslationVars;
} {
  const messageVars = {
    repository: summary.repository,
    count: summary.findingsCount,
    grade: summary.grade ?? "",
  };
  const one = summary.findingsCount === 1;
  if (summary.grade) {
    return one
      ? { messageKey: "Scan of {repository} finished: 1 finding, grade {grade}", messageVars }
      : {
          messageKey: "Scan of {repository} finished: {count} findings, grade {grade}",
          messageVars,
        };
  }
  return one
    ? { messageKey: "Scan of {repository} finished: 1 finding", messageVars }
    : { messageKey: "Scan of {repository} finished: {count} findings", messageVars };
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

/** Each recipient's saved language, read once per recipient. */
async function recipientLanguages(recipients: IScanRecipient[]): Promise<Map<number, string>> {
  const entries = await Promise.all(
    recipients.map(async (r) => [r.id, await getUserLanguage(r.id)] as const),
  );
  return new Map(entries);
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
  newHighRisk: INewHighRiskFinding[],
  languages: Map<number, string>,
): Promise<void> {
  const englishReasons = attentionReasons(summary).join(", ");
  const reasonsByLang = new Map<string | undefined, string>();
  const reasonsIn = (lang: string | undefined): string => {
    if (!reasonsByLang.has(lang)) {
      reasonsByLang.set(lang, attentionReasons(summary, lang).join(", "));
    }
    return reasonsByLang.get(lang)!;
  };
  const details: [string, string][] = [];
  if (summary.newSecretNames.length > 0) {
    details.push(["New exposed secrets", listFindingNames(summary.newSecretNames)]);
  }
  const otherNew = newHighRisk.filter((f) => f.finding_type !== "secret").map(newFindingLabel);
  if (otherNew.length > 0) details.push(["New high-risk findings", listFindingNames(otherNew)]);
  if (summary.gradeDropped) {
    details.push(["Governance grade", `${summary.previousGrade} to ${summary.grade}`]);
  }
  details.push(["Findings", String(summary.findingsCount)]);

  await Promise.allSettled(
    recipients.map((recipient) =>
      isolated(`attention notice to user ${recipient.id}`, summary.scanId, async () => {
        const lang = languages.get(recipient.id);
        await sendInAppNotification(
          organizationId,
          {
            user_id: recipient.id,
            lang,
            type: NotificationType.AI_DETECTION_SCAN_ATTENTION,
            titleKey: "Scan needs attention",
            messageKey: "Scan of {repository} needs attention: {reasons}",
            messageVars: { repository: summary.repository, reasons: reasonsIn(lang) },
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
              fired_at: formatUtcTimestamp(),
              action_url: summary.url,
            },
          },
        );
      }),
    ),
  );
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
    if (!(await claimScanNotificationQuery(scanId, organizationId, "completed"))) return;

    const previous = await getPreviousCompletedScanQuery({ ...scan, id: scanId }, organizationId);
    const findings = await getCountedScanFindingsQuery(scanId, organizationId);
    const previousFindings = previous
      ? await getPreviousScanFindingsQuery(previous.id!, organizationId)
      : null;
    const newHighRisk = newHighRiskFindings(findings, previousFindings, {
      compareVulnerabilities:
        scan.vulnerability_check_status === "ran" && previous?.vulnerability_check_status === "ran",
    });
    const grade = scan.risk_score_grade ?? null;
    const comparedGrade = previous ? previousGradeToCompare(scan, previous) : null;
    const previousGrade = comparedGrade ?? previous?.risk_score_grade ?? null;

    const summary: IAiDetectionScanSummary = {
      scanId,
      repository: repositoryOf(scan),
      status: "completed",
      triggeredByType: scan.triggered_by_type || "manual",
      url: `${frontendUrl()}${scanActionUrl(scanId)}`,
      // The scan's own count, so the notice matches the scan page it links to.
      findingsCount: Number(scan.findings_count ?? findings.length),
      highRiskCount: findings.filter(isHighRisk).length,
      secretCount: findings.filter((f) => f.finding_type === "secret").length,
      score: scan.risk_score != null ? Number(scan.risk_score) : null,
      grade,
      previousGrade,
      gradeDropped: isGradeDrop(comparedGrade, grade),
      newHighRiskNames: newHighRisk.map(newFindingLabel),
      newSecretNames: newHighRisk.filter((f) => f.finding_type === "secret").map(newFindingLabel),
      isFirstScan: previous === null,
      errorMessage: null,
    };

    const recipients = await getScanRecipientsQuery(organizationId, scan.triggered_by);
    const triggeredBy = recipients.find((r) => r.isTriggeredBy);
    const attentionRecipients = needsAttention(summary) ? recipients : [];
    const languages = await recipientLanguages(
      attentionRecipients.length > 0 ? recipients : triggeredBy ? [triggeredBy] : [],
    );

    if (triggeredBy) {
      await isolated("completed notice", scanId, async () => {
        await sendInAppNotification(organizationId, {
          user_id: triggeredBy.id,
          lang: languages.get(triggeredBy.id),
          type: NotificationType.AI_DETECTION_SCAN_COMPLETED,
          titleKey: "Scan finished",
          ...completedMessageKey(summary),
          entity_type: NotificationEntityType.AI_DETECTION_SCAN,
          entity_id: scanId,
          entity_name: summary.repository,
          action_url: scanActionUrl(scanId),
          metadata: { scan_id: scanId, trigger: summary.triggeredByType, grade },
        });
      });
    }

    if (attentionRecipients.length > 0) {
      await sendAttention(organizationId, attentionRecipients, summary, newHighRisk, languages);
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
 *
 * `claim: false` is for the stale-scan sweep only: its UPDATE ... RETURNING
 * already hands each scan over once, and a scan the sweep caught that was
 * only slow must still be able to claim and announce its completion.
 */
export async function notifyAiDetectionScanFailed(
  scanId: number,
  organizationId: number,
  options: { claim?: boolean } = {},
): Promise<void> {
  try {
    const scan = await getScanByIdQuery(scanId, organizationId);
    if (!scan || scan.status !== "failed") return;
    if (
      options.claim !== false &&
      !(await claimScanNotificationQuery(scanId, organizationId, "failed"))
    ) {
      return;
    }

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

    // No language lookup here: the title and message are keys, which
    // sendInAppNotification translates with one lookup per recipient.
    await Promise.allSettled(
      recipients.map((recipient) =>
        isolated(`failed notice to user ${recipient.id}`, scanId, async () => {
          await sendInAppNotification(
            organizationId,
            {
              user_id: recipient.id,
              type: NotificationType.AI_DETECTION_SCAN_FAILED,
              titleKey: "Scan failed",
              messageKey: "Scan of {repository} failed: {reason}",
              messageVars: { repository: summary.repository, reason },
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
                    fired_at: formatUtcTimestamp(),
                    action_url: summary.url,
                  },
                }
              : undefined,
          );
        }),
      ),
    );

    await isolated("ai_detection_scan_failed automations", scanId, () =>
      runAutomations(organizationId, "ai_detection_scan_failed", summary),
    );
  } catch (error) {
    logger.error(
      `[ai-detection] failed-scan notifications failed for scan ${scanId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
