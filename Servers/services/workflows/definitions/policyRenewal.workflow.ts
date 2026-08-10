/**
 * Phase 6 — Policy Renewal Workflow.
 *
 * Trigger: scheduled daily; for each policy whose next_review_date is within
 * 30 days, this workflow runs once per policy (per-policy fan-out is done by
 * the trigger; the workflow handles a single policy at a time).
 */

import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { sendInAppNotification } from "../../inAppNotification.service";
import {
  NotificationType,
  NotificationEntityType,
} from "../../../domain.layer/interfaces/i.notification";
import { WorkflowDefinition } from "../types";

const POLICY_RENEWAL_LEAD_DAYS = 30;

interface PolicyRow {
  id: number;
  title: string;
  status: string;
  next_review_date: string | null;
  author_id: number | null;
}

export const policyRenewalWorkflow: WorkflowDefinition = {
  id: "policy_renewal",
  name: "Policy Renewal",
  triggerName: "policy.due_date.minus_30d",
  agents: ["policy", "compliance"],
  steps: [
    {
      id: "fetch_policy",
      description: "Load policy details and ownership",
      agent: "policy",
      isWrite: false,
      handler: async (ctx) => {
        const trigger = ctx.triggerPayload as { policyId?: number };
        let policyId = trigger.policyId;
        // Manual run without explicit policyId — auto-pick the policy with the
        // earliest next_review_date so the workflow has something to renew.
        // Cron-based fanout still passes policyId explicitly per policy.
        if (!policyId) {
          const candidates = (await sequelize.query(
            `SELECT id
               FROM policy_manager
              WHERE organization_id = :orgId
                AND next_review_date IS NOT NULL
              ORDER BY next_review_date ASC
              LIMIT 1`,
            { replacements: { orgId: ctx.organizationId }, type: QueryTypes.SELECT },
          )) as Array<{ id: number }>;
          if (candidates.length === 0) {
            return {
              type: "skip",
              reason: "No policies with next_review_date set; nothing to renew",
            };
          }
          policyId = candidates[0].id;
        }

        const rows = (await sequelize.query(
          `SELECT id, title, status, next_review_date, author_id
             FROM policy_manager
            WHERE organization_id = :orgId AND id = :policyId
            LIMIT 1`,
          {
            replacements: { orgId: ctx.organizationId, policyId },
            type: QueryTypes.SELECT,
          },
        )) as PolicyRow[];
        if (rows.length === 0) {
          return { type: "fail", error: `Policy ${policyId} not found` };
        }
        return { type: "ok", output: rows[0] };
      },
    },
    {
      id: "check_eligibility",
      description: `Skip if review date is outside the ${POLICY_RENEWAL_LEAD_DAYS}-day window`,
      agent: "policy",
      isWrite: false,
      handler: async (ctx) => {
        const policy = ctx.results.fetch_policy as PolicyRow | undefined;
        if (!policy?.next_review_date) {
          return { type: "skip", reason: "Policy has no next_review_date set" };
        }
        const diffMs = new Date(policy.next_review_date).getTime() - Date.now();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > POLICY_RENEWAL_LEAD_DAYS || diffDays < 0) {
          return {
            type: "skip",
            reason: `Review date is ${diffDays.toFixed(1)} day(s) away (window: 0..${POLICY_RENEWAL_LEAD_DAYS})`,
          };
        }
        return { type: "ok", output: { lead_days: Math.floor(diffDays) } };
      },
    },
    {
      id: "notify_owner",
      description: "Send a renewal reminder to the policy author",
      agent: "policy",
      isWrite: false,
      handler: async (ctx) => {
        const policy = ctx.results.fetch_policy as PolicyRow | undefined;
        if (!policy?.author_id) {
          return { type: "skip", reason: "Policy has no author_id" };
        }
        await sendInAppNotification(ctx.organizationId, {
          user_id: policy.author_id,
          type: NotificationType.POLICY_DUE_SOON,
          title: `Policy renewal due: ${policy.title}`,
          message: `"${policy.title}" needs review by ${new Date(
            policy.next_review_date as string,
          ).toLocaleDateString("en-US")}.`,
          entity_type: NotificationEntityType.POLICY,
          entity_id: policy.id,
          entity_name: policy.title,
          metadata: { workflow_run_id: ctx.workflowRunId },
        });
        return { type: "ok", output: { notified: policy.author_id } };
      },
    },
    {
      id: "log_outcome",
      description: "Audit completion summary",
      agent: "compliance",
      isWrite: false,
      handler: async (ctx) => {
        const policy = ctx.results.fetch_policy as PolicyRow | undefined;
        const elig = ctx.results.check_eligibility as { lead_days?: number } | undefined;
        return {
          type: "ok",
          output: {
            policy_id: policy?.id,
            lead_days: elig?.lead_days,
          },
        };
      },
    },
  ],
};
