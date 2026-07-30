/**
 * Phase 6 — Framework Gap Remediation Workflow.
 *
 * Trigger: compliance score below threshold (scheduled daily check + ad-hoc).
 * Identifies frameworks with low readiness, surfaces the weakest controls,
 * and notifies admins to drive remediation.
 */

import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { sendBulkInAppNotifications } from "../../inAppNotification.service";
import {
  NotificationType,
  NotificationEntityType,
} from "../../../domain.layer/interfaces/i.notification";
import { WorkflowDefinition } from "../types";

const READINESS_THRESHOLD = 70;
const MAX_WEAK_CONTROLS = 5;

/** A framework readiness row scanned by the first step. */
interface FrameworkScore {
  framework_type: string;
  avg_score: number;
}

/**
 * Get all admin users (role_id = 1) for an organization.
 */
async function getOrgAdmins(organizationId: number): Promise<Array<{ id: number }>> {
  const rows = (await sequelize.query(
    `SELECT id FROM users WHERE organization_id = :orgId AND role_id = 1`,
    {
      replacements: { orgId: organizationId },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ id: number }>;
  return rows.map((r) => ({ id: Number(r.id) }));
}

export const frameworkGapWorkflow: WorkflowDefinition = {
  id: "framework_gap_remediation",
  name: "Framework Gap Remediation",
  triggerName: "compliance.score.below_threshold",
  agents: ["compliance", "policy"],
  steps: [
    {
      id: "scan_frameworks",
      description: `Find frameworks with readiness below ${READINESS_THRESHOLD}`,
      agent: "compliance",
      isWrite: false,
      handler: async (ctx) => {
        const rows = (await sequelize.query(
          `SELECT framework_type, avg_score::int AS avg_score
             FROM framework_readiness_scores
            WHERE organization_id = :orgId
              AND project_id IS NULL
              AND avg_score < :threshold
            ORDER BY avg_score ASC`,
          {
            replacements: {
              orgId: ctx.organizationId,
              threshold: READINESS_THRESHOLD,
            },
            type: QueryTypes.SELECT,
          },
        )) as FrameworkScore[];
        return { type: "ok", output: rows };
      },
    },
    {
      id: "check_any_low",
      description: "Skip if no framework is below threshold",
      agent: "compliance",
      isWrite: false,
      handler: async (ctx) => {
        const frameworks = ctx.results.scan_frameworks as FrameworkScore[] | undefined;
        if (!frameworks || frameworks.length === 0) {
          return { type: "skip", reason: "All frameworks above threshold" };
        }
        return { type: "ok", output: { lowFrameworks: frameworks.length } };
      },
    },
    {
      id: "fetch_weakest_controls",
      description: `Identify the ${MAX_WEAK_CONTROLS} lowest-scoring controls`,
      agent: "compliance",
      isWrite: false,
      handler: async (ctx) => {
        const rows = await sequelize.query(
          `SELECT framework_type,
                  control_id,
                  overall_score::int AS score,
                  readiness_level    AS level
             FROM control_readiness_scores
            WHERE organization_id = :orgId
              AND project_id IS NULL
            ORDER BY overall_score ASC
            LIMIT :limit`,
          {
            replacements: {
              orgId: ctx.organizationId,
              limit: MAX_WEAK_CONTROLS,
            },
            type: QueryTypes.SELECT,
          },
        );
        return { type: "ok", output: rows };
      },
    },
    {
      id: "notify_admins",
      description: "Notify admins with the gap report",
      agent: "compliance",
      isWrite: false,
      handler: async (ctx) => {
        const admins = await getOrgAdmins(ctx.organizationId);
        if (admins.length === 0) {
          return { type: "skip", reason: "No admins in organization" };
        }
        const frameworks = ctx.results.scan_frameworks as FrameworkScore[];
        const summary = frameworks.map((f) => `${f.framework_type}: ${f.avg_score}%`).join(", ");
        await sendBulkInAppNotifications(ctx.organizationId, {
          user_ids: admins.map((a) => a.id),
          type: NotificationType.SYSTEM,
          title: "Framework gap remediation needed",
          message: `Frameworks below ${READINESS_THRESHOLD}%: ${summary}.`,
          entity_type: NotificationEntityType.ASSESSMENT,
          metadata: { workflow_run_id: ctx.workflowRunId },
        });
        return { type: "ok", output: { notified_admins: admins.length } };
      },
    },
  ],
};
