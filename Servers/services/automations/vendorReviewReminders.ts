import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { logStructuredError } from "../../utils/logger/fileLogger";
import { getAllOrganizationsQuery } from "../../utils/organization.utils";
import { getVendorByIdQuery } from "../../utils/vendor.utils";
import {
  buildVendorReplacements,
  formatVendorReviewDate,
} from "../../utils/automation/vendor.automation.utils";
import { replaceTemplateVariables } from "../../utils/automation/automation.utils";
import { enqueueAutomationAction } from "./automationProducer";
import { notifyVendorReviewDue } from "../inAppNotification.service";
import { addDays } from "../homeQueue/sources/dateOnly";
import {
  REVIEW_DATE,
  VENDOR_REVIEW_OPEN_CONDITION,
} from "../homeQueue/sources/vendorReviews.source";
import type { IVendor } from "../../domain.layer/interfaces/i.vendor";
import { frontendBaseUrl } from "../../utils/frontendUrl.utils";

/** One action of an active `vendor_review_date_approaching` automation. */
export interface ReminderActionRow {
  automation_id: number;
  automation_params: { daysBefore?: unknown } | null;
  action_key: string;
  params: { subject?: string; body?: string; [key: string]: unknown } | null;
}

/** Every action of every active review reminder automation, in run order. */
export const REMINDER_ACTIONS_SQL = `
  SELECT
    a.id AS automation_id,
    a.params AS automation_params,
    paa.key AS action_key,
    aa.params AS params
  FROM automation_triggers pat
  JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId
  JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId
  JOIN automation_actions paa ON aa.action_type_id = paa.id
  WHERE pat.key = 'vendor_review_date_approaching' AND a.is_active
  ORDER BY a.id ASC, aa."order" ASC`;

/**
 * Vendors whose review falls on `:reviewDate` (UTC day). A 'Reviewed' vendor
 * is dropped by the same rule as the Home queue: only once its review date
 * has passed. A reminder date is never before today, so the usual workflow
 * (mark Reviewed and set the next date in one save) still gets the next
 * cycle's reminder.
 */
export const VENDORS_DUE_ON_SQL = `
  SELECT v.id
  FROM vendors v
  WHERE v.organization_id = :organizationId
    AND v.review_date IS NOT NULL
    AND ${VENDOR_REVIEW_OPEN_CONDITION}
    AND ${REVIEW_DATE} = :reviewDate`;

/** Today's UTC day, as the Home queue reads it. */
const utcToday = (): string => new Date().toISOString().slice(0, 10);

/** Longest "days before" honoured: ten years. Anything larger is read as 0. */
export const MAX_DAYS_BEFORE = 3650;

/** The automation's "days before", or 0 when unset or not a whole number 0–3650. */
export const daysBefore = (params: ReminderActionRow["automation_params"]): number => {
  const value = Number(params?.daysBefore ?? 0);
  return Number.isInteger(value) && value >= 0 && value <= MAX_DAYS_BEFORE ? value : 0;
};

const FN = "sendVendorReviewDateNotification";
const FILE = "vendorReviewReminders.ts";

/** A due vendor with the reviewer's name the email template shows. */
const loadVendor = async (id: number, organizationId: number): Promise<IVendor | null> => {
  const vendor = await getVendorByIdQuery(id, organizationId);
  if (!vendor) return null;
  if (!vendor.reviewer) return { ...vendor, reviewer_name: "" } as IVendor;
  const [row] = await sequelize.query<{ full_name: string }>(
    `SELECT u.name || ' ' || u.surname AS full_name
       FROM users u
       JOIN organization_members m ON m.user_id = u.id AND m.organization_id = :organizationId
      WHERE u.id = :reviewer`,
    { replacements: { organizationId, reviewer: vendor.reviewer }, type: QueryTypes.SELECT },
  );
  return { ...vendor, reviewer_name: row?.full_name ?? "" } as IVendor;
};

/** Groups action rows by automation, keeping each automation's action order. */
const byAutomation = (rows: ReminderActionRow[]): ReminderActionRow[][] => {
  const groups = new Map<number, ReminderActionRow[]>();
  for (const row of rows) {
    const group = groups.get(row.automation_id) ?? [];
    group.push(row);
    groups.set(row.automation_id, group);
  }
  return [...groups.values()];
};

/**
 * Daily sweep for the "Vendor review date approaching" trigger. Nothing is
 * sent unless the organization has an active automation for it. For each
 * automation, a vendor whose review date is today plus its "days before" gets
 * every action of that automation, in order, and its reviewer (or assignee)
 * gets one in-app notice per run, however many automations match. A failing
 * organization, automation or vendor is logged and the sweep moves on.
 */
export async function sendVendorReviewDateNotification(): Promise<void> {
  const organizations = await getAllOrganizationsQuery();
  const today = utcToday();
  const baseUrl = frontendBaseUrl();

  for (const org of organizations) {
    const organizationId = org.id!;
    try {
      const rows = await sequelize.query<ReminderActionRow>(REMINDER_ACTIONS_SQL, {
        replacements: { organizationId },
        type: QueryTypes.SELECT,
      });
      if (rows.length === 0) continue;

      const loaded = new Map<number, IVendor | null>();
      const notified = new Set<number>();

      for (const actions of byAutomation(rows)) {
        const automationId = actions[0].automation_id;
        try {
          const due = await sequelize.query<{ id: number }>(VENDORS_DUE_ON_SQL, {
            replacements: {
              organizationId,
              today,
              reviewDate: addDays(today, daysBefore(actions[0].automation_params)),
            },
            type: QueryTypes.SELECT,
          });
          if (due.length === 0) continue;

          for (const { id } of due) {
            if (!loaded.has(id)) loaded.set(id, await loadVendor(id, organizationId));
            const vendor = loaded.get(id);
            if (!vendor) continue;
            try {
              const replacements = buildVendorReplacements(vendor);
              for (const action of actions) {
                const params = action.params ?? {};
                await enqueueAutomationAction(action.action_key, {
                  ...params,
                  subject: replaceTemplateVariables(params.subject || "", replacements),
                  body: replaceTemplateVariables(params.body || "", replacements),
                  automation_id: automationId,
                  organizationId,
                });
              }

              const recipient = vendor.reviewer || vendor.assignee;
              if (!recipient || notified.has(vendor.id!)) continue;
              notified.add(vendor.id!);
              try {
                await notifyVendorReviewDue(
                  organizationId,
                  recipient,
                  {
                    id: vendor.id!,
                    name: vendor.vendor_name,
                    reviewDate: formatVendorReviewDate(vendor.review_date),
                    reviewDay: vendor.review_date,
                    riskLevel:
                      vendor.risk_score != null ? `Score: ${vendor.risk_score}` : "Not assessed",
                    lastReviewDate: undefined,
                    projectCount: vendor.projects?.length || 0,
                  },
                  baseUrl,
                );
              } catch (error) {
                logStructuredError(
                  `Vendor review notice failed for vendor ${vendor.id}`,
                  error,
                  FN,
                  FILE,
                );
              }
            } catch (error) {
              logStructuredError(
                `Vendor review reminder automation ${automationId} failed for vendor ${id} in organization ${organizationId}`,
                error,
                FN,
                FILE,
              );
            }
          }
        } catch (error) {
          logStructuredError(
            `Vendor review reminder automation ${automationId} failed in organization ${organizationId}`,
            error,
            FN,
            FILE,
          );
        }
      }
    } catch (error) {
      logStructuredError(
        `Vendor review reminders failed for organization ${organizationId}`,
        error,
        FN,
        FILE,
      );
    }
  }
}
