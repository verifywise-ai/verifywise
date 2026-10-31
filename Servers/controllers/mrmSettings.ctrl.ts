import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import { CustomException } from "../domain.layer/exceptions/custom.exception";
import {
  getMrmOrgSettings,
  lockMrmOrgSettings,
  MIN_RETENTION_MONTHS,
  upsertMrmOrgSettings,
} from "../utils/mrmSettings.utils";
import { sequelize } from "../database/db";
import {
  appendRetentionChangeToLedger,
  canChangeRetentionPeriods,
} from "../utils/retentionAudit.utils";
import {
  getAlertExtraRecipientsQuery,
  getOrgMemberIdsQuery,
  replaceAlertRecipientsQuery,
} from "../utils/mrmAlerts.utils";

const FILE = "mrmSettings.ctrl.ts";

function fail(req: Request, res: Response, fn: string, msg: string, error: unknown) {
  logStructured("error", msg, fn, FILE);
  logger.error(`❌ Error in ${fn}:`, error);
  const status = error instanceof CustomException ? error.statusCode : 500;
  if (status >= 500) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
  const body = (STATUS_CODE as any)[status]
    ? (STATUS_CODE as any)[status](translateError(req, error))
    : STATUS_CODE[400](translateError(req, error));
  return res.status(status).json(body);
}

export async function getMrmSettingsHandler(req: Request, res: Response) {
  const fn = "getMrmSettingsHandler";
  logStructured("processing", "fetching MRM settings", fn, FILE);
  try {
    const settings = await getMrmOrgSettings(req.organizationId!);
    const alert_recipients = await getAlertExtraRecipientsQuery(req.organizationId!);
    logStructured("successful", "MRM settings retrieved", fn, FILE);
    return res.status(200).json(STATUS_CODE[200]({ ...settings, alert_recipients }));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve MRM settings", error);
  }
}

export async function updateMrmSettingsHandler(req: Request, res: Response) {
  const fn = "updateMrmSettingsHandler";
  logStructured("processing", "updating MRM settings", fn, FILE);
  try {
    const body = req.body ?? {};
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

    // Retention is an organization-wide policy: only roles holding
    // organization.admin may change it. Alert fields keep their existing
    // permissions.
    if (
      has("retention_months") &&
      !(await canChangeRetentionPeriods(req.organizationId, req.role))
    ) {
      return res
        .status(403)
        .json(STATUS_CODE[403](req.t!("Only admins can change retention periods")));
    }

    // PARTIAL semantics: only fields present in the body are validated and
    // updated (RetentionSection PUTs only retention_months; AlertsSection
    // PUTs only its three fields).
    if (
      !has("retention_months") &&
      !has("alert_email_enabled") &&
      !has("breach_auto_open_finding") &&
      !has("alert_recipients")
    ) {
      return res.status(400).json(STATUS_CODE[400](req.t!("No settings provided")));
    }

    if (
      has("retention_months") &&
      (!Number.isInteger(body.retention_months) || body.retention_months < MIN_RETENTION_MONTHS)
    ) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Retention must be an integer of at least 13 months")));
    }
    if (has("alert_email_enabled") && typeof body.alert_email_enabled !== "boolean") {
      return res.status(400).json(STATUS_CODE[400](req.t!("Email alerts must be true or false")));
    }
    if (has("breach_auto_open_finding") && typeof body.breach_auto_open_finding !== "boolean") {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Auto-open finding must be true or false")));
    }

    let recipientIds: number[] | undefined;
    if (has("alert_recipients")) {
      if (
        !Array.isArray(body.alert_recipients) ||
        body.alert_recipients.some((id: unknown) => !Number.isInteger(id))
      ) {
        return res
          .status(400)
          .json(STATUS_CODE[400](req.t!("Alert recipients must be a list of user ids")));
      }
      recipientIds = Array.from(new Set(body.alert_recipients as number[]));
      const members = await getOrgMemberIdsQuery(req.organizationId!, recipientIds);
      if (members.length !== recipientIds.length) {
        return res
          .status(400)
          .json(STATUS_CODE[400](req.t!("Alert recipients must be users in your organization")));
      }
    }

    const transaction = await sequelize.transaction();
    let settings;
    let previousRetention: number | undefined;
    try {
      // Read the old period under a row lock in the same transaction, so a
      // concurrent save cannot make the ledger's "from" value stale.
      if (has("retention_months")) {
        previousRetention = (await lockMrmOrgSettings(req.organizationId!, transaction))
          .retention_months;
      }
      settings = await upsertMrmOrgSettings(
        req.organizationId!,
        {
          retention_months: has("retention_months") ? body.retention_months : undefined,
          alert_email_enabled: has("alert_email_enabled") ? body.alert_email_enabled : undefined,
          breach_auto_open_finding: has("breach_auto_open_finding")
            ? body.breach_auto_open_finding
            : undefined,
        },
        transaction,
      );
      if (recipientIds !== undefined) {
        await replaceAlertRecipientsQuery(req.organizationId!, recipientIds, transaction);
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    if (previousRetention !== undefined && previousRetention !== settings.retention_months) {
      await appendRetentionChangeToLedger({
        organizationId: req.organizationId!,
        userId: req.userId,
        description: `Model risk metric retention changed from ${previousRetention} to ${settings.retention_months} months`,
        functionName: fn,
        fileName: FILE,
      });
    }
    const alert_recipients = await getAlertExtraRecipientsQuery(req.organizationId!);
    logStructured("successful", "MRM settings updated", fn, FILE);
    return res.status(200).json(STATUS_CODE[200]({ ...settings, alert_recipients }));
  } catch (error) {
    return fail(req, res, fn, "failed to update MRM settings", error);
  }
}
