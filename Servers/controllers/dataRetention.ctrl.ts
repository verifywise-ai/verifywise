/**
 * Data retention controller
 *
 * One read-only overview of how long each kind of record is kept, plus the
 * Admin-only setting for audit record retention. Other retention periods are
 * edited where they already live (MRM, evidence, Shadow AI, AI Gateway).
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import { translateError } from "../utils/i18n.utils";
import {
  AUDIT_RETENTION_MONTHS,
  RetentionRecordType,
  countAuditRecordsBefore,
  getAuditRetentionMonths,
  getLatestRetentionRuns,
  setAuditRetentionMonths,
} from "../utils/dataRetention.utils";
import { getLatestLedgerCheckpoint } from "../utils/auditLedgerRetention.utils";
import { appendRetentionChangeToLedger } from "../utils/retentionAudit.utils";
import { aiGatewayRequest } from "../utils/aiGatewayInternal.utils";
import { getMrmOrgSettings } from "../utils/mrmSettings.utils";
import { getFileOrgSettings } from "../utils/fileOrgSettings.utils";
import { getSettingsQuery as getShadowAiSettings } from "../utils/shadowAiConfig.utils";
import { getServerLogRetentionDays } from "../utils/logger/logRetention";
import logger from "../utils/logger/fileLogger";
import {
  GATEWAY_DEFAULTS,
  GatewayPurgeRefusal,
  gatewayPurgeRefusalFromRun,
} from "../utils/aiGatewayRetention.constants";

const FILE_NAME = "dataRetention.ctrl.ts";

export type RetentionRecordKey =
  | "audit_records"
  | "ai_gateway_guardrail_logs"
  | "ai_gateway_spend_logs"
  | "agent_control_logs"
  | "mrm_metrics"
  | "evidence_files"
  | "shadow_ai_events"
  | "shadow_ai_daily_rollups"
  | "shadow_ai_alert_history"
  | "server_logs";

export interface RetentionRow {
  key: RetentionRecordKey;
  /** null means kept indefinitely. */
  period:
    { unit: "months" | "days"; value: number } | { unit: "policy"; value: string | null } | null;
  automaticDeletion: "yes" | "no" | "archive" | "rotate";
  lastCleanup: {
    ranAt: string;
    deletedCount: number;
    status: "success" | "capped" | "failed";
    /** Set when the AI Gateway refused the purge over the internal key. */
    refusal?: GatewayPurgeRefusal;
  } | null;
  source: "app" | "deployment";
  /** Environment variable that controls the period when source is "deployment". */
  deploymentSetting?: string;
  /** The source (AI Gateway, or a module's settings) could not be read, so the values are unknown. */
  unavailable?: boolean;
  /** Agent Control: the organization has no own period, so the deployment default applies. */
  usesDeploymentDefault?: boolean;
  /** Agent Control: the deployment default in days (0 or less = kept indefinitely). */
  deploymentDefaultDays?: number;
  /** Agent Control: the shortest period an organization may set. */
  minDays?: number;
}

function daysPeriod(days: number): RetentionRow["period"] {
  return days > 0 ? { unit: "days", value: days } : null;
}

async function safeGateway(req: Request, path: string): Promise<any | null> {
  try {
    return await aiGatewayRequest("GET", path, {
      organizationId: req.organizationId!,
      role: req.role,
    });
  } catch (error) {
    logger.warn(`AI Gateway request ${path} failed: ${(error as Error)?.message ?? error}`);
    return null;
  }
}

/**
 * Read one module's settings for the overview. A failure is logged and
 * returns null, so that row shows as unavailable instead of failing the page.
 */
async function softRead<T>(source: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    logger.warn(
      `Reading ${source} settings for the data retention overview failed: ${(error as Error)?.message ?? error}`,
    );
    return null;
  }
}

export async function getDataRetention(req: Request, res: Response): Promise<any> {
  const fn = "getDataRetention";
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "fetching data retention overview",
    functionName: fn,
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const [
      auditMonths,
      runs,
      checkpoint,
      mrm,
      fileSettings,
      shadowAi,
      guardrailSettings,
      retentionConfig,
    ] = await Promise.all([
      getAuditRetentionMonths(organizationId),
      getLatestRetentionRuns(organizationId),
      getLatestLedgerCheckpoint(organizationId),
      softRead("MRM", () => getMrmOrgSettings(organizationId)),
      softRead("evidence file", () => getFileOrgSettings(organizationId)),
      softRead("Shadow AI", () => getShadowAiSettings(organizationId)),
      safeGateway(req, "/internal/guardrails/settings"),
      safeGateway(req, "/internal/retention/config"),
    ]);

    const lastCleanup = (type: RetentionRecordType): RetentionRow["lastCleanup"] => {
      const run = runs[type];
      if (!run) return null;
      const refusal = run.status === "failed" ? gatewayPurgeRefusalFromRun(run) : null;
      return {
        ranAt: run.ran_at,
        deletedCount: run.deleted_count,
        status: run.status,
        ...(refusal ? { refusal } : {}),
      };
    };

    const gatewayUnavailable = guardrailSettings === null;
    const gatewaySettings = guardrailSettings?.settings ?? {};
    const guardrailDays = Number(
      gatewaySettings.log_retention_days ?? GATEWAY_DEFAULTS.log_retention_days,
    );
    const spendDays = Number(
      gatewaySettings.spend_log_retention_days ?? GATEWAY_DEFAULTS.spend_log_retention_days,
    );
    const autoPurge = gatewaySettings.auto_purge_enabled === true;

    const deploymentAgentDays =
      typeof retentionConfig?.mcp_audit_retention_days === "number"
        ? retentionConfig.mcp_audit_retention_days
        : null;
    const agentMinDays =
      typeof retentionConfig?.mcp_audit_retention_min_days === "number"
        ? retentionConfig.mcp_audit_retention_min_days
        : null;
    const ownAgentDays =
      typeof gatewaySettings.mcp_audit_retention_days === "number"
        ? gatewaySettings.mcp_audit_retention_days
        : null;
    // An older gateway reports no floor and cannot store a period: show the
    // row as unavailable rather than offer an edit it would reject.
    const agentUnavailable =
      gatewayUnavailable || deploymentAgentDays === null || agentMinDays === null;
    // The effective period the cleanup applies: an organization's own period
    // is raised to the floor; the deployment default never is.
    const agentDays =
      ownAgentDays !== null
        ? Math.max(ownAgentDays, agentMinDays ?? 0)
        : (deploymentAgentDays ?? 0);

    /** A row whose settings could not be read: shown as unavailable. */
    const unavailableRow = (
      key: RetentionRecordKey,
      type: RetentionRecordType | null,
    ): RetentionRow => ({
      key,
      period: null,
      automaticDeletion: "no",
      lastCleanup: type ? lastCleanup(type) : null,
      source: "app",
      unavailable: true,
    });

    const shadowRow = (
      key: RetentionRecordKey & RetentionRecordType,
      setting:
        "retention_events_days" | "retention_daily_rollups_days" | "retention_alert_history_days",
    ): RetentionRow => {
      if (!shadowAi) return unavailableRow(key, key);
      const days = Number(shadowAi[setting]);
      return {
        key,
        period: daysPeriod(days),
        automaticDeletion: days > 0 ? "yes" : "no",
        lastCleanup: lastCleanup(key),
        source: "app",
      };
    };

    const rows: RetentionRow[] = [
      {
        key: "audit_records",
        period: auditMonths ? { unit: "months", value: auditMonths } : null,
        automaticDeletion: auditMonths ? "yes" : "no",
        lastCleanup: lastCleanup("audit_records"),
        source: "app",
      },
      {
        key: "ai_gateway_guardrail_logs",
        period: gatewayUnavailable ? null : daysPeriod(guardrailDays),
        automaticDeletion: autoPurge ? "yes" : "no",
        lastCleanup: lastCleanup("ai_gateway_guardrail_logs"),
        source: "app",
        ...(gatewayUnavailable ? { unavailable: true } : {}),
      },
      {
        key: "ai_gateway_spend_logs",
        period: gatewayUnavailable ? null : daysPeriod(spendDays),
        automaticDeletion: autoPurge ? "yes" : "no",
        lastCleanup: lastCleanup("ai_gateway_spend_logs"),
        source: "app",
        ...(gatewayUnavailable ? { unavailable: true } : {}),
      },
      agentUnavailable
        ? unavailableRow("agent_control_logs", null)
        : {
            key: "agent_control_logs",
            period: daysPeriod(agentDays),
            automaticDeletion: agentDays > 0 ? "yes" : "no",
            lastCleanup: null,
            source: "app",
            usesDeploymentDefault: ownAgentDays === null,
            deploymentDefaultDays: deploymentAgentDays as number,
            minDays: agentMinDays as number,
          },
      mrm
        ? {
            key: "mrm_metrics",
            period: { unit: "months", value: mrm.retention_months },
            automaticDeletion: "yes",
            lastCleanup: lastCleanup("mrm_metrics"),
            source: "app",
          }
        : unavailableRow("mrm_metrics", "mrm_metrics"),
      fileSettings
        ? {
            key: "evidence_files",
            period: { unit: "policy", value: fileSettings.default_retention_policy },
            automaticDeletion: "archive",
            lastCleanup: null,
            source: "app",
          }
        : unavailableRow("evidence_files", null),
      shadowRow("shadow_ai_events", "retention_events_days"),
      shadowRow("shadow_ai_daily_rollups", "retention_daily_rollups_days"),
      shadowRow("shadow_ai_alert_history", "retention_alert_history_days"),
      {
        key: "server_logs",
        period: { unit: "days", value: getServerLogRetentionDays() },
        automaticDeletion: "rotate",
        lastCleanup: null,
        source: "deployment",
        deploymentSetting: "LOG_RETENTION_DAYS",
      },
    ];

    await logSuccess({
      eventType: "Read",
      description: "data retention overview fetched",
      functionName: fn,
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        rows,
        auditPrunedThrough: checkpoint ? { cutoff: checkpoint.cutoff } : null,
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to fetch data retention overview",
      functionName: fn,
      fileName: FILE_NAME,
      userId,
      organizationId,
      error: error as Error,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function previewAuditRetention(req: Request, res: Response): Promise<any> {
  const fn = "previewAuditRetention";
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  try {
    const months = Number(req.query.months);
    if (!(AUDIT_RETENTION_MONTHS as readonly number[]).includes(months)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid retention period")));
    }

    const count = await countAuditRecordsBefore(organizationId, months);

    await logSuccess({
      eventType: "Read",
      description: `previewed audit record retention of ${months} months`,
      functionName: fn,
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res.status(200).json(STATUS_CODE[200]({ count }));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to preview audit record retention",
      functionName: fn,
      fileName: FILE_NAME,
      userId,
      organizationId,
      error: error as Error,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function updateAuditRetention(req: Request, res: Response): Promise<any> {
  const fn = "updateAuditRetention";
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  try {
    const body = req.body ?? {};
    const months: unknown = body.months;
    const valid =
      months === null || (AUDIT_RETENTION_MONTHS as readonly unknown[]).includes(months);
    if (!Object.prototype.hasOwnProperty.call(body, "months") || !valid) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid retention period")));
    }
    const newMonths = months as number | null;

    const oldMonths = await getAuditRetentionMonths(organizationId);
    // Saving the current period changes nothing, so it writes no ledger entry.
    if (oldMonths === newMonths) {
      return res.status(200).json(STATUS_CODE[200]({ months: newMonths }));
    }
    await setAuditRetentionMonths(organizationId, newMonths, userId);

    const label = (m: number | null) => (m === null ? "Indefinitely" : `${m} months`);
    await appendRetentionChangeToLedger({
      organizationId,
      userId,
      description: `Audit record retention changed from ${label(oldMonths)} to ${label(newMonths)}`,
      functionName: fn,
      fileName: FILE_NAME,
    });

    await logSuccess({
      eventType: "Update",
      description: `audit record retention set to ${label(newMonths)}`,
      functionName: fn,
      fileName: FILE_NAME,
      userId,
      organizationId,
    });

    return res.status(200).json(STATUS_CODE[200]({ months: newMonths }));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "failed to update audit record retention",
      functionName: fn,
      fileName: FILE_NAME,
      userId,
      organizationId,
      error: error as Error,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
