import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";
import { getAllOrganizationsQuery } from "../../utils/organization.utils";
import { getAllVendorsQuery } from "../../utils/vendor.utils";
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

/** The automation's "days before", or 0 when unset or not a whole number ≥ 0. */
export const daysBefore = (params: ReminderActionRow["automation_params"]): number => {
  const value = Number(params?.daysBefore ?? 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
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
 * organization or automation is logged and the sweep moves on.
 */
export async function sendVendorReviewDateNotification(): Promise<void> {
  const organizations = await getAllOrganizationsQuery();
  const today = utcToday();
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  for (const org of organizations) {
    const organizationId = org.id!;
    try {
      const rows = await sequelize.query<ReminderActionRow>(REMINDER_ACTIONS_SQL, {
        replacements: { organizationId },
        type: QueryTypes.SELECT,
      });
      if (rows.length === 0) continue;

      let vendors: IVendor[] | undefined;
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

          vendors ??= await getAllVendorsQuery(organizationId);
          const dueIds = new Set(due.map((row) => row.id));

          for (const vendor of vendors.filter((v) => dueIds.has(v.id!))) {
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
                  riskLevel:
                    vendor.risk_score != null ? `Score: ${vendor.risk_score}` : "Not assessed",
                  lastReviewDate: undefined,
                  projectCount: vendor.projects?.length || 0,
                },
                baseUrl,
              );
            } catch (error) {
              logger.error(`Vendor review notice failed for vendor ${vendor.id}:`, error);
            }
          }
        } catch (error) {
          logger.error(
            `Vendor review reminder automation ${automationId} failed in organization ${organizationId}:`,
            error,
          );
        }
      }
    } catch (error) {
      logger.error(`Vendor review reminders failed for organization ${organizationId}:`, error);
    }
  }
}
